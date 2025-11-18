import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToOne,
    CreateDateColumn,
    JoinColumn,
  } from 'typeorm';
  import { Store } from './store.entity';
  import { Sale } from './sale.entity';
  import { Shipping } from './shipping.entity';
import { TikTokUser } from './user-tiktok.entity';
  
  @Entity()
  export class Payment {
    @PrimaryGeneratedColumn()
    id: number;
  
    @Column()
    reference: string;
  
    @Column()
    receiptNumber: string;
  
    @Column('decimal', { precision: 10, scale: 2, nullable: true })
    amount: number;

    // 🏦 Datos adicionales de ePayco
    @Column({ nullable: true })
    authorization: string;

    @Column({ nullable: true })
    transactionId: string;

    @Column({ nullable: true })
    invoice: string;

    @Column({ nullable: true })
    ticketId: string;

    @Column({ nullable: true })
    estado: string;

    @Column({ nullable: true })
    respuesta: string;

    @Column({ nullable: true })
    transactionDate: string;

    @Column({ nullable: true })
    fechaTransaccion: string;

    // 💰 Split Payment Fields
    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    platformCommission: number; // Comisión que se queda la plataforma

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    storeAmount: number; // Monto que recibe la tienda

    @Column({ nullable: true })
    splitReference: string; // Referencia del split en ePayco

    @Column({ nullable: true, default: 'PENDING' })
    splitStatus: string; // PENDING, COMPLETED, FAILED
  
    @CreateDateColumn()
    createdAt: Date;
  
    // 🔗 Relación con la tienda
    @ManyToOne(() => Store, { eager: true })
    @JoinColumn({ name: 'storeId' })
    store: Store;
  
    // 🔗 Relación con el usuario de TikTok
    @ManyToOne(() => TikTokUser, { eager: true })
    @JoinColumn({ name: 'tiktokUserId' })
    tiktokUser: TikTokUser;
  
    // 🔗 Relación con la venta
    @OneToOne(() => Sale, (sale) => sale.payment, { eager: true })
    @JoinColumn({ name: 'saleId' })
    sale: Sale;
  
    // 🔗 Relación con el envío
    @ManyToOne(() => Shipping, { eager: true, nullable: true })
    @JoinColumn({ name: 'shippingId' })
    shipping: Shipping;
  }
  