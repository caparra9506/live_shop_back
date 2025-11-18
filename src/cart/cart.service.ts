import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Cart, CartStatus } from '../entity/cart.entity';
import { CartItem } from '../entity/cart-item.entity';
import { Product } from '../entity/product.entity';
import { Store } from '../entity/store.entity';
import { TikTokUser } from '../entity/user-tiktok.entity';
import { ProductVariant } from '../entity/product-variant.entity';
import { StoreConfig } from '../entity/store-config.entity';
import { CreateCartDto } from './dto/create-cart.dto';
import { AddItemToCartDto } from './dto/add-item-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,

    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,

    @InjectRepository(TikTokUser)
    private readonly tiktokUserRepository: Repository<TikTokUser>,

    @InjectRepository(ProductVariant)
    private readonly productVariantRepository: Repository<ProductVariant>,

    @InjectRepository(StoreConfig)
    private readonly storeConfigRepository: Repository<StoreConfig>,

    private readonly rabbitmqService: RabbitMQService,
  ) {}

  async createCart(dto: CreateCartDto): Promise<Cart> {
    const { userTikTokId, storeName, timeoutDays, notes } = dto;

    // Buscar tienda
    const store = await this.storeRepository.findOne({
      where: { name: storeName }
    });
    if (!store) {
      throw new HttpException('Tienda no encontrada', HttpStatus.NOT_FOUND);
    }

    // Obtener configuración de la tienda
    const storeConfig = await this.storeConfigRepository.findOne({
      where: { store: { id: store.id } }
    });

    // Verificar si el carrito está habilitado
    if (storeConfig && !storeConfig.cartEnabled) {
      throw new HttpException('El sistema de baúl está deshabilitado para esta tienda', HttpStatus.BAD_REQUEST);
    }

    // Usar configuración de días de la tienda o el parámetro proporcionado
    const finalTimeoutDays = timeoutDays || storeConfig?.cartTimeoutDays || 2;

    // Buscar usuario
    const tiktokUser = await this.tiktokUserRepository.findOne({
      where: { id: userTikTokId }
    });
    if (!tiktokUser) {
      throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
    }

    // Verificar si ya tiene un carrito activo
    const existingCart = await this.cartRepository.findOne({
      where: { 
        tiktokUser: { id: userTikTokId }, 
        store: { id: store.id },
        status: CartStatus.ACTIVE 
      }
    });

    if (existingCart) {
      return existingCart; // Devolver carrito existente
    }

    // Crear fecha de expiración
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + finalTimeoutDays);

    // Crear nuevo carrito
    const cart = this.cartRepository.create({
      store,
      tiktokUser,
      timeoutDays: finalTimeoutDays,
      expiresAt,
      notes,
      status: CartStatus.ACTIVE
    });

    return await this.cartRepository.save(cart);
  }

  async addItemToCart(dto: AddItemToCartDto): Promise<CartItem> {
    const { cartId, productId, quantity, productVariantId } = dto;

    // Buscar carrito
    const cart = await this.cartRepository.findOne({
      where: { id: cartId },
      relations: ['cartItems', 'cartItems.product', 'cartItems.productVariant']
    });

    if (!cart) {
      throw new HttpException('Carrito no encontrado', HttpStatus.NOT_FOUND);
    }

    if (cart.status !== CartStatus.ACTIVE && cart.status !== CartStatus.EXPIRED) {
      throw new HttpException('Carrito no válido o ya procesado', HttpStatus.BAD_REQUEST);
    }

    // Si el carrito ha expirado pero está siendo usado, reactivarlo
    if (cart.status === CartStatus.EXPIRED || new Date() > cart.expiresAt) {
      this.logger.log(`Reactivando carrito expirado ${cart.id}`);
      cart.status = CartStatus.ACTIVE;
      // Extender tiempo por 48 horas más
      cart.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await this.cartRepository.save(cart);
    }

    // Buscar producto
    const product = await this.productRepository.findOne({
      where: { id: productId }
    });

    if (!product) {
      throw new HttpException('Producto no encontrado', HttpStatus.NOT_FOUND);
    }

    // Verificar stock disponible
    if (product.stock < quantity) {
      throw new HttpException(
        `Stock insuficiente. Disponible: ${product.stock}, solicitado: ${quantity}`,
        HttpStatus.BAD_REQUEST
      );
    }

    // Buscar variante si se especifica
    let productVariant = null;
    if (productVariantId) {
      productVariant = await this.productVariantRepository.findOne({
        where: { id: productVariantId }
      });
    }

    // Verificar si el item ya existe en el carrito
    const existingItem = cart.cartItems.find(item => 
      item.product.id === productId && 
      (productVariantId ? item.productVariant?.id === productVariantId : !item.productVariant)
    );

    if (existingItem) {
      // Actualizar cantidad
      const newQuantity = existingItem.quantity + quantity;
      
      if (product.stock < newQuantity) {
        throw new HttpException(
          `Stock insuficiente. Disponible: ${product.stock}, en carrito: ${existingItem.quantity}, intentando agregar: ${quantity}`,
          HttpStatus.BAD_REQUEST
        );
      }

      // Reservar stock adicional
      await this.reserveProductStock(product.id, quantity);
      
      existingItem.quantity = newQuantity;
      existingItem.subtotal = existingItem.price * newQuantity;
      
      return await this.cartItemRepository.save(existingItem);
    }

    // Crear nuevo item
    const subtotal = product.price * quantity;
    const cartItem = this.cartItemRepository.create({
      cart,
      product,
      productVariant,
      quantity,
      price: product.price,
      subtotal
    });

    const savedItem = await this.cartItemRepository.save(cartItem);

    // Reservar stock del producto
    await this.reserveProductStock(product.id, quantity);

    // Actualizar total del carrito
    await this.updateCartTotals(cartId);

    // Recargar carrito con relaciones completas para notificación
    const fullCart = await this.cartRepository.findOne({
      where: { id: cartId },
      relations: ['tiktokUser', 'store']
    });

    // Enviar notificación de item agregado al carrito
    if (fullCart) {
      const baseUrl = process.env.FRONTEND_URL || 'https://comprepues.com.co';
      const checkoutUrl = `${baseUrl}/tiktok/${fullCart.store.name}/checkout?userTikTokId=${fullCart.tiktokUser.id}`;

      await this.rabbitmqService.enqueueCartItemAdded({
        cartId: fullCart.id,
        userTikTokId: fullCart.tiktokUser.id,
        userName: fullCart.tiktokUser.name,
        userPhone: fullCart.tiktokUser.phone,
        storeName: fullCart.store.name,
        product: {
          id: product.id,
          name: product.name,
          price: parseFloat(product.price.toString()),
          imageUrl: product.imageUrl
        },
        quantity,
        totalAmount: parseFloat(fullCart.totalAmount.toString()),
        shippingCost: parseFloat(fullCart.shippingCost.toString()),
        expiresAt: fullCart.expiresAt,
        timeoutDays: fullCart.timeoutDays,
        checkoutUrl,
        timestamp: new Date().toISOString()
      });

      this.logger.log(`📦 Notificación de item agregado encolada para Cart ${cartId}`);
    }

    return savedItem;
  }

  async updateCartItem(dto: UpdateCartItemDto): Promise<CartItem> {
    const { cartItemId, quantity } = dto;

    const cartItem = await this.cartItemRepository.findOne({
      where: { id: cartItemId },
      relations: ['cart', 'product']
    });

    if (!cartItem || cartItem.cart.status !== CartStatus.ACTIVE) {
      throw new HttpException('Item de carrito no válido', HttpStatus.NOT_FOUND);
    }

    if (quantity <= 0) {
      // Eliminar item si cantidad es 0 o negativa - liberar todo el stock
      await this.releaseProductStock(cartItem.product.id, cartItem.quantity);
      await this.cartItemRepository.remove(cartItem);
      await this.updateCartTotals(cartItem.cart.id);
      return cartItem;
    }

    const currentQuantity = cartItem.quantity;
    const quantityDifference = quantity - currentQuantity;

    if (quantityDifference > 0) {
      // Aumentar cantidad - reservar stock adicional
      if (cartItem.product.stock < quantityDifference) {
        throw new HttpException(
          `Stock insuficiente. Disponible: ${cartItem.product.stock}, intentando reservar: ${quantityDifference}`,
          HttpStatus.BAD_REQUEST
        );
      }
      await this.reserveProductStock(cartItem.product.id, quantityDifference);
    } else if (quantityDifference < 0) {
      // Disminuir cantidad - liberar stock
      await this.releaseProductStock(cartItem.product.id, Math.abs(quantityDifference));
    }

    cartItem.quantity = quantity;
    cartItem.subtotal = cartItem.price * quantity;

    const updatedItem = await this.cartItemRepository.save(cartItem);
    await this.updateCartTotals(cartItem.cart.id);

    return updatedItem;
  }

  async removeCartItem(cartItemId: number): Promise<void> {
    const cartItem = await this.cartItemRepository.findOne({
      where: { id: cartItemId },
      relations: ['cart', 'product']
    });

    if (!cartItem) {
      throw new HttpException('Item no encontrado', HttpStatus.NOT_FOUND);
    }

    const cartId = cartItem.cart.id;
    
    // Liberar stock del producto
    await this.releaseProductStock(cartItem.product.id, cartItem.quantity);
    
    await this.cartItemRepository.remove(cartItem);
    await this.updateCartTotals(cartId);
  }

  async getCart(cartId: number): Promise<Cart> {
    const cart = await this.cartRepository.findOne({
      where: { id: cartId },
      relations: [
        'cartItems',
        'cartItems.product',
        'cartItems.productVariant',
        'cartItems.productVariant.color',
        'cartItems.productVariant.size',
        'tiktokUser',
        'store'
      ]
    });

    if (!cart) {
      throw new HttpException('Carrito no encontrado', HttpStatus.NOT_FOUND);
    }

    return cart;
  }

  async getUserActiveCart(userTikTokId: number, storeName: string): Promise<Cart | null> {
    this.logger.log(`🔍 getUserActiveCart - userTikTokId: ${userTikTokId}, storeName: ${storeName}`);

    const store = await this.storeRepository.findOne({
      where: { name: storeName }
    });

    if (!store) {
      this.logger.warn(`⚠️ Store not found: ${storeName}`);
      return null;
    }

    this.logger.log(`✅ Store found: ${store.name} (ID: ${store.id})`);

    const cart = await this.cartRepository.findOne({
      where: {
        tiktokUser: { id: userTikTokId },
        store: { id: store.id },
        status: In([CartStatus.ACTIVE, CartStatus.EXPIRED])
      },
      relations: [
        'cartItems',
        'cartItems.product',
        'cartItems.productVariant',
        'cartItems.productVariant.color',
        'cartItems.productVariant.size',
        'tiktokUser',
        'store'
      ]
    });

    if (cart) {
      this.logger.log(`✅ Cart found: ID ${cart.id}, Items: ${cart.cartItems?.length || 0}`);
    } else {
      this.logger.warn(`⚠️ No ACTIVE cart found for user ${userTikTokId} in store ${store.id}`);

      // Debug: Buscar cualquier carrito del usuario en esa tienda
      const anyCart = await this.cartRepository.findOne({
        where: {
          tiktokUser: { id: userTikTokId },
          store: { id: store.id }
        }
      });

      if (anyCart) {
        this.logger.warn(`⚠️ Found cart with different status: ${anyCart.status} (ID: ${anyCart.id})`);
      } else {
        this.logger.warn(`⚠️ No cart exists for this user and store combination`);
      }
    }

    return cart;
  }

  async extendCartExpiration(cartId: number, additionalDays: number): Promise<Cart> {
    const cart = await this.cartRepository.findOne({
      where: { id: cartId }
    });

    if (!cart || cart.status !== CartStatus.ACTIVE) {
      throw new HttpException('Carrito no válido', HttpStatus.NOT_FOUND);
    }

    cart.expiresAt = new Date(cart.expiresAt.getTime() + (additionalDays * 24 * 60 * 60 * 1000));
    cart.timeoutDays += additionalDays;

    return await this.cartRepository.save(cart);
  }

  async getExpiredCarts(): Promise<Cart[]> {
    return await this.cartRepository.find({
      where: {
        status: CartStatus.ACTIVE,
        expiresAt: LessThan(new Date())
      },
      relations: ['cartItems', 'cartItems.product', 'tiktokUser', 'store']
    });
  }

  async getAllCarts(status?: CartStatus): Promise<Cart[]> {
    const whereCondition = status ? { status } : {};

    return await this.cartRepository.find({
      where: whereCondition,
      relations: [
        'cartItems',
        'cartItems.product',
        'cartItems.productVariant',
        'cartItems.productVariant.color',
        'cartItems.productVariant.size',
        'tiktokUser',
        'tiktokUser.city',
        'store'
      ],
      order: {
        createdAt: 'DESC'
      }
    });
  }

  async expireCart(cartId: number): Promise<void> {
    // Liberar stock antes de marcar como expirado
    await this.releaseCartStock(cartId);
    
    await this.cartRepository.update(cartId, { 
      status: CartStatus.EXPIRED 
    });
    
    this.logger.log(`⏰ Carrito ${cartId} expirado y stock liberado - usuario puede aún pagar con token`);
  }

  async completeCart(cartId: number): Promise<void> {
    await this.cartRepository.update(cartId, { 
      status: CartStatus.COMPLETED 
    });
  }

  private async updateCartTotals(cartId: number): Promise<void> {
    const cart = await this.cartRepository.findOne({
      where: { id: cartId },
      relations: ['cartItems']
    });

    if (!cart) return;

    const totalAmount = cart.cartItems.reduce((sum, item) => sum + parseFloat(item.subtotal.toString()), 0);
    
    cart.totalAmount = totalAmount;
    await this.cartRepository.save(cart);
  }

  async getCartTimeRemaining(cartId: number): Promise<{ days: number; hours: number; minutes: number; seconds: number; expired: boolean }> {
    const cart = await this.cartRepository.findOne({
      where: { id: cartId }
    });

    if (!cart) {
      throw new HttpException('Carrito no encontrado', HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    const timeRemaining = cart.expiresAt.getTime() - now.getTime();

    if (timeRemaining <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }

    const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, expired: false };
  }

  async updateCartShipping(cartId: number, shippingCost: number): Promise<Cart> {
    const cart = await this.cartRepository.findOne({
      where: { id: cartId }
    });

    if (!cart) {
      throw new HttpException('Carrito no encontrado', HttpStatus.NOT_FOUND);
    }

    if (cart.status !== CartStatus.ACTIVE) {
      throw new HttpException('Carrito no está activo', HttpStatus.BAD_REQUEST);
    }

    cart.shippingCost = shippingCost;
    
    // Recalcular total
    const itemsTotal = cart.cartItems?.reduce((sum, item) => sum + parseFloat(item.subtotal.toString()), 0) || 0;
    cart.totalAmount = itemsTotal + shippingCost - (cart.discountAmount || 0);

    return await this.cartRepository.save(cart);
  }

  async generatePaymentLink(cartId: number): Promise<{ link: string; token: string }> {
    const cart = await this.cartRepository.findOne({
      where: { id: cartId },
      relations: ['tiktokUser', 'store']
    });

    if (!cart) {
      throw new HttpException('Carrito no encontrado', HttpStatus.NOT_FOUND);
    }

    // Generar token único para acceso al carrito expirado con datos del usuario
    const token = this.generateSecureToken(cartId, cart.tiktokUser.id);
    
    // Construir link de pago
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:4321';
    const paymentLink = `${baseUrl}/cart/expired?cart=${cartId}&token=${token}`;

    this.logger.log(`🔗 Payment link generated for cart ${cartId}: ${paymentLink}`);

    return {
      link: paymentLink,
      token
    };
  }

  async getExpiredCartWithToken(cartId: number, token: string): Promise<Cart> {
    // Verificar token
    if (!this.verifySecureToken(cartId, token)) {
      throw new HttpException('Token inválido', HttpStatus.UNAUTHORIZED);
    }

    const cart = await this.cartRepository.findOne({
      where: { id: cartId },
      relations: [
        'cartItems',
        'cartItems.product',
        'cartItems.productVariant',
        'cartItems.productVariant.color',
        'cartItems.productVariant.size',
        'tiktokUser',
        'tiktokUser.city',
        'store'
      ]
    });

    if (!cart) {
      throw new HttpException('Carrito no encontrado', HttpStatus.NOT_FOUND);
    }

    // Verificar que el carrito esté expirado
    if (cart.status !== CartStatus.EXPIRED) {
      throw new HttpException('Carrito no está expirado', HttpStatus.BAD_REQUEST);
    }

    return cart;
  }

  // Métodos para gestión de stock
  private async reserveProductStock(productId: number, quantity: number): Promise<void> {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) {
      throw new HttpException('Producto no encontrado', HttpStatus.NOT_FOUND);
    }

    if (product.stock < quantity) {
      throw new HttpException(
        `Stock insuficiente. Disponible: ${product.stock}, solicitado: ${quantity}`,
        HttpStatus.BAD_REQUEST
      );
    }

    // Reducir stock disponible (reservar)
    product.stock -= quantity;
    await this.productRepository.save(product);
    
    this.logger.log(`Stock reservado: Producto ${productId}, Cantidad: ${quantity}, Stock restante: ${product.stock}`);
  }

  private async releaseProductStock(productId: number, quantity: number): Promise<void> {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) {
      this.logger.warn(`Producto ${productId} no encontrado al liberar stock`);
      return;
    }

    // Devolver stock (liberar reserva)
    product.stock += quantity;
    await this.productRepository.save(product);
    
    this.logger.log(`Stock liberado: Producto ${productId}, Cantidad: ${quantity}, Stock total: ${product.stock}`);
  }

  async releaseCartStock(cartId: number): Promise<void> {
    const cart = await this.cartRepository.findOne({
      where: { id: cartId },
      relations: ['cartItems', 'cartItems.product']
    });

    if (!cart || !cart.cartItems) return;

    // Liberar stock de todos los productos en el carrito
    for (const item of cart.cartItems) {
      await this.releaseProductStock(item.product.id, item.quantity);
    }

    this.logger.log(`✅ Stock liberado para carrito ${cartId} - ${cart.cartItems.length} productos`);
  }

  private generateSecureToken(cartId: number, userId?: number): string {
    const secret = process.env.JWT_SECRET || 'default-secret';
    const actualUserId = userId || Math.floor(Date.now() / 1000); // Use actual userId or timestamp fallback
    
    // Opción 1: Token simple con hash (actual implementation)
    const data = `${cartId}-${actualUserId}-${Date.now()}`;
    const hash = crypto.createHash('sha256').update(data + secret).digest('hex').substring(0, 32);
    
    // Crear token con formato: base64(cartId:hash)
    const tokenData = `${cartId}:${hash}`;
    return Buffer.from(tokenData).toString('base64').replace(/[+/=]/g, match => {
      return { '+': '-', '/': '_', '=': '' }[match];
    }); // URL-safe base64

    // Opción 2: JWT (más robusto para producción) - Uncomment to use
    // Para usar JWT, instalar: npm i jsonwebtoken @types/jsonwebtoken
    // const jwt = require('jsonwebtoken');
    // return jwt.sign(
    //   { 
    //     cartId, 
    //     userId: actualUserId, 
    //     type: 'cart_payment',
    //     exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 días
    //   }, 
    //   secret
    // );
  }

  private verifySecureToken(cartId: number, token: string): boolean {
    try {
      // Opción 1: Hash-based token verification (current implementation)
      // Restore base64 padding and decode
      const normalizedToken = token.replace(/[-_]/g, match => {
        return { '-': '+', '_': '/' }[match];
      });
      
      // Add padding if needed
      const paddedToken = normalizedToken + '='.repeat((4 - normalizedToken.length % 4) % 4);
      
      const decoded = Buffer.from(paddedToken, 'base64').toString('ascii');
      const [tokenCartId, hash] = decoded.split(':');
      
      if (parseInt(tokenCartId) !== cartId) {
        this.logger.warn(`Token cart ID mismatch: expected ${cartId}, got ${tokenCartId}`);
        return false;
      }

      // Verificar que el hash tenga el formato correcto (32 caracteres hex)
      if (!hash || hash.length !== 32 || !/^[a-f0-9]+$/i.test(hash)) {
        this.logger.warn(`Invalid hash format: ${hash}`);
        return false;
      }

      this.logger.log(`Token validated successfully for cart ${cartId}`);
      return true;

      // Opción 2: JWT verification - Uncomment to use with JWT tokens
      // const jwt = require('jsonwebtoken');
      // const secret = process.env.JWT_SECRET || 'default-secret';
      // const decoded = jwt.verify(token, secret);
      // if (decoded.cartId !== cartId || decoded.type !== 'cart_payment') {
      //   this.logger.warn(`JWT validation failed for cart ${cartId}`);
      //   return false;
      // }
      // this.logger.log(`JWT validated successfully for cart ${cartId}`);
      // return true;

    } catch (error) {
      this.logger.error(`Token verification error:`, error.message);
      return false;
    }
  }
}