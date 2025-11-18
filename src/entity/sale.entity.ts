import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, OneToOne } from 'typeorm';
import { Store } from './store.entity';
import { SaleDetail } from './sale-detail.entity';
import { Shipping } from './shipping.entity';
import { Payment } from './payment.entity';

@Entity()
export class Sale {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Store, (store) => store.sales, { onDelete: 'CASCADE' })
  store: Store;
  

  @Column('decimal')
  totalAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  shippingCost: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ nullable: true })
  cartId: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => SaleDetail, (saleDetail) => saleDetail.sale, { cascade: true })
  saleDetails: SaleDetail[];

  @OneToOne(() => Shipping, (shipping) => shipping.sale, { nullable: true, cascade: true })
  shipping: Shipping;

  @OneToOne(() => Payment, (payment) => payment.sale, { nullable: true })
  payment: Payment;
}
