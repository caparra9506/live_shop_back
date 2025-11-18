import { Column, Entity, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Exclude } from 'class-transformer';
import { Store } from "./store.entity";
import { Category } from "./category.entity";
import { Product } from "./product.entity";
import { CouponUsage } from "./coupon-usage.entity";

@Entity()
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string; // Código único del cupón

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discountValue: number; // Valor de descuento en porcentaje o monto fijo

  @Column({ type: 'enum', enum: ['PERCENTAGE', 'FIXED'], default: 'PERCENTAGE' })
  discountType: 'PERCENTAGE' | 'FIXED'; // Tipo de descuento

  @Column({ type: 'timestamp' })
  expirationDate: Date; // Fecha de expiración

  @Column({ default: true })
  isActive: boolean; // Estado del cupón

  @ManyToOne(() => Store, (store) => store.coupons, { nullable: true, onDelete: 'CASCADE' })
  store?: Store; // 🔹 Si tiene `store`, aplica a toda la tienda

  @Exclude() // Excluir para evitar referencia circular
  @ManyToMany(() => Category, (category) => category.coupons, { cascade: true })
  @JoinTable()
  categories: Category[]; // 🔹 Ahora puede aplicarse a múltiples categorías

  @Exclude() // Excluir para evitar referencia circular
  @ManyToMany(() => Product, (product) => product.coupons, { cascade: true })
  @JoinTable()
  products: Product[]; // 🔹 Ahora puede aplicarse a múltiples productos

  @Exclude() // Excluir para evitar referencia circular
  @OneToMany(() => CouponUsage, (usage) => usage.coupon)
  usages: CouponUsage[]; // Registro de uso de cupones
}
