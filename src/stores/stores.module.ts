import { Module } from '@nestjs/common';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from 'src/entity/store.entity';
import { Product } from 'src/entity/product.entity';
import { City } from 'src/entity/city.entity';
import { User } from 'src/entity/user.entity';
import { UtilsModule } from 'src/utils/utils.module';

@Module({
  imports: [ UtilsModule, TypeOrmModule.forFeature([Store, Product, City, User])], // 🔹 Debe importar Store y Product
  providers: [StoresService],
  controllers: [StoresController],
  exports: [StoresService],
})
export class StoresModule {}
