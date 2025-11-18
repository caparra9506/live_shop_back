import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, ManyToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Store } from './store.entity';
import { Product } from './product.entity';
import { Coupon } from './coupon.entity';

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => Store, (store) => store.categories, { onDelete: 'CASCADE' })
  store: Store;

  @Exclude() // Excluir para evitar referencia circular
  @OneToMany(() => Product, (product) => product.category, { cascade: true })
  products: Product[];

  @Exclude() // Excluir para evitar referencia circular
  @ManyToMany(() => Coupon, (coupon) => coupon.categories)
  coupons: Coupon[]; // 🔹 Relación inversa con cupones
}
