import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Sale } from 'src/entity/sale.entity';
import { TikTokUser } from 'src/entity/user-tiktok.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
      TypeOrmModule.forFeature([Sale,TikTokUser])
    ],
  controllers: [DashboardController],
  providers: [DashboardService]
})
export class DashboardModule {}
