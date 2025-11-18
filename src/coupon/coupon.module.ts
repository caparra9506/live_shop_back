import { Module } from '@nestjs/common';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coupon } from 'src/entity/coupon.entity';
import { CouponUsage } from 'src/entity/coupon-usage.entity';
import { Store } from 'src/entity/store.entity';
import { Product } from 'src/entity/product.entity';
import { Category } from 'src/entity/category.entity';
import { Sale } from 'src/entity/sale.entity';
import { TikTokUser } from 'src/entity/user-tiktok.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Coupon, CouponUsage, Store, Product, Category, Sale, TikTokUser])],
  controllers: [CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
