import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TikTokDmController } from './tiktok-dm.controller';
import { TikTokDmService } from './tiktok-dm.service';
import { Store } from 'src/entity/store.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Store])],
  controllers: [TikTokDmController],
  providers: [TikTokDmService]
})
export class TitokDmModule {}
