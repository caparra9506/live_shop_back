import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, Index, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { TikTokComment } from './tik-tok-comment';
import { PurchaseIntent } from './purchase-intent.entity';
import { Store } from './store.entity';
import { City } from './city.entity';
import { Shipping } from './shipping.entity';
import { Cart } from './cart.entity';

@Entity()
@Index(['tiktok', 'store'], { unique: true })
export class TikTokUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tiktok: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  address?: string;

  @Column()
  documentType: string;

  @Column()
  document: string; 

  @Column()
  personType: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => TikTokComment, (comment) => comment.user)
  comments: TikTokComment[];

  @OneToMany(() => PurchaseIntent, (purchaseIntent) => purchaseIntent.userTikTok)
  purchaseIntents: PurchaseIntent[];

  @ManyToOne(() => Store, (store) => store.owner, { onDelete: 'CASCADE' })
  store: Store;

  @ManyToOne(() => City, (city) => city.tiktokUsers, { eager: true })
  @JoinColumn({ name: 'id_city' }) // Relacionando el usuario de TikTok con una ciudad específica
  city: City;

  @OneToOne(() => Shipping, (shipping) => shipping.sale, { nullable: true, cascade: true })
  shipping: Shipping;

  @OneToMany(() => Cart, (cart) => cart.tiktokUser, { cascade: true })
  carts: Cart[];
}
