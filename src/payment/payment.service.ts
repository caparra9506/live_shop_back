import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StoreConfig } from 'src/entity/store-config.entity';
import { Store } from 'src/entity/store.entity';
import { Payment } from 'src/entity/payment.entity';
import { Cart, CartStatus } from 'src/entity/cart.entity';
import { Repository } from 'typeorm';
import Epayco from 'epayco-sdk-node';
import axios from 'axios';
import { SalesService } from 'src/sale/sale.service';
import { ElectronicBillingService } from '../electronic-billing/electronic-billing.service';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,

    @InjectRepository(StoreConfig)
    private readonly configRepository: Repository<StoreConfig>,

    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,

    private readonly salesService: SalesService,
    private readonly electronicBillingService: ElectronicBillingService,
  ) {}

  async getBanks(storeName: string): Promise<any> {
    const store = await this.storeRepository.findOne({
      where: { name: storeName },
    });

    if (!store)
      throw new HttpException('Tienda no encontrada', HttpStatus.NOT_FOUND);

    const config = await this.configRepository.findOne({
      where: { store: { id: store.id } },
    });

    // Configuración de ePayco desde variables de entorno  
    const EPAYCO_PUBLIC_KEY = process.env.EPAYCO_PUBLIC_KEY;
    const EPAYCO_PRIVATE_KEY = process.env.EPAYCO_PRIVATE_KEY;
    
    if (!EPAYCO_PUBLIC_KEY || !EPAYCO_PRIVATE_KEY) {
      throw new HttpException(
        'Credenciales de ePayco no configuradas. Verifica EPAYCO_PUBLIC_KEY y EPAYCO_PRIVATE_KEY en variables de entorno.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    
    const epayco = Epayco({
      apiKey: EPAYCO_PUBLIC_KEY,
      privateKey: EPAYCO_PRIVATE_KEY,
      lang: 'ES',
      test: config?.testMode || false,
    });

    try {
      const banks = await epayco.bank.getBanks();
      return banks;
    } catch (error) {
      console.error('Error al obtener bancos:', error);
      throw new Error('No se pudieron obtener los bancos.');
    }
  }

  async handlePaymentConfirmation(webhookData: any) {
    console.log('🔔 WEBHOOK RECIBIDO - Procesando confirmación de pago:', JSON.stringify(webhookData, null, 2));

    const { x_ref_payco, x_transaction_state, x_response, x_transaction_date, x_fecha_transaccion } = webhookData;
    
    console.log('📋 Datos extraídos del webhook:', {
      referencia: x_ref_payco,
      estado: x_transaction_state,
      respuesta: x_response,
      fecha_transaccion: x_transaction_date || x_fecha_transaccion
    });

    // Buscar el pago por referencia
    console.log('🔍 Buscando pago con referencia:', x_ref_payco);
    const payment = await this.paymentRepository.findOne({
      where: { reference: x_ref_payco },
      relations: ['sale', 'sale.shipping', 'tiktokUser', 'tiktokUser.city', 'store'],
    });

    if (!payment) {
      console.log('❌ Pago no encontrado para referencia:', x_ref_payco);
      return { status: 'payment_not_found' };
    }

    console.log('✅ Pago encontrado:', {
      id: payment.id,
      referencia: payment.reference,
      monto: payment.amount,
      cliente: payment.tiktokUser.name
    });

    // Actualizar el estado del pago en la BD
    console.log('🎯 Actualizando estado del pago en BD...');
    await this.paymentRepository.update(payment.id, {
      estado: x_transaction_state,
      respuesta: x_response,
      transactionDate: x_transaction_date || x_fecha_transaccion,
      fechaTransaccion: x_transaction_date || x_fecha_transaccion
    });
    console.log(`📊 Estado actualizado: ${x_transaction_state}, Respuesta: ${x_response}`);

    // Verificar si el pago fue exitoso
    if (x_transaction_state === 'Aceptada' && x_response === 'Aceptada') {
      console.log('✅ PAGO EXITOSO - Procediendo con procesos automáticos...');
      
      // 0. Marcar carrito como COMPLETED si la venta proviene de un carrito
      if (payment.sale?.cartId) {
        try {
          await this.cartRepository.update(payment.sale.cartId, { status: CartStatus.COMPLETED });
          console.log(`✅ Carrito ${payment.sale.cartId} marcado como COMPLETED por pago exitoso`);
        } catch (error) {
          console.error(`⚠️ Error al marcar carrito ${payment.sale.cartId} como COMPLETED:`, error.message);
        }
      }
      
      let electronicInvoiceResult = null;
      let webhookResult = null;

      // 1. Generar factura electrónica automáticamente (si está habilitada)
      try {
        console.log('📄 Verificando facturación electrónica...');
        electronicInvoiceResult = await this.generateElectronicInvoiceIfEnabled(payment);
        
        if (electronicInvoiceResult?.success) {
          console.log('✅ Factura electrónica generada exitosamente');
        } else if (electronicInvoiceResult?.skipped) {
          console.log('⚠️ Facturación electrónica omitida (no habilitada o configurada)');
        }
      } catch (error) {
        console.error('❌ ERROR generando factura electrónica:', error.message);
        // No afectar el flujo principal si falla la facturación electrónica
      }

      // 2. Generar guía de envío (movido desde sale.service.ts)
      try {
        console.log('📦 Generando guía de envío después de pago confirmado...');
        await this.generateShippingLabelAfterPayment(payment);
        console.log('✅ Guía de envío generada exitosamente');
      } catch (error) {
        console.error('❌ ERROR generando guía de envío:', error.message);
        console.error('Stack trace:', error.stack);
      }

      // 3. Enviar guía al webhook externo
      try {
        webhookResult = await this.sendShippingGuideWebhook(payment);
        console.log('🚀 Guía enviada exitosamente al webhook externo');
      } catch (error) {
        console.error('💥 ERROR enviando guía al webhook:', error.message);
        console.error('Stack trace:', error.stack);
        return { 
          status: 'partial_success', 
          message: 'Pago confirmado, factura generada, pero error enviando guía', 
          error: error.message,
          electronicInvoice: electronicInvoiceResult
        };
      }

      return { 
        status: 'success', 
        message: 'Pago confirmado y procesado exitosamente', 
        webhookResult,
        electronicInvoice: electronicInvoiceResult
      };
    } else {
      console.log('❌ PAGO NO EXITOSO:', { 
        estado_recibido: x_transaction_state, 
        respuesta_recibida: x_response,
        estado_esperado: 'Aceptada'
      });
      
      // Restaurar stock cuando el pago falla
      try {
        console.log('🔄 Iniciando rollback de stock para pago fallido...');
        await this.salesService.rollbackStock(payment.sale.id);
        console.log('✅ Stock restaurado exitosamente');
      } catch (error) {
        console.error('❌ Error en rollback de stock:', error.message);
      }
      
      return { status: 'payment_failed', message: 'Pago fallido, stock restaurado', received: { x_transaction_state, x_response } };
    }
  }

  private async sendShippingGuideWebhook(payment: Payment) {
    console.log('🌐 Preparando envío al webhook externo...');
    
    const webhookUrl = process.env.WEBHOOK_GUIA_URL;
    console.log('🔗 URL del webhook:', webhookUrl);
    
    if (!webhookUrl) {
      const error = 'WEBHOOK_GUIA_URL no está configurada en las variables de entorno';
      console.error('❌', error);
      throw new Error(error);
    }

    const guideData = {
      paymentReference: payment.reference,
      receiptNumber: payment.receiptNumber,
      saleId: payment.sale.id,
      customerName: payment.tiktokUser.name,
      customerEmail: payment.tiktokUser.email,
      customerPhone: payment.tiktokUser.phone,
      amount: payment.amount,
      shippingInfo: payment.sale.shipping ? {
        trackingNumber: payment.sale.shipping.numberGuide,
        shippingStatus: payment.sale.shipping.status,
        shippingMessage: payment.sale.shipping.message,
        shippingDate: payment.sale.shipping.dateCreate,
        recipientPhone: payment.tiktokUser.phone,
        recipientAddress: payment.tiktokUser.address,
        recipientCity: payment.tiktokUser.city?.name || 'No especificada',
      } : null,
      timestamp: new Date().toISOString(),
    };

    console.log('📦 DATOS A ENVIAR AL WEBHOOK EXTERNO:', JSON.stringify(guideData, null, 2));
    console.log('🚀 Enviando POST request a:', webhookUrl);

    try {
      const response = await axios.post(webhookUrl, guideData, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CompePues-Backend/1.0',
        },
        timeout: 15000,
      });

      console.log('✅ WEBHOOK RESPONSE STATUS:', response.status);
      console.log('✅ WEBHOOK RESPONSE HEADERS:', response.headers);
      console.log('✅ WEBHOOK RESPONSE DATA:', response.data);
      
      return {
        success: true,
        status: response.status,
        data: response.data,
        url: webhookUrl
      };
    } catch (error) {
      console.error('💥 ERROR EN REQUEST AL WEBHOOK:');
      console.error('URL:', webhookUrl);
      console.error('Error message:', error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        console.error('Response headers:', error.response.headers);
      } else if (error.request) {
        console.error('No response received:', error.request);
      } else {
        console.error('Request setup error:', error.message);
      }
      
      throw error;
    }
  }

  async processPaymentResponse(queryParams: any) {
    console.log('Procesando respuesta de pago:', queryParams);
    
    const { ref_payco, estado, respuesta } = queryParams;
    
    if (!ref_payco) {
      return { success: false, reference: null, message: 'Referencia no encontrada' };
    }

    // Buscar el pago por referencia
    const payment = await this.paymentRepository.findOne({
      where: { reference: ref_payco },
      relations: ['sale', 'sale.shipping', 'tiktokUser', 'tiktokUser.city', 'store'],
    });

    if (!payment) {
      return { success: false, reference: ref_payco, message: 'Pago no encontrado' };
    }

    // Actualizar estado del pago en BD
    console.log('📊 Actualizando estado desde respuesta...', { estado, respuesta });
    await this.paymentRepository.update(payment.id, {
      estado: estado || payment.estado,
      respuesta: respuesta || payment.respuesta,
      transactionDate: new Date().toISOString(),
      fechaTransaccion: new Date().toISOString()
    });

    // Verificar si el pago fue exitoso
    if (estado === 'Aceptada' || respuesta === 'Aceptada') {
      console.log('Pago confirmado desde respuesta, enviando guía...');
      
      try {
        await this.sendShippingGuideWebhook(payment);
        return { 
          success: true, 
          reference: ref_payco, 
          message: 'Pago confirmado y guía enviada' 
        };
      } catch (error) {
        console.error('Error enviando guía desde respuesta:', error);
        return { 
          success: true, 
          reference: ref_payco, 
          message: 'Pago confirmado pero error enviando guía' 
        };
      }
    }

    // Restaurar stock para pagos fallidos
    try {
      console.log('🔄 Pago fallido detectado, restaurando stock...');
      await this.salesService.rollbackStock(payment.sale.id);
      console.log('✅ Stock restaurado por pago fallido');
    } catch (error) {
      console.error('❌ Error restaurando stock:', error.message);
    }

    return { 
      success: false, 
      reference: ref_payco, 
      message: `Pago no exitoso: ${estado || respuesta}` 
    };
  }

  async checkPaymentStatusWithEpayco(paymentReference: string) {
    console.log('🔍 Consultando estado con ePayco API:', paymentReference);
    
    // Buscar el pago en BD
    const payment = await this.paymentRepository.findOne({
      where: { reference: paymentReference },
      relations: ['sale', 'sale.shipping', 'tiktokUser', 'store'],
    });

    if (!payment) {
      return { success: false, message: 'Pago no encontrado en BD' };
    }

    try {
      // Consultar estado directamente con ePayco
      const response = await axios.get(`https://secure.epayco.co/validation/v1/reference/${paymentReference}`, {
        timeout: 10000,
      });

      console.log('📊 Respuesta de ePayco:', response.data);

      const { success, data } = response.data;
      
      if (success && data) {
        const isAccepted = data.x_response === 'Aceptada' || data.estado === 'Aceptada';
        
        if (isAccepted) {
          console.log('✅ Pago confirmado por ePayco, enviando webhook N8N...');
          
          // Simular webhook data
          const webhookData = {
            x_ref_payco: paymentReference,
            x_transaction_state: 'Aceptada',
            x_response: 'Aceptada',
            x_transaction_date: data.fecha || new Date().toISOString(),
          };

          return await this.handlePaymentConfirmation(webhookData);
        } else {
          return { 
            success: false, 
            message: 'Pago aún pendiente o rechazado',
            epaycoData: data
          };
        }
      } else {
        return { success: false, message: 'Error consultando ePayco', response: response.data };
      }
    } catch (error) {
      console.error('❌ Error consultando ePayco:', error.message);
      return { success: false, message: 'Error de conexión con ePayco', error: error.message };
    }
  }

  private async generateElectronicInvoiceIfEnabled(payment: Payment): Promise<any> {
    try {
      console.log('🔍 Verificando configuración de facturación electrónica...');
      
      // Obtener configuración de la tienda
      const storeConfig = await this.configRepository.findOne({
        where: { store: { id: payment.store.id } },
      });

      if (!storeConfig) {
        console.log('⚠️ No se encontró configuración de tienda');
        return { success: false, skipped: true, reason: 'no_store_config' };
      }

      // Verificar si la facturación electrónica está habilitada
      if (!storeConfig.enableElectronicBilling) {
        console.log('⚠️ Facturación electrónica no está habilitada para esta tienda');
        return { success: false, skipped: true, reason: 'not_enabled' };
      }

      // Verificar configuración de FACTUS
      if (!storeConfig.factusClientId || !storeConfig.factusClientSecret || !storeConfig.factusUsername || !storeConfig.factusPassword) {
        console.log('⚠️ Configuración de FACTUS incompleta');
        return { success: false, skipped: true, reason: 'incomplete_config' };
      }

      console.log('✅ Facturación electrónica habilitada, generando factura...');

      // Determinar método de pago para FACTUS
      let paymentMethodCode = '48'; // Tarjeta de crédito por defecto
      
      // Mapear según datos del pago si es posible
      if (payment.authorization) {
        // Si tiene autorización, probablemente es tarjeta
        paymentMethodCode = '48'; // Tarjeta de crédito
      }

      const electronicInvoice = await this.electronicBillingService.generateInvoiceFromSale(
        payment.sale.id,
        paymentMethodCode
      );

      console.log('✅ Factura electrónica generada exitosamente:', {
        invoiceId: electronicInvoice.id,
        cufe: electronicInvoice.cufe,
        status: electronicInvoice.status,
        pdfUrl: electronicInvoice.pdfUrl
      });

      return {
        success: true,
        invoiceId: electronicInvoice.id,
        cufe: electronicInvoice.cufe,
        pdfUrl: electronicInvoice.pdfUrl,
        xmlUrl: electronicInvoice.xmlUrl,
        status: electronicInvoice.status,
      };
    } catch (error) {
      console.error('❌ Error generando factura electrónica:', error.message);
      
      // Verificar si es error de configuración vs error técnico
      if (error.message.includes('no está habilitada') || error.message.includes('incompleta')) {
        return { success: false, skipped: true, reason: 'config_error', error: error.message };
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Genera la guía de envío después de confirmar el pago
   * (movido desde sale.service.ts para evitar generación prematura)
   */
  private async generateShippingLabelAfterPayment(payment: Payment) {
    console.log('📦 Iniciando generación de guía para pago confirmado:', payment.reference);
    
    // Obtener datos necesarios de la venta
    const sale = payment.sale;
    const tiktokUser = payment.tiktokUser;
    const store = payment.store;
    
    if (!sale || !tiktokUser || !store) {
      throw new Error('Datos insuficientes para generar guía de envío');
    }

    // Obtener configuración de la tienda
    const storeConfig = await this.configRepository.findOne({
      where: { store: { id: store.id } },
    });

    // Usar transportadora por defecto (puede ser configurada desde el frontend)
    const defaultTransportadora = 'servientrega'; // o la lógica que prefieras
    console.log('📦 Usando transportadora por defecto:', defaultTransportadora);

    // Buscar el producto principal de la venta
    if (!sale.saleDetails || sale.saleDetails.length === 0) {
      throw new Error('No se encontraron detalles de la venta');
    }

    const firstDetail = sale.saleDetails[0];
    const product = firstDetail.product;

    if (!product) {
      throw new Error('No se encontró el producto en los detalles de la venta');
    }

    // Llamar al método de generación de guía del SalesService
    return await this.salesService.generateShippingLabel(
      sale,
      tiktokUser,
      product,
      defaultTransportadora,
      store,
    );
  }
}
