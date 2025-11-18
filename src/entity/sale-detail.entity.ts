import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from 'typeorm';
import { Product } from './product.entity';
import { Sale } from './sale.entity';
import { ProductVariant } from './product-variant.entity';
import { TikTokUser } from './user-tiktok.entity';

@Entity()
export class SaleDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Sale, (sale) => sale.saleDetails, { onDelete: 'CASCADE' })
  sale: Sale;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  product: Product;

  
  @ManyToOne(() => TikTokUser, { onDelete: 'CASCADE', nullable: true })
  tiktokUser: TikTokUser; // 🔥 Ahora `SaleDetail` está relacionado con `TikTokUser`

  @Column()
  quantity: number;

  @Column('decimal')
  price: number;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  productVariant: ProductVariant;
}
