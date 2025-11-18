import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipping } from '../entity/shipping.entity';
import axios from 'axios';
import * as https from 'https';
import * as http from 'http';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class TrackingSchedulerService {
  private readonly logger = new Logger(TrackingSchedulerService.name);

  constructor(
    @InjectRepository(Shipping)
    private readonly shippingRepository: Repository<Shipping>,
    private readonly rabbitmqService: RabbitMQService,
  ) {}

  /**
   * Ejecuta cada 2 minutos el chequeo de tracking (para pruebas)
   * Producción: cambiar a '0 star-slash-30 star star star star' para cada 30 minutos
   */
  @Cron('0 */2 * * * *', {
    name: 'tracking-status-checker',
    timeZone: 'America/Bogota',
  })
  async checkTrackingStatuses() {
    // Verificar si el scheduler está habilitado
    const isEnabled = process.env.TRACKING_SCHEDULER_ENABLED === 'true';
    if (!isEnabled) {
      this.logger.debug('🚫 Tracking scheduler deshabilitado por configuración');
      return;
    }

    this.logger.log('🔄 Iniciando chequeo automático de tracking...');

    try {
      // Obtener envíos activos (no entregados ni cancelados)
      const activeShipments = await this.getActiveShipments();
      
      this.logger.log(`📦 Encontrados ${activeShipments.length} envíos activos para verificar`);

      let updatedCount = 0;
      let errorCount = 0;

      for (const shipping of activeShipments) {
        try {
          const trackingData = await this.fetchTrackingStatus(
            shipping.numberGuide,
            shipping.codigoSucursal || shipping.carrier
          );

          if (trackingData) {
            const wasUpdated = await this.updateShippingStatus(shipping, trackingData);
            if (wasUpdated) {
              updatedCount++;
            }
          }

          // Delay entre requests para no sobrecargar el API
          await this.sleep(1000); // 1 segundo entre requests

        } catch (error) {
          errorCount++;
          this.logger.error(
            `❌ Error procesando guía ${shipping.numberGuide}: ${error.message}`
          );
        }
      }

      this.logger.log(
        `✅ Chequeo completado. Actualizados: ${updatedCount}, Errores: ${errorCount}`
      );

    } catch (error) {
      this.logger.error(`❌ Error en chequeo automático de tracking: ${error.message}`);
    }
  }

  /**
   * Obtiene envíos activos que necesitan seguimiento
   */
  private async getActiveShipments(): Promise<Shipping[]> {
    const finalStatuses = ['ENTREGADA', 'FINALIZADA', 'DEVOLUCIÓN RATIFICADA', 'DEVUELTA', 'CANCELADA', 'NO_ENTREGADA', 'RETENIDA'];

    return await this.shippingRepository
      .createQueryBuilder('shipping')
      .innerJoinAndSelect('shipping.sale', 'sale')
      .innerJoinAndSelect('sale.store', 'store')
      .leftJoinAndSelect('sale.payment', 'payment')
      .innerJoinAndSelect('shipping.tiktokUser', 'tiktokUser')
      .leftJoinAndSelect('tiktokUser.city', 'city')
      .where('shipping.status NOT IN (:...finalStatuses)', { finalStatuses })
      .orderBy('shipping.dateCreate', 'DESC')
      .take(50) // Limitar a 50 por ejecución
      .getMany();
  }

  /**
   * Consulta el API de 99 Envíos para tracking
   */
  private async fetchTrackingStatus(guideNumber: string, codigoSucursalOrCarrier: string): Promise<any> {
    try {
      // API de 99 Envíos para tracking - URL incluye código de sucursal
      const baseTrackingUrl = process.env.TRACKING_API_URL || 'https://integration1.99envios.app/api/sucursal/rastreo';
      
      // Si tenemos código de sucursal (numérico), usarlo. Si no, usar carrier genérico
      const esCodigoSucursal = /^\d+$/.test(codigoSucursalOrCarrier);
      
      // Construir URL con código de sucursal si está disponible
      const trackingApiUrl = esCodigoSucursal 
        ? `${baseTrackingUrl}/${codigoSucursalOrCarrier}`
        : baseTrackingUrl;
      
      const requestData = {
        guia: guideNumber,
        transportadora: {
          pais: 'colombia',
          nombre: esCodigoSucursal ? 'envia' : codigoSucursalOrCarrier
        },
        origenCreacion: 1
      };

      this.logger.debug(`🔍 Consultando tracking para guía ${guideNumber}`);
      this.logger.debug(`📡 URL completa: ${trackingApiUrl}`);
      this.logger.debug(`🏢 Código sucursal: ${esCodigoSucursal ? codigoSucursalOrCarrier : 'No disponible'}`);
      this.logger.debug(`📦 Request data:`, requestData);

      // Configurar HTTP agent con keepAlive para mejorar rendimiento y evitar timeouts
      const httpAgent = new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        timeout: 8000
      });

      const httpsAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        timeout: 8000,
        rejectUnauthorized: true
      });

      const response = await axios.post(trackingApiUrl, requestData, {
        timeout: 10000, // 10 segundos timeout
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://99envios.app', // Header requerido por el API de 99 Envíos
          'User-Agent': 'Mozilla/5.0 (compatible; ComprePuesBackend/1.0)',
        },
        httpAgent,
        httpsAgent,
      });

      this.logger.debug(`📦 Respuesta del tracking:`, response.data);
      return response.data;

    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        this.logger.warn(`⚠️ Error de conexión para guía ${guideNumber}: ${error.code}`);
      } else if (error.response?.status === 404) {
        this.logger.warn(`⚠️ Guía ${guideNumber} no encontrada en 99 Envíos`);
      } else if (error.response?.status) {
        this.logger.error(`❌ Error HTTP ${error.response.status} para guía ${guideNumber}: ${error.response.statusText}`);
      } else {
        this.logger.error(`❌ Error consultando tracking para ${guideNumber}: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Actualiza el estado del envío basado en la respuesta del API
   */
  private async updateShippingStatus(shipping: Shipping, trackingData: any): Promise<boolean> {
    try {
      const { origen, destino, estados, direccion_destino } = trackingData;

      if (!estados || Object.keys(estados).length === 0) {
        this.logger.debug(`ℹ️ Sin estados nuevos para guía ${shipping.numberGuide}`);
        return false;
      }

      // Obtener el último estado
      const estadosArray = Object.values(estados) as any[];
      const ultimoEstado = estadosArray[estadosArray.length - 1];

      // Usar directamente el estado de 99 Envíos (normalizando formato)
      const newStatus = this.normalizeStatus(ultimoEstado.nombre);

      // Solo actualizar si el estado cambió
      if (shipping.status === newStatus) {
        return false;
      }

      const oldStatus = shipping.status;

      // Actualizar el envío
      shipping.status = newStatus;
      shipping.message = `${shipping.message} | ${ultimoEstado.nombre} - ${ultimoEstado.fecha_creacion}`;

      await this.shippingRepository.save(shipping);

      this.logger.log(
        `🔄 Guía ${shipping.numberGuide}: ${oldStatus} → ${newStatus} (${ultimoEstado.nombre})`
      );

      // 📲 Enviar notificación de cambio de estado al webhook
      await this.sendStatusChangeNotification(shipping, oldStatus, newStatus, ultimoEstado, trackingData);

      return true;

    } catch (error) {
      this.logger.error(`❌ Error actualizando estado para guía ${shipping.numberGuide}: ${error.message}`);
      return false;
    }
  }

  /**
   * Envía notificación al webhook cuando cambia el estado del envío
   * (a través de RabbitMQ para mayor confiabilidad)
   */
  private async sendStatusChangeNotification(
    shipping: Shipping,
    oldStatus: string,
    newStatus: string,
    ultimoEstado: any,
    trackingData: any
  ) {
    try {
      // Construir payload en el formato estándar del sistema
      const payment = shipping.sale?.payment;

      const notificationData = {
        paymentReference: payment?.reference || '',
        receiptNumber: payment?.receiptNumber || '',
        saleId: shipping.sale?.id || 0,
        customerName: shipping.tiktokUser?.name || '',
        customerEmail: shipping.tiktokUser?.email || '',
        customerPhone: shipping.tiktokUser?.phone || '',
        amount: payment?.amount || shipping.sale?.totalAmount || 0,
        shippingInfo: {
          trackingNumber: shipping.numberGuide,
          shippingStatus: newStatus,
          shippingMessage: shipping.message,
          shippingDate: shipping.dateCreate,
          recipientPhone: shipping.tiktokUser?.phone || '',
          recipientAddress: shipping.tiktokUser?.address || '',
          recipientCity: shipping.tiktokUser?.city?.name || 'No especificada',
        },
        timestamp: new Date().toISOString(),
        status: newStatus
      };

      this.logger.debug(`📲 Encolando notificación de cambio de estado en RabbitMQ...`);
      this.logger.debug(`📦 Estado: ${oldStatus} → ${newStatus}`);

      // Encolar en RabbitMQ en lugar de enviar directamente
      const enqueued = await this.rabbitmqService.enqueueShippingNotification(notificationData);

      if (enqueued) {
        this.logger.log(
          `✅ Notificación encolada exitosamente para guía ${shipping.numberGuide} (${oldStatus} → ${newStatus})`
        );
      } else {
        this.logger.warn(
          `⚠️ No se pudo encolar notificación para guía ${shipping.numberGuide} (RabbitMQ no disponible)`
        );
      }

    } catch (error) {
      // No lanzar error para que no afecte el proceso de actualización
      this.logger.error(
        `❌ Error encolando notificación para guía ${shipping.numberGuide}: ${error.message}`
      );
    }
  }

  /**
   * Normaliza el estado de 99 Envíos al formato de nuestro enum
   */
  private normalizeStatus(apiStatus: string): string {
    // Lista de estados válidos según nuestro enum
    const validStatuses = [
      'GUÍA ADMITIDA', 'GENERADA', 'CREADA', 'RECIBIDA', 'PROCESADA',
      'TRANSITO URBANO', 'CENTRO DE ACOPIO', 'TELEMERCADO', 'REENVÍO', 'REPARTO',
      'ENTREGADA', 'FINALIZADA',
      'DEVOLUCIÓN RATIFICADA', 'DEVUELTA', 'CANCELADA', 'NO_ENTREGADA', 'RETENIDA'
    ];

    // Normalizar el estado recibido
    const normalized = apiStatus.toUpperCase().trim();

    // Mapeos específicos para casos especiales
    const specialMappings = {
      'GENERADA EN BOGOTA': 'GENERADA',
      'GENERADA EN MEDELLIN': 'GENERADA', 
      'GENERADA EN CALI': 'GENERADA',
      'ENTREGADO': 'ENTREGADA',
      'EN_TRANSITO': 'TRANSITO URBANO',
      'EN_RUTA': 'TRANSITO URBANO'
    };

    // Verificar mapeos especiales primero
    if (specialMappings[normalized]) {
      return specialMappings[normalized];
    }

    // Buscar coincidencia exacta
    if (validStatuses.includes(normalized)) {
      return normalized;
    }

    // Buscar coincidencia parcial
    for (const validStatus of validStatuses) {
      if (normalized.includes(validStatus) || validStatus.includes(normalized)) {
        return validStatus;
      }
    }

    // Si no encuentra coincidencia, usar estado por defecto
    this.logger.warn(`⚠️ Estado desconocido del API: "${apiStatus}" - usando GUÍA ADMITIDA por defecto`);
    return 'GUÍA ADMITIDA';
  }

  /**
   * Función helper para agregar delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ejecutar chequeo manual (para testing)
   */
  async runManualCheck(guideNumber?: string) {
    this.logger.log('🔧 Ejecutando chequeo manual de tracking...');
    
    if (guideNumber) {
      // Chequear una guía específica
      const shipping = await this.shippingRepository.findOne({
        where: { numberGuide: guideNumber },
        relations: ['sale', 'sale.store', 'tiktokUser'],
      });

      if (!shipping) {
        throw new Error(`Guía ${guideNumber} no encontrada`);
      }

      const trackingData = await this.fetchTrackingStatus(shipping.numberGuide, shipping.carrier);
      
      if (trackingData) {
        await this.updateShippingStatus(shipping, trackingData);
        this.logger.log(`✅ Chequeo manual completado para guía ${guideNumber}`);
      }
    } else {
      // Ejecutar el chequeo completo
      await this.checkTrackingStatuses();
    }
  }
}