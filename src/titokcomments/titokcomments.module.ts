import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TikTokComment } from 'src/entity/tik-tok-comment';
import { Store } from 'src/entity/store.entity';
import { TikTokUser } from 'src/entity/user-tiktok.entity';
import { TikTokCommentController } from './titokcomments.controller';
import { TikTokCommentService } from './titokcomments.service';
import { Product } from 'src/entity/product.entity';
import { PurchaseIntent } from 'src/entity/purchase-intent.entity';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';

@Module({
    imports: [
      TypeOrmModule.forFeature([TikTokComment, Store, TikTokUser, Product, PurchaseIntent]),
      RabbitMQModule
    ],
    controllers: [TikTokCommentController],
    providers: [TikTokCommentService],
  })
  export class TitokcommentsModule {}
