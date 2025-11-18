import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Store } from './store.entity';
import { Sale } from './sale.entity';

@Entity('electronic_invoices')
export class ElectronicInvoice {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Store)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @ManyToOne(() => Sale)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  // Datos de FACTUS
  @Column({ name: 'factus_id', nullable: true })
  factusId: string;

  @Column({ name: 'cufe', nullable: true })
  cufe: string;

  @Column({ name: 'invoice_number', nullable: true })
  invoiceNumber: string;

  @Column({ name: 'prefix', nullable: true })
  prefix: string;

  @Column({ name: 'resolution_number', nullable: true })
  resolutionNumber: string;

  @Column({ name: 'qr_code', type: 'text', nullable: true })
  qrCode: string;

  @Column({ name: 'pdf_url', type: 'text', nullable: true })
  pdfUrl: string;

  @Column({ name: 'xml_url', type: 'text', nullable: true })
  xmlUrl: string;

  @Column({ 
    name: 'status', 
    type: 'enum', 
    enum: ['PENDING', 'GENERATED', 'VALIDATED', 'FAILED'],
    default: 'PENDING'
  })
  status: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ name: 'subtotal', type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  // Información del cliente
  @Column({ name: 'customer_document_type' })
  customerDocumentType: string;

  @Column({ name: 'customer_document' })
  customerDocument: string;

  @Column({ name: 'customer_name' })
  customerName: string;

  @Column({ name: 'customer_email' })
  customerEmail: string;

  @Column({ name: 'customer_phone', nullable: true })
  customerPhone: string;

  @Column({ name: 'customer_address', nullable: true })
  customerAddress: string;

  @Column({ name: 'customer_city', nullable: true })
  customerCity: string;

  // Respuesta de FACTUS
  @Column({ name: 'factus_response', type: 'text', nullable: true })
  factusResponse: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}