import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CouponService } from './coupon.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createCoupon(@Request() req, @Body() createCouponDto: CreateCouponDto) {
    return this.couponService.createCoupon(req.user.id, createCouponDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('store')
  getCouponsForMyStore(@Request() req) {
    return this.couponService.getCouponsByStore(req.user.id);
  }

  @Post('validate')
  async validateCoupon(
    @Body()
    {
      code,
      storeId,
      userTikTokId,
      productId,
    }: {
      code: string;
      storeId: number;
      userTikTokId: number;
      productId?: number;
    },
  ) {
    console.log('🎟️ CONTROLLER - Validar cupón recibido:', {
      code,
      storeId,
      userTikTokId,
      productId,
      tipos: {
        code: typeof code,
        storeId: typeof storeId,
        userTikTokId: typeof userTikTokId,
        productId: typeof productId
      }
    });
    
    try {
      const result = await this.couponService.validateCoupon(code, storeId, userTikTokId, productId);
      console.log('🎟️ CONTROLLER - Resultado validación:', result);
      return result;
    } catch (error) {
      console.error('🎟️ CONTROLLER - Error validando cupón:', error.message);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('use')
  async useCoupon(
    @Request() req,
    @Body() { couponId, saleId }: { couponId: number; saleId: number },
  ) {
    return this.couponService.useCoupon(req.user.id, couponId, saleId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/toggle')
  toggleCouponStatus(@Param('id') couponId: number) {
    return this.couponService.toggleCouponStatus(couponId);
  }

  @Get(':id/usages')
  getCouponUsages(@Param('id') couponId: number) {
    return this.couponService.getCouponUsages(couponId);
  }
}
