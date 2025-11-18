import { Module } from '@nestjs/common';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from 'src/entity/store.entity';
import { StoreConfig } from 'src/entity/store-config.entity';
import { TikTokUser } from 'src/entity/user-tiktok.entity';
import { Product } from 'src/entity/product.entity';
import { UtilsModule } from 'src/utils/utils.module';
import { User } from 'src/entity/user.entity';
import { Shipping } from 'src/entity/shipping.entity';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [
    UtilsModule,
    TypeOrmModule.forFeature([Store, StoreConfig, TikTokUser, Product, User, Shipping]),
    TrackingModule,
  ],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
})
export class ShipmentsModule {}
