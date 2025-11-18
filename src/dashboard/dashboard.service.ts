import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from 'src/entity/sale.entity';
import { TikTokUser } from 'src/entity/user-tiktok.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,

    @InjectRepository(TikTokUser)
    private readonly tiktokUserRepository: Repository<TikTokUser>,
  ) {}

  async getDashboardMetrics(userId: number): Promise<any> {
    try {
      // Obtener métricas básicas con manejo de errores
      let totalOrders = 0;
      let totalRevenue = { totalRevenue: 0 };
      let totalCustomers = { totalCustomers: 0 };
      
      try {
        // Contar TODAS las órdenes (con o sin pago)
        totalOrders = await this.saleRepository
          .createQueryBuilder('sale')
          .leftJoin('sale.store', 'store')
          .where('store.ownerId = :userId', { userId })
          .getCount();
      } catch (error) {
        console.log('Error getting totalOrders, using 0:', error.message);
      }

      try {
        totalRevenue = await this.saleRepository
          .createQueryBuilder('sale')
          .leftJoin('sale.payment', 'payment')
          .leftJoin('sale.store', 'store')
          .where('store.ownerId = :userId', { userId })
          .andWhere('payment.estado = :paymentStatus', { paymentStatus: 'Aceptada' })
          .select('SUM(sale.totalAmount)', 'totalRevenue')
          .getRawOne() || { totalRevenue: 0 };
      } catch (error) {
        console.log('Error getting totalRevenue, using 0:', error.message);
      }

      try {
        // Contar TODOS los clientes únicos (de todas las órdenes, no solo pagadas)
        totalCustomers = await this.saleRepository
          .createQueryBuilder('sale')
          .leftJoin('sale.store', 'store')
          .leftJoin('sale.shipping', 'shipping')
          .leftJoin('shipping.tiktokUser', 'user')
          .where('store.ownerId = :userId', { userId })
          .select('COUNT(DISTINCT user.id)', 'totalCustomers')
          .getRawOne() || { totalCustomers: 0 };
      } catch (error) {
        console.log('Error getting totalCustomers, using 0:', error.message);
      }

      const totalUsers = await this.tiktokUserRepository.count();
      const conversionRate = totalUsers > 0 ? (totalOrders / totalUsers) * 100 : 0;

      // Métricas del período anterior con valores por defecto
      let lastPeriodOrders = 0;
      let lastPeriodRevenue = { totalRevenue: 0 };
      let lastPeriodCustomers = { totalCustomers: 0 };

      // Retornar valores básicos por ahora para evitar complejidad
      return {
        totalOrders,
        totalRevenue: totalRevenue.totalRevenue || 0,
        totalCustomers: totalCustomers.totalCustomers || 0,
        conversionRate: conversionRate.toFixed(2),
        orderChange: '0.00',
        revenueChange: '0.00',
        customerChange: '0.00',
        conversionChange: '0.00',
      };
    } catch (error) {
      console.error('Error in getDashboardMetrics:', error);
      // Retornar datos por defecto si todo falla
      return {
        totalOrders: 0,
        totalRevenue: 0,
        totalCustomers: 0,
        conversionRate: '0.00',
        orderChange: '0.00',
        revenueChange: '0.00',
        customerChange: '0.00',
        conversionChange: '0.00',
      };
    }
  }
}
