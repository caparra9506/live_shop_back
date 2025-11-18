import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from 'src/entity/product.entity';
import { Category } from 'src/entity/category.entity';
import { Store } from 'src/entity/store.entity';
import { Size } from 'src/entity/size.entity';
import { Color } from 'src/entity/color.entity';
import { ProductVariant } from 'src/entity/product-variant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Category, Store, Color, Size, ProductVariant])],
  controllers: [ProductController],
  providers: [ProductService]
})
export class ProductModule {}
