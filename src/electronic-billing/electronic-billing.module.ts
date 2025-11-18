import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElectronicBillingService } from './electronic-billing.service';
import { ElectronicBillingController } from './electronic-billing.controller';
import { ElectronicInvoice } from '../entity/electronic-invoice.entity';
import { Store } from '../entity/store.entity';
import { Sale } from '../entity/sale.entity';
import { SaleDetail } from '../entity/sale-detail.entity';
import { User } from '../entity/user.entity';
import { StoreConfig } from '../entity/store-config.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ElectronicInvoice,
      Store,
      Sale,
      SaleDetail,
      User,
      StoreConfig,
    ]),
  ],
  controllers: [ElectronicBillingController],
  providers: [ElectronicBillingService],
  exports: [ElectronicBillingService],
})
export class ElectronicBillingModule {}