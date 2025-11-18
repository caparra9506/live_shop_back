import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Sale } from './sale.entity';
import { TikTokUser } from './user-tiktok.entity';

@Entity()
export class Shipping {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  numberGuide: string;

  @Column({ type: 'timestamp' })
  dateCreate: Date;

  @Column({ type: 'text' })
  message: string;

  // **🚚 Estado del Envío** (Estados reales de 99 Envíos)
  @Column({
    type: 'varchar',
    length: 50,
    default: 'GUÍA ADMITIDA',
  })
  status: string;

  // **📦 Transportadora utilizada** (servientrega, tcc, envia, coordinadora, interrapidisimo)
  @Column({
    type: 'enum',
    enum: ['servientrega', 'tcc', 'envia', 'coordinadora', 'interrapidisimo'],
    nullable: true,
  })
  carrier: string;

  // **🏢 Código de sucursal 99 Envíos** (para tracking)
  @Column({ nullable: true })
  codigoSucursal: string;

  // **📄 URL del PDF de la guía**
  @Column({ nullable: true, type: 'text' })
  pdfUrl: string;

  @OneToOne(() => Sale, (sale) => sale.shipping, { onDelete: 'CASCADE' })
  @JoinColumn()
  sale: Sale;

  // **Relacionamos con el usuario TikTok**
  @ManyToOne(() => TikTokUser, (tiktokUser) => tiktokUser.shipping, { onDelete: 'CASCADE' })
  @JoinColumn()
  tiktokUser: TikTokUser;
}
