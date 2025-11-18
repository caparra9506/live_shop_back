import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Category } from './category.entity';
import { Sale } from './sale.entity';
import { TikTokComment } from './tik-tok-comment';
import { PurchaseIntent } from './purchase-intent.entity';
import { Coupon } from './coupon.entity';
import { City } from './city.entity';
import { StoreConfig } from './store-config.entity';
import { Cart } from './cart.entity';

@Entity()
export class Store {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column()
  description: string;

  @Column()
  phone: string;

  @Column()
  logo: string;

  @Column()
  documentType: string;

  @Column()
  document: string;

  @Column()
  address: string;

  @ManyToOne(() => User, (user) => user.stores, { eager: true })
  owner: User;

  @ManyToOne(() => City, (city) => city.stores, { eager: true })
  @JoinColumn({ name: 'id_city' }) // Relacionando la tienda con una ciudad específica
  city: City;

  @OneToMany(() => Category, (category) => category.store, { cascade: true })
  categories: Category[];

  @OneToMany(() => Sale, (sale) => sale.store, { cascade: true })
  sales: Sale[];

  @OneToMany(() => TikTokComment, (comment) => comment.store, { cascade: true })
  tiktokComments: TikTokComment[];

  @OneToMany(() => Coupon, (coupon) => coupon.store, { cascade: true })
  coupons: Coupon[]; // 🔹 Nueva relación con los cupones

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => PurchaseIntent, (purchaseIntent) => purchaseIntent.store)
  purchaseIntents: PurchaseIntent[];


  // store.entity.ts
  @OneToMany(() => StoreConfig, (config) => config.store)
  config: StoreConfig[];

  @OneToMany(() => Cart, (cart) => cart.store, { cascade: true })
  carts: Cart[];
}
