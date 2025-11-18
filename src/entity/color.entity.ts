import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { ProductVariant } from './product-variant.entity';

@Entity()
export class Color {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  hexCode: string;

  @Exclude() // Excluir para evitar referencia circular
  @OneToMany(() => ProductVariant, (variant) => variant.color)
  variants: ProductVariant[];
}
