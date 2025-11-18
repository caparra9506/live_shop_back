import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { StoresModule } from './stores/stores.module';
import { UtilsModule } from './utils/utils.module';
import { CategoryModule } from './category/category.module';
import { ProductModule } from './product/product.module';
import { TitokUserModule } from './tiktokuser/tiktok-user.module';
import { SaleModule } from './sale/sale.module';
import { TitokcommentsModule } from './titokcomments/titokcomments.module';
import { MulterModule } from '@nestjs/platform-express';
import { Coupon } from './entity/coupon.entity';
import { CouponUsage } from './entity/coupon-usage.entity';
import { CouponModule } from './coupon/coupon.module';
import { ExcelModule } from './excel/excel.module';
import { LocationModule } from './location/location.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ConfigurationModule } from './config/config.module';
import { PaymentModule } from './payment/payment.module';
import { TitokDmModule } from './tiktokdm/tiktok-dm.module';
import { CartModule } from './cart/cart.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { ElectronicBillingModule } from './electronic-billing/electronic-billing.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads', // Carpeta temporal antes de subir a S3
    }),
    TypeOrmModule.forFeature([Coupon, CouponUsage,]),
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      autoLoadEntities: true,
      synchronize: true, // ⚠️ SOLO para desarrollo
    }),
    AuthModule,
    UserModule,
    StoresModule,
    UtilsModule,
    CategoryModule,
    ProductModule,
    TitokUserModule,
    SaleModule,
    TitokcommentsModule,
    CouponModule,
    ExcelModule,
    LocationModule,
    ShipmentsModule,
    DashboardModule,
    ConfigurationModule,
    PaymentModule,
    TitokDmModule,
    CartModule,
    RabbitMQModule,
    ElectronicBillingModule,
    TrackingModule,
  ],
})
export class AppModule {}
