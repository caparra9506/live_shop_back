import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoreConfigController } from './config.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreConfig } from 'src/entity/store-config.entity';
import { Store } from 'src/entity/store.entity';
import { StoreConfigService } from './config.service';

@Module({
  imports: [
        TypeOrmModule.forFeature([StoreConfig, Store])
      ],
  providers: [StoreConfigService],
  controllers: [StoreConfigController]
})
export class ConfigurationModule {}
