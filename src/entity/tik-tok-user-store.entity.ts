import { Entity, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Store } from './store.entity';
import { TikTokUser } from './user-tiktok.entity';

@Entity()
export class TikTokUserStore {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TikTokUser, { onDelete: 'CASCADE' })
  tiktokUser: TikTokUser;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  store: Store;
}
