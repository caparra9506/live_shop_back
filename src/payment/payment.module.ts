import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreConfig } from 'src/entity/store-config.entity';
import { Store } from 'src/entity/store.entity';
import { Payment } from 'src/entity/payment.entity';
import { SaleModule } from 'src/sale/sale.module';
import { ElectronicBillingModule } from '../electronic-billing/electronic-billing.module';

@Module({
  imports: [
      TypeOrmModule.forFeature([StoreConfig, Store, Payment]),
      SaleModule,
      ElectronicBillingModule
    ],
  controllers: [PaymentController],
  providers: [PaymentService]
})
export class PaymentModule {}
