import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Product } from './product.entity';
import { Color } from './color.entity';
import { Size } from './size.entity';

@Entity()
export class ProductVariant {
  @PrimaryGeneratedColumn()
  id: number;

  @Exclude() // Excluir para evitar referencia circular
  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  product: Product;

  @ManyToOne(() => Color, (color) => color.variants, { onDelete: 'CASCADE', nullable: true })
  color: Color | null;

  @ManyToOne(() => Size, (size) => size.variants, { onDelete: 'CASCADE', nullable: true })
  size: Size | null;

}
