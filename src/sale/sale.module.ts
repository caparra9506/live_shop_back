import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from 'src/entity/sale.entity';
import { SaleDetail } from 'src/entity/sale-detail.entity';
import { Product } from 'src/entity/product.entity';
import { Store } from 'src/entity/store.entity';
import { SalesController } from './sale.controller';
import { SalesService } from './sale.service';
import { CouponUsage } from 'src/entity/coupon-usage.entity';
import { TikTokUser } from 'src/entity/user-tiktok.entity';
import { Coupon } from 'src/entity/coupon.entity';
import { Category } from 'src/entity/category.entity';
import { Shipping } from 'src/entity/shipping.entity';
import { UtilsModule } from 'src/utils/utils.module';
import { User } from 'src/entity/user.entity';
import { StoreConfig } from 'src/entity/store-config.entity';
import { Payment } from 'src/entity/payment.entity';
import { Cart } from 'src/entity/cart.entity';
import { CartItem } from 'src/entity/cart-item.entity';
import { ElectronicBillingModule } from '../electronic-billing/electronic-billing.module';


@Module({
  imports: [
    UtilsModule,
    ElectronicBillingModule,
    TypeOrmModule.forFeature([Sale, SaleDetail, Store, Product, CouponUsage, TikTokUser, Coupon, 
      Category, Shipping, User, StoreConfig, Payment, Cart, CartItem])
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService], // Exportar el servicio si lo usas en otros módulos
})
export class SaleModule {}
