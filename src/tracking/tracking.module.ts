import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Shipping } from '../entity/shipping.entity';
import { TrackingSchedulerService } from './tracking-scheduler.service';
import { TrackingController } from './tracking.controller';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shipping]),
    ScheduleModule.forRoot(), // Habilita el sistema de cron jobs
    RabbitMQModule, // Importa RabbitMQ para notificaciones
  ],
  providers: [TrackingSchedulerService],
  controllers: [TrackingController],
  exports: [TrackingSchedulerService],
})
export class TrackingModule {}