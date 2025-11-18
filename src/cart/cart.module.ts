import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartSchedulerService } from './cart-scheduler.service';
import { Cart } from '../entity/cart.entity';
import { CartItem } from '../entity/cart-item.entity';
import { Product } from '../entity/product.entity';
import { Store } from '../entity/store.entity';
import { TikTokUser } from '../entity/user-tiktok.entity';
import { ProductVariant } from '../entity/product-variant.entity';
import { StoreConfig } from '../entity/store-config.entity';
import { SaleModule } from '../sale/sale.module';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cart,
      CartItem,
      Product,
      Store,
      TikTokUser,
      ProductVariant,
      StoreConfig
    ]),
    SaleModule,
    RabbitMQModule
  ],
  controllers: [CartController],
  providers: [CartService, CartSchedulerService],
  exports: [CartService]
})
export class CartModule {}