import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, ManyToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Category } from './category.entity';
import { PurchaseIntent } from './purchase-intent.entity';
import { ProductVariant } from './product-variant.entity';
import { Coupon } from './coupon.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column('int')
  stock: number;

  @Column('decimal')
  price: number;

  @Column()
  description: string;

  @Column()
  imageUrl: string;
  
  @Column({ default: true })
  inStock: boolean; // Indica si el producto está disponible

  @Column('decimal', { nullable: true }) // Nuevo: Peso en kg
  weight?: number;

  @Column('decimal', { nullable: true }) // Nuevo: Largo en cm
  length?: number;

  @Column('decimal', { nullable: true }) // Nuevo: Ancho en cm
  width?: number;

  @Column('decimal', { nullable: true }) // Nuevo: Alto en cm
  height?: number;

  @ManyToOne(() => Category, (category) => category.products, { onDelete: 'CASCADE' })
  category: Category;

  @Exclude() // Excluir para evitar referencia circular
  @OneToMany(() => PurchaseIntent, (purchaseIntent) => purchaseIntent.product)
  purchaseIntents: PurchaseIntent[];

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants: ProductVariant[]; // Relación con variantes (color/talla)

  @Exclude() // Excluir para evitar referencia circular
  @ManyToMany(() => Coupon, (coupon) => coupon.products)
  coupons: Coupon[]; // 🔹 Relación inversa con cupones
}
