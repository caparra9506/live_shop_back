import {
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    CreateDateColumn,
  } from 'typeorm';
  import { Coupon } from './coupon.entity';
  import { Sale } from './sale.entity';
import { TikTokUser } from './user-tiktok.entity';
  
  @Entity()
  export class CouponUsage {
    @PrimaryGeneratedColumn()
    id: number;
  
    @ManyToOne(() => Coupon, (coupon) => coupon.usages, { onDelete: 'CASCADE' })
    coupon: Coupon; // Cupón utilizado
  

    @ManyToOne(() => TikTokUser, { onDelete: 'CASCADE' }) // ✅ Corrección aquí
    userTikTok: TikTokUser; // Usuario de TikTok que usó el cupón
  
    @ManyToOne(() => Sale, { onDelete: 'CASCADE' })
    sale: Sale; // Venta en la que se usó el cupón
  
    @CreateDateColumn()
    usedAt: Date; // Fecha en la que se usó el cupón
  }
  