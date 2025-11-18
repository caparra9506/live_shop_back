import { Module } from '@nestjs/common';
import { TitokUserService } from './tiktok-user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TikTokUser } from 'src/entity/user-tiktok.entity';
import { TitokUserController } from './tiktok-user.controller';
import { Store } from 'src/entity/store.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TikTokUser, Store])],
  controllers: [TitokUserController],
  providers: [TitokUserService]
})
export class TitokUserModule {}
