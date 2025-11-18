import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { ProductVariant } from './product-variant.entity';

@Entity()
export class Size {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Exclude() // Excluir para evitar referencia circular
  @OneToMany(() => ProductVariant, (variant) => variant.size)
  variants: ProductVariant[];
}
