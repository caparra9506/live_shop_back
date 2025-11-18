// entities/store-config.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Store } from './store.entity';

@Entity()
export class StoreConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => Store)
  @JoinColumn()
  store: Store;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'boolean', default: false })
  testMode: boolean;


  @Column({ nullable: true })
  epaycoPublicKey: string;

  @Column({ nullable: true })
  epaycoPrivateKey: string;

  @Column({ nullable: true })
  merchantId: string; // ID del merchant de la tienda en ePayco donde llega el dinero

  @Column({ type: 'int', default: 2 })
  cartTimeoutDays: number;

  @Column({ type: 'boolean', default: true })
  cartEnabled: boolean;

  // 💰 Split Payment Configuration
  @Column({ type: 'boolean', default: true })
  enableSplitPayments: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 5.00 })
  platformCommissionPercentage: number; // Porcentaje que se queda la plataforma

  @Column({ nullable: true })
  platformPaycoEmail: string; // Email de la plataforma en ePayco

  @Column({ type: 'int', default: 0 }) // 0 = percentage, 1 = fixed amount  
  splitType: number;

  @Column({ type: 'int', default: 1 }) // 0 = platform pays, 1 = store pays ePayco fees
  feePayer: number;

  // 📄 Electronic Billing Configuration (FACTUS)
  @Column({ type: 'boolean', default: false })
  enableElectronicBilling: boolean;

  @Column({ nullable: true })
  factusClientId: string;

  @Column({ nullable: true })
  factusClientSecret: string;

  @Column({ nullable: true })
  factusUsername: string;

  @Column({ nullable: true })
  factusPassword: string;

  @Column({ nullable: true, default: 'https://api-sandbox.factus.com.co' })
  factusApiUrl: string;

  @Column({ type: 'boolean', default: true })
  factusTestMode: boolean;

  @Column({ nullable: true })
  factusNumberingRangeId: number;

  // 🚚 99 Envíos Shipping Configuration
  @Column({ type: 'boolean', default: false })
  enableSeguro99: boolean; // Seguro básico 99 Envíos

  @Column({ type: 'boolean', default: false })
  enableSeguro99Plus: boolean; // Seguro premium 99 Envíos

  @Column({ type: 'boolean', default: false })
  enableContrapago: boolean; // Pago contra entrega

  @Column({ type: 'boolean', default: false })
  enableFreeShipping: boolean; // Envío gratis (solo para testing)

  @Column({ nullable: true })
  shippingOriginCode: string; // Código postal de origen por defecto
}
