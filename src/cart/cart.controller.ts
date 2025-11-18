import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, Headers } from '@nestjs/common';
import { CartService } from './cart.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { AddItemToCartDto } from './dto/add-item-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('create')
  async createCart(@Body() createCartDto: CreateCartDto) {
    try {
      const cart = await this.cartService.createCart(createCartDto);
      return {
        success: true,
        message: 'Carrito creado exitosamente',
        data: cart
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Post('add-item')
  async addItemToCart(@Body() addItemDto: AddItemToCartDto) {
    try {
      const cartItem = await this.cartService.addItemToCart(addItemDto);
      return {
        success: true,
        message: 'Producto agregado al carrito',
        data: cartItem
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Put('update-item')
  async updateCartItem(@Body() updateItemDto: UpdateCartItemDto) {
    try {
      const cartItem = await this.cartService.updateCartItem(updateItemDto);
      return {
        success: true,
        message: 'Item actualizado exitosamente',
        data: cartItem
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Delete('remove-item/:cartItemId')
  async removeCartItem(@Param('cartItemId') cartItemId: number) {
    try {
      await this.cartService.removeCartItem(cartItemId);
      return {
        success: true,
        message: 'Item eliminado del carrito'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Get('all')
  async getAllCarts(@Query('status') status?: string) {
    try {
      const cartStatus = status ? status.toUpperCase() as any : undefined;
      const carts = await this.cartService.getAllCarts(cartStatus);
      return {
        success: true,
        data: carts,
        count: carts.length
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Get(':cartId')
  async getCart(@Param('cartId') cartId: number) {
    try {
      const cart = await this.cartService.getCart(cartId);
      return {
        success: true,
        data: cart
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Get('user/:userTikTokId')
  async getUserActiveCart(
    @Param('userTikTokId') userTikTokId: number,
    @Query('storeName') storeName: string
  ) {
    try {
      const cart = await this.cartService.getUserActiveCart(userTikTokId, storeName);
      return {
        success: true,
        data: cart
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Put('extend/:cartId')
  async extendCartExpiration(
    @Param('cartId') cartId: number,
    @Body('additionalDays') additionalDays: number
  ) {
    try {
      const cart = await this.cartService.extendCartExpiration(cartId, additionalDays);
      return {
        success: true,
        message: 'Tiempo de carrito extendido',
        data: cart
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Get('time-remaining/:cartId')
  async getCartTimeRemaining(@Param('cartId') cartId: number) {
    try {
      const timeRemaining = await this.cartService.getCartTimeRemaining(cartId);
      return {
        success: true,
        data: timeRemaining
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Post('expire/:cartId')
  async expireCart(@Param('cartId') cartId: number) {
    try {
      await this.cartService.expireCart(cartId);
      return {
        success: true,
        message: 'Carrito marcado como expirado'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Put(':cartId/shipping')
  async updateCartShipping(
    @Param('cartId') cartId: number,
    @Body() body: { shippingCost: number; shippingProvider?: string }
  ) {
    try {
      const cart = await this.cartService.updateCartShipping(cartId, body.shippingCost);
      return {
        success: true,
        message: 'Costo de envío actualizado',
        data: cart
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Get('expired/:cartId')
  async getExpiredCart(
    @Param('cartId') cartId: number,
    @Query('token') token: string
  ) {
    try {
      if (!token) {
        return {
          success: false,
          message: 'Token de acceso requerido',
          error: 400
        };
      }

      const cart = await this.cartService.getExpiredCartWithToken(cartId, token);
      return {
        success: true,
        data: cart
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Post('generate-payment-link')
  async generatePaymentLink(
    @Body() body: { cartId: number }
  ) {
    try {
      const paymentLink = await this.cartService.generatePaymentLink(body.cartId);
      return {
        success: true,
        data: paymentLink
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Post('expired/:cartId/checkout')
  async checkoutExpiredCart(
    @Param('cartId') cartId: number,
    @Query('token') token: string
  ) {
    try {
      if (!token) {
        return {
          success: false,
          message: 'Token de acceso requerido',
          error: 400
        };
      }

      // Verify token and get cart
      const cart = await this.cartService.getExpiredCartWithToken(cartId, token);
      
      // TODO: Integrate with sale service to create sale from expired cart
      // This should validate stock again and create the sale if everything is OK
      
      return {
        success: true,
        message: 'Carrito validado. Proceder al pago.',
        data: {
          cartId: cart.id,
          totalAmount: cart.totalAmount,
          items: cart.cartItems,
          // Add redirect URL to payment gateway
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }
}