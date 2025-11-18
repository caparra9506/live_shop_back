import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CartService } from './cart.service';
import { SalesService } from '../sale/sale.service';
import { Cart, CartStatus } from '../entity/cart.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import axios from 'axios';

@Injectable()
export class CartSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CartSchedulerService.name);
  private processInterval: NodeJS.Timeout;

  constructor(
    private readonly cartService: CartService,
    private readonly salesService: SalesService,
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    private readonly rabbitmqService: RabbitMQService,
  ) {}

  onModuleInit() {
    // Iniciar el procesamiento automático cada 5 minutos
    this.processInterval = setInterval(async () => {
      await this.processExpiredCarts();
    }, 5 * 60 * 1000); // 5 minutos

    this.logger.log('🚀 Cart Scheduler iniciado - procesando cada 5 minutos');
  }

  async processExpiredCarts() {
    this.logger.log('🕐 Procesando carritos expirados...');
    
    try {
      const expiredCarts = await this.cartService.getExpiredCarts();
      
      if (expiredCarts.length === 0) {
        this.logger.log('✅ No hay carritos expirados para procesar');
        return;
      }

      this.logger.log(`📦 Encontrados ${expiredCarts.length} carritos expirados`);

      for (const cart of expiredCarts) {
        try {
          await this.processExpiredCart(cart);
        } catch (error) {
          this.logger.error(`❌ Error procesando carrito ${cart.id}:`, error.message);
        }
      }
    } catch (error) {
      this.logger.error('❌ Error en procesamiento de carritos expirados:', error.message);
    }
  }

  private async processExpiredCart(cart: Cart): Promise<void> {
    this.logger.log(`⏰ Procesando carrito expirado ${cart.id} del usuario ${cart.tiktokUser.name}`);

    try {
      // Verificar si el carrito tiene items
      if (!cart.cartItems || cart.cartItems.length === 0) {
        this.logger.log(`📭 Carrito ${cart.id} está vacío, marcando como expirado`);
        await this.cartService.expireCart(cart.id);
        return;
      }

      // Verificar si hay stock suficiente para todos los productos
      let hasStockIssues = false;
      const stockCheckResults = [];

      for (const item of cart.cartItems) {
        if (item.product.stock < item.quantity) {
          hasStockIssues = true;
          stockCheckResults.push({
            productName: item.product.name,
            requested: item.quantity,
            available: item.product.stock
          });
        }
      }

      if (hasStockIssues) {
        this.logger.warn(`⚠️ Carrito ${cart.id} tiene problemas de stock:`, stockCheckResults);
        await this.cartService.expireCart(cart.id);
        // TODO: Enviar notificación al usuario sobre productos sin stock
        return;
      }

      // Enviar carrito expirado a RabbitMQ para notificar al usuario
      await this.sendCartExpiredNotification(cart);

    } catch (error) {
      this.logger.error(`❌ Error procesando carrito ${cart.id}:`, error.message);
      await this.cartService.expireCart(cart.id);
    }
  }

  private async sendCartExpiredNotification(cart: Cart): Promise<void> {
    this.logger.log(`🌐 Encolando notificación de carrito expirado ${cart.id} para enviar link de pago`);

    try {
      // Generar link de pago único
      const paymentLinkData = await this.cartService.generatePaymentLink(cart.id);

      // Encolar notificación de carrito expirado
      await this.rabbitmqService.enqueueCartExpired({
        cartId: cart.id,
        userTikTokId: cart.tiktokUser.id,
        userName: cart.tiktokUser.name,
        userPhone: cart.tiktokUser.phone,
        userEmail: cart.tiktokUser.email || '',
        storeName: cart.store.name,
        totalAmount: parseFloat(cart.totalAmount.toString()),
        shippingCost: parseFloat(cart.shippingCost.toString()),
        itemsCount: cart.cartItems.length,
        paymentLink: paymentLinkData.link,
        expiresAt: cart.expiresAt,
        createdAt: cart.createdAt,
        timestamp: new Date().toISOString()
      });

      this.logger.log(`✅ Notificación de carrito expirado encolada para carrito ${cart.id}`);

      // Marcar carrito como expirado (no completado, porque aún no se ha pagado)
      await this.cartService.expireCart(cart.id);

    } catch (error) {
      this.logger.error(`❌ Error encolando notificación de carrito expirado ${cart.id}:`, error.message);

      // Si falla el enqueue, mantener el carrito como expirado
      await this.cartService.expireCart(cart.id);

      throw error;
    }
  }

  async sendExpirationWarnings() {
    this.logger.log('⚠️ Enviando alertas de expiración próxima...');
    
    try {
      // Buscar carritos que expiran en las próximas 2 horas
      const twoHoursFromNow = new Date();
      twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2);

      const oneHourFromNow = new Date();
      oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

      const cartsExpiringInTwoHours = await this.cartRepository
        .createQueryBuilder('cart')
        .innerJoinAndSelect('cart.tiktokUser', 'user')
        .innerJoinAndSelect('cart.store', 'store')
        .leftJoinAndSelect('cart.cartItems', 'items')
        .where('cart.status = :status', { status: CartStatus.ACTIVE })
        .andWhere('cart.expiresAt <= :twoHours', { twoHours: twoHoursFromNow })
        .andWhere('cart.expiresAt > :oneHour', { oneHour: oneHourFromNow })
        .getMany();

      const cartsExpiringInOneHour = await this.cartRepository
        .createQueryBuilder('cart')
        .innerJoinAndSelect('cart.tiktokUser', 'user')
        .innerJoinAndSelect('cart.store', 'store')
        .leftJoinAndSelect('cart.cartItems', 'items')
        .where('cart.status = :status', { status: CartStatus.ACTIVE })
        .andWhere('cart.expiresAt <= :oneHour', { oneHour: oneHourFromNow })
        .andWhere('cart.expiresAt > :now', { now: new Date() })
        .getMany();

      // Enviar notificaciones de 2 horas
      for (const cart of cartsExpiringInTwoHours) {
        this.logger.log(`⏰ Enviando alerta de 2 horas para carrito ${cart.id}`);
        // TODO: Implementar envío de notificación
      }

      // Enviar notificaciones de 1 hora
      for (const cart of cartsExpiringInOneHour) {
        this.logger.log(`🚨 Enviando alerta de 1 hora para carrito ${cart.id}`);
        // TODO: Implementar envío de notificación urgente
      }

      this.logger.log(`📧 Alertas enviadas: ${cartsExpiringInTwoHours.length} de 2h, ${cartsExpiringInOneHour.length} de 1h`);
      
    } catch (error) {
      this.logger.error('❌ Error enviando alertas de expiración:', error.message);
    }
  }

  // Método manual para procesar un carrito específico
  async processCartManually(cartId: number): Promise<void> {
    this.logger.log(`🔧 Procesamiento manual de carrito ${cartId}`);
    
    const cart = await this.cartService.getCart(cartId);
    if (!cart) {
      throw new Error(`Carrito ${cartId} no encontrado`);
    }

    if (cart.status !== CartStatus.ACTIVE) {
      throw new Error(`Carrito ${cartId} no está activo`);
    }

    await this.processExpiredCart(cart);
  }
}