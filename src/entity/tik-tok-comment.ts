import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Store } from './store.entity';
import { TikTokUser } from './user-tiktok.entity';

@Entity()
export class TikTokComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string; // Usuario de TikTok que comentó

  @Column()
  comment: string; // Texto del comentario

  @Column({ default: false })
  hasPurchaseIntent: boolean; // Si el comentario tiene intención de compra (detectado por IA)

  @Column({ nullable: true })
  aiAnalysisScore: number; // Score del análisis de IA (0-1)

  @Column({ default: false })
  sentToWebhook: boolean; // Si fue enviado a N8N webhook

  @CreateDateColumn()
  createdAt: Date; // Fecha en que se recibió el comentario

  @ManyToOne(() => Store, (store) => store.tiktokComments, {
    onDelete: 'CASCADE',
  })
  store: Store; // Tienda relacionada con el comentario

  @ManyToOne(() => TikTokUser, (userTikTok) => userTikTok.comments, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  user?: TikTokUser;
}
