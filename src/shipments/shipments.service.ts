import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Product } from 'src/entity/product.entity';
import { Shipping } from 'src/entity/shipping.entity';
import { Store } from 'src/entity/store.entity';
import { StoreConfig } from 'src/entity/store-config.entity';
import { TikTokUser } from 'src/entity/user-tiktok.entity';
import { User } from 'src/entity/user.entity';
import { Cipher } from 'src/utils/cipher';
import { Repository } from 'typeorm';

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(Store)
    private storesRepository: Repository<Store>,

    @InjectRepository(StoreConfig)
    private storeConfigRepository: Repository<StoreConfig>,

    @InjectRepository(TikTokUser)
    private readonly userTikTokRepository: Repository<TikTokUser>,

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cipher: Cipher,

    @InjectRepository(Shipping)
    private readonly shippingRepository: Repository<Shipping>,
  ) {}

  async createShipment(
    userTikTokId: string,
    productId: string,
    storeName: string,
  ) {
    console.log('userTikTokId ', userTikTokId);
    console.log('productId ', productId);
    console.log('storeName ', storeName);

    const store = await this.storesRepository.findOne({
      where: { name: storeName },
      relations: ['owner'], // Asegurar que se carga la relación owner
    });

    console.log('store ', store);

    if (!store) {
      throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
    }

    const userTikTok = await this.userTikTokRepository.findOne({
      where: {
        id: Number(userTikTokId),
      },
    });

    console.log('userTikTok ', userTikTok);

    if (!userTikTok) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const product = await this.productRepository.findOne({
      where: {
        id: Number(productId),
      },
    });

    console.log('product ', product);

    if (!product) {
      throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
    }

    const user = await this.userRepository.findOne({
      where: {
        id: Number(store.owner?.id),
      },
    });

    console.log('user ', user);

    // 🔧 Obtener configuración de la tienda
    const storeConfig = await this.storeConfigRepository.findOne({
      where: { store: { id: store.id } },
    });

    console.log('storeConfig ', storeConfig);

    const getCurrentDate = (): string => {
      const date = new Date();
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Meses en JS van de 0 a 11
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // 📦 Usar configuración de la tienda o valores por defecto
    const originCode = storeConfig?.shippingOriginCode || String(store.city.code);
    const aplicaContrapago = storeConfig?.enableContrapago || false;
    const seguro99 = storeConfig?.enableSeguro99 || false;
    const seguro99plus = storeConfig?.enableSeguro99Plus || false;

    const providerData = {
      origen: {
        nombre: '',
        codigo: originCode,
      },
      destino: {
        nombre: '',
        codigo: String(userTikTok.city.code),
      },
      IdTipoEntrega: 1,
      IdServicio: 2,
      peso: String(product.weight),
      largo: String(product.length),
      ancho: String(product.width),
      alto: String(product.height),
      fecha: getCurrentDate(),
      AplicaContrapago: aplicaContrapago,
      valorDeclarado: String(product.price),
      seguro99: seguro99,
      seguro99plus: seguro99plus,
    };

    console.log('providerData ', providerData);

    const resultCipher = await this.cipher.decryptCifrado(user.password);

    const bandera: string = String(process.env.SHIPPING_TEST);

    let loginData;

    if (bandera === 'true') {
      loginData = {
        email: '95camilo.ochoa@gmail.com',
        password: 'Camilo95',
      };
    } else {
      loginData = {
        email: user.email,
        password: resultCipher,
      };
    }

    console.log('loginData ', loginData);

    let codigoSucursal;
    try {
      const response = await axios.post<LoginResponse>(
        'https://api.99envios.app/api/auth/login',
        loginData,
      );

      console.log(
        '✅ Respuesta de 99envíos:',
        response.data.sucursales[0].codigo_sucursal,
      );
      codigoSucursal = response.data.sucursales[0].codigo_sucursal;
    } catch (error) {
      console.error(
        '❌ Error a loguearse 99envíos:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        'No se pudo loguear en 99envíos.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const response = await axios.post<CotizacionResponse>(
        `https://integration.99envios.app/api/sucursal/cotizar/${codigoSucursal}`,
        providerData,
      );

      console.log('📋 === RESPUESTA COTIZACIÓN 99 ENVÍOS ===');
      console.log('✅ Response:', JSON.stringify(response.data, null, 2));

      // 🚨 Verificar si la respuesta contiene un mensaje de error aunque el status sea 200
      const responseStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      
      if (responseStr.includes('saldo suficiente') || 
          responseStr.includes('insufficient balance') ||
          responseStr.includes('no cuenta con saldo')) {
        console.error('❌ === ERROR DE SALDO DETECTADO EN COTIZACIÓN ===');
        console.error('💰 Mensaje interno:', responseStr);
        console.error('🏪 Store ID:', store?.id);
        console.error('📧 Usuario 99 Envíos:', user?.email);
        console.error('🚨 ACCIÓN REQUERIDA: Recargar saldo en cuenta 99 Envíos');
        console.error('❌ === FIN ERROR DE SALDO EN COTIZACIÓN ===');
        
        // Mensaje genérico para el usuario final
        throw new HttpException(
          'Error temporal en el servicio de envíos. Por favor intenta nuevamente.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      /*const response = await axios.post<CotizacionResponse>(
        `https://integration.99envios.app/api/sucursal/cotizar/668110`,
        providerData,
      );*/

      // **Filtramos solo las cotizaciones exitosas**
      const validShipments = Object.entries(response.data)
        .filter(([_, details]: [string, any]) => details.exito) // Solo dejamos los exitosos
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {} as CotizacionResponse);

      // **Si no hay ninguna cotización exitosa, lanzamos un error**
      if (Object.keys(validShipments).length === 0) {
        console.error(
          '❌ Ningún proveedor de envío pudo cotizar correctamente.',
        );
        throw new HttpException(
          'No se pudo obtener una cotización válida de ningún proveedor.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // 💰 NUEVA LÓGICA: NO sumar fee aquí, devolver precios reales de 99 Envíos
      console.log('💰 === PRECIOS DE ENVÍO REALES (SIN AJUSTES) ===');
      
      Object.entries(validShipments).forEach(([carrier, details]) => {
        const originalPrice = parseFloat(details.valor) || 0;
        console.log(`🚚 ${carrier}: $${originalPrice.toLocaleString()} (precio real)`);
      });
      
      console.log('💰 === FIN PRECIOS REALES ===');

      return validShipments;
    } catch (error) {
      console.error('❌ === ERROR AL COTIZAR EN 99 ENVÍOS ===');
      console.error('🚨 Error message:', error.message);
      console.error('📊 Status:', error.response?.status);
      console.error('📋 Response data:', JSON.stringify(error.response?.data, null, 2));
      console.error('🏪 Store ID:', store?.id);
      console.error('📧 Usuario 99 Envíos:', user?.email);
      console.error('❌ === FIN ERROR COTIZACIÓN ===');

      // Si es error de saldo insuficiente que ya fue procesado, mantenerlo
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Para otros errores de la API de 99 Envíos, revisar si contiene mensaje de saldo
      const errorMessage = error.response?.data?.message || error.response?.data || error.message;
      if (errorMessage.includes && (errorMessage.includes('saldo suficiente') || errorMessage.includes('insufficient balance'))) {
        console.error('💰 === ERROR DE SALDO EN CATCH COTIZACIÓN ===');
        console.error('🚨 ACCIÓN REQUERIDA: Recargar saldo en cuenta 99 Envíos');
        
        // Mensaje genérico para el usuario final
        throw new HttpException(
          'Error temporal en el servicio de envíos. Por favor intenta nuevamente.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      
      // Mensaje genérico para otros errores
      throw new HttpException(
        'Error temporal en el servicio de envíos. Por favor intenta nuevamente.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getShippingStatus(userId: number): Promise<any> {
    const shipments = await this.shippingRepository
      .createQueryBuilder('shipping')
      .leftJoin('shipping.sale', 'sale')
      .leftJoin('sale.store', 'store')
      .where('store.ownerId = :userId', { userId })
      .select([
        'shipping.status AS status',
        'shipping.dateCreate AS dateCreate',
      ])
      .getRawMany();

    // 📌 Agrupar estados reales de 99 Envíos en categorías para dashboard
    const categorizeStatus = (status: string): string => {
      switch (status?.toUpperCase()) {
        // Estados iniciales/pendientes
        case 'GUÍA ADMITIDA':
        case 'GENERADA':
        case 'CREADA':
        case 'RECIBIDA':
        case 'PROCESADA':
          return 'pending';
        
        // Estados en tránsito
        case 'TRANSITO URBANO':
        case 'CENTRO DE ACOPIO':
        case 'TELEMERCADO':
        case 'REENVÍO':
        case 'REPARTO':
          return 'inTransit';
        
        // Estados entregados
        case 'ENTREGADA':
        case 'FINALIZADA':
          return 'delivered';
        
        // Estados cancelados/devueltos
        case 'DEVOLUCIÓN RATIFICADA':
        case 'DEVUELTA':
        case 'CANCELADA':
        case 'NO_ENTREGADA':
        case 'RETENIDA':
          return 'cancelled';
        
        default:
          return 'pending'; // Default para estados desconocidos
      }
    };

    // 📌 Contar el número de envíos por categoría
    const statusCounts = {
      pending: 0,
      inTransit: 0,
      delivered: 0,
      cancelled: 0,
      total: shipments.length,
    };

    shipments.forEach((shipment) => {
      const category = categorizeStatus(shipment.status);
      statusCounts[category]++;
    });

    // 📌 Calcular el tiempo promedio de entrega en días
    let totalDeliveryTime = 0;
    let deliveredCount = 0;

    shipments.forEach((shipment) => {
      const category = categorizeStatus(shipment.status);
      if (category === 'delivered' && shipment.dateCreate) {
        const createdDate = new Date(shipment.dateCreate);
        const deliveredDate = new Date(); // simular como entregado hoy
        const diffTime = Math.abs(
          deliveredDate.getTime() - createdDate.getTime(),
        );
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        totalDeliveryTime += diffDays;
        deliveredCount++;
      }
    });

    const avgDeliveryTime = deliveredCount
      ? (totalDeliveryTime / deliveredCount).toFixed(1)
      : '0';

    return {
      pending: statusCounts.pending,
      inTransit: statusCounts.inTransit,
      delivered: statusCounts.delivered,
      cancelled: statusCounts.cancelled,
      totalShipments: statusCounts.total,
      avgDeliveryTime: `${avgDeliveryTime} days`,
    };
  }



  async updateShippingStatusByGuide(guideNumber: string, newStatus: string) {
    const shipping = await this.shippingRepository.findOne({
      where: { numberGuide: guideNumber },
    });

    if (!shipping) {
      throw new HttpException('Guía no encontrada', HttpStatus.NOT_FOUND);
    }

    shipping.status = newStatus.toUpperCase();
    return await this.shippingRepository.save(shipping);
  }

  /**
   * 📦 Procesa actualizaciones de tracking desde webhooks externos
   * Ejemplo de payload: {"guia":"014153463491","transportadora":{"pais":"colombia","nombre":"envia"},"origenCreacion":1}
   */
  async processTrackingUpdate(trackingData: any) {
    try {
      const { guia, transportadora, origenCreacion } = trackingData;

      if (!guia) {
        throw new HttpException('Número de guía requerido', HttpStatus.BAD_REQUEST);
      }

      // Buscar el envío por número de guía
      const shipping = await this.shippingRepository.findOne({
        where: { numberGuide: guia },
        relations: ['sale', 'tiktokUser'],
      });

      if (!shipping) {
        console.log(`⚠️ Guía ${guia} no encontrada en la base de datos`);
        return {
          success: false,
          message: 'Guía no encontrada',
          guia,
        };
      }

      // Validar que la transportadora coincida
      const carrierFromWebhook = transportadora?.nombre?.toLowerCase();
      if (shipping.carrier && carrierFromWebhook) {
        if (shipping.carrier.toLowerCase() !== carrierFromWebhook) {
          console.log(`⚠️ Transportadora no coincide: DB=${shipping.carrier}, Webhook=${carrierFromWebhook}`);
        }
      }

      // Actualizar información del tracking
      let newStatus = shipping.status;
      let message = `Actualización automática de tracking desde ${transportadora?.nombre || 'transportadora'}`;

      // Mapear estado basado en origenCreacion u otros datos del webhook
      switch (origenCreacion) {
        case 1:
          newStatus = 'TRANSITO URBANO';
          message = `Envío en tránsito con ${transportadora?.nombre}`;
          break;
        case 2:
          newStatus = 'ENTREGADA';
          message = `Envío entregado por ${transportadora?.nombre}`;
          break;
        default:
          newStatus = 'PROCESADA';
          message = `Envío procesado por ${transportadora?.nombre}`;
      }

      // Actualizar el envío
      shipping.status = newStatus;
      shipping.message = `${shipping.message} | ${message}`;
      
      const updatedShipping = await this.shippingRepository.save(shipping);

      console.log(`✅ Tracking actualizado para guía ${guia}: ${newStatus}`);

      return {
        success: true,
        message: 'Tracking actualizado exitosamente',
        guia,
        status: newStatus,
        carrier: shipping.carrier,
        updatedAt: new Date(),
      };

    } catch (error) {
      console.error('❌ Error procesando actualización de tracking:', error);
      throw new HttpException(
        'Error procesando actualización de tracking',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 🔍 Obtiene información de tracking por número de guía
   */
  async getTrackingInfo(guideNumber: string) {
    const shipping = await this.shippingRepository.findOne({
      where: { numberGuide: guideNumber },
      relations: ['sale', 'sale.store', 'tiktokUser'],
    });

    if (!shipping) {
      throw new HttpException('Guía no encontrada', HttpStatus.NOT_FOUND);
    }

    return {
      guia: shipping.numberGuide,
      status: shipping.status,
      carrier: shipping.carrier,
      dateCreate: shipping.dateCreate,
      message: shipping.message,
      sale: {
        id: shipping.sale.id,
        totalAmount: shipping.sale.totalAmount,
        store: shipping.sale.store.name,
      },
      customer: {
        name: shipping.tiktokUser.name,
        phone: shipping.tiktokUser.phone,
        email: shipping.tiktokUser.email,
      },
    };
  }
  
}
