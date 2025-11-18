import { Controller, Post, Get, Param, UseGuards, Query } from '@nestjs/common';
import { TrackingSchedulerService } from './tracking-scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(
    private readonly trackingSchedulerService: TrackingSchedulerService,
  ) {}

  /**
   * 🔧 Ejecutar chequeo manual de tracking (todas las guías activas)
   */
  @Post('check-all')
  async runManualCheckAll() {
    await this.trackingSchedulerService.runManualCheck();
    return {
      success: true,
      message: 'Chequeo manual de tracking ejecutado exitosamente',
      timestamp: new Date(),
    };
  }

  /**
   * 🔍 Ejecutar chequeo manual para una guía específica
   */
  @Post('check/:guideNumber')
  async runManualCheckSingle(@Param('guideNumber') guideNumber: string) {
    await this.trackingSchedulerService.runManualCheck(guideNumber);
    return {
      success: true,
      message: `Chequeo manual ejecutado para guía ${guideNumber}`,
      guideNumber,
      timestamp: new Date(),
    };
  }

  /**
   * 📊 Obtener estadísticas del scheduler
   */
  @Get('stats')
  async getSchedulerStats() {
    // Aquí podrías agregar lógica para obtener estadísticas
    return {
      success: true,
      scheduler: {
        name: 'tracking-status-checker',
        frequency: 'Cada 30 minutos',
        timezone: 'America/Bogota',
        nextRun: 'Automático',
      },
      lastExecution: new Date(),
    };
  }
}