import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Store } from './store.entity';
import { TikTokUser } from './user-tiktok.entity';
import { Product } from './product.entity';

@Entity()
export class PurchaseIntent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Store, (store) => store.purchaseIntents)
  store: Store;

  @ManyToOne(() => TikTokUser, (user) => user.purchaseIntents)
  userTikTok: TikTokUser;

  @Exclude() // Excluir para evitar referencia circular
  @ManyToOne(() => Product, (product) => product.purchaseIntents)
  product: Product;

  @Column()
  comment: string;

  @CreateDateColumn()
  createdAt: Date;
}
