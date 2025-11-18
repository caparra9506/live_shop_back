import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartStatus } from '../entity/cart.entity';
import { CartItem } from '../entity/cart-item.entity';
import { Sale } from '../entity/sale.entity';
import { Product } from '../entity/product.entity';
import { Coupon } from '../entity/coupon.entity';
import { SaleDetail } from 'src/entity/sale-detail.entity';
import { CouponUsage } from 'src/entity/coupon-usage.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { TikTokUser } from 'src/entity/user-tiktok.entity';
import { Store } from 'src/entity/store.entity';
import { GuiaResponse } from './dto/guia-response';
import { Shipping } from 'src/entity/shipping.entity';
import { User } from 'src/entity/user.entity';
import { Cipher } from 'src/utils/cipher';
import { StoreConfig } from 'src/entity/store-config.entity';
import { v4 as uuidv4 } from 'uuid';
import { Payment } from 'src/entity/payment.entity';
import axios from 'axios';
import Epayco from 'epayco-sdk-node';
import { ElectronicBillingService } from '../electronic-billing/electronic-billing.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,

    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(CouponUsage)
    private readonly couponUsageRepository: Repository<CouponUsage>,

    @InjectRepository(TikTokUser)
    private readonly registeredUsersRepository: Repository<TikTokUser>,

    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,

    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,

    @InjectRepository(Shipping)
    private readonly shippingRepository: Repository<Shipping>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(StoreConfig)
    private readonly configRepository: Repository<StoreConfig>,

    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,

    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,

    private readonly cipher: Cipher,
    private readonly electronicBillingService: ElectronicBillingService,
  ) {}

  parseFullName(fullName: string = '') {
    const nameParts = fullName.trim().split(/\s+/);
    let nombre = '',
      primerApellido = '',
      segundoApellido = '';

    if (nameParts.length >= 3) {
      segundoApellido = nameParts.pop()!;
      primerApellido = nameParts.pop()!;
      nombre = nameParts.join(' ');
    } else if (nameParts.length === 2) {
      [nombre, primerApellido] = nameParts;
    } else if (nameParts.length === 1) {
      nombre = nameParts[0];
    }

    return { nombre, primerApellido, segundoApellido };
  }

  async createSale(dto: CreateSaleDto) {
    const {
      userTikTokId,
      storeName,
      products,
      couponCode,
      shippingCost,
      transportadora,
      bankCode,
      cartId,
    } = dto;

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
    const EPAYCO_EMAIL = process.env.EPAYCO_EMAIL;
    
    if (!EPAYCO_PUBLIC_KEY || !EPAYCO_PRIVATE_KEY || !EPAYCO_EMAIL) {
      throw new HttpException(
        'Credenciales de ePayco no configuradas. Verifica EPAYCO_PUBLIC_KEY, EPAYCO_PRIVATE_KEY y EPAYCO_EMAIL en variables de entorno.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    
    console.log('🔧 Configuración ePayco (desde variables de entorno):', {
      testMode: config?.testMode || false,
      hasPublicKey: !!EPAYCO_PUBLIC_KEY,
      hasPrivateKey: !!EPAYCO_PRIVATE_KEY,
      publicKeyLength: EPAYCO_PUBLIC_KEY.length
    });

    const isTestMode = Boolean(config?.testMode || false);
    
    const epayco = Epayco({
      apiKey: EPAYCO_PUBLIC_KEY, 
      privateKey: EPAYCO_PRIVATE_KEY, 
      lang: 'ES',
      test: isTestMode,
      // Configuraciones adicionales para manejar problemas de conectividad
      timeout: 60000, // 60 segundos timeout
      retry: 3, // 3 reintentos
    });
    
    console.log('🔧 ePayco inicializado en modo:', isTestMode ? 'PRUEBA' : 'PRODUCCIÓN');

    // 🔍 TEST: Verificar credenciales (temporalmente deshabilitado por problemas de DNS)
    console.log('⚠️ Verificación de credenciales omitida debido a problemas de conectividad DNS');
    /* TEMPORALMENTE COMENTADO - PROBLEMAS DE DNS
    try {
      console.log('🏦 === PROBANDO CREDENCIALES EPAYCO ===');
      const banksTest = await epayco.bank.getBanks();
      console.log('✅ Credenciales ePayco VÁLIDAS - Bancos obtenidos:', banksTest.data ? 'OK' : 'ERROR');
      console.log('🏦 === FIN TEST CREDENCIALES ===');
    } catch (credError) {
      console.error('❌ === CREDENCIALES EPAYCO INVÁLIDAS ===');
      console.error('🚨 Error al obtener bancos:', credError.message);
      console.error('💡 Esto indica que las API Keys están mal configuradas');
      console.error('❌ === FIN ERROR CREDENCIALES ===');
      throw new HttpException(
        'Credenciales de ePayco inválidas. Verifica las API Keys en la configuración.',
        HttpStatus.BAD_REQUEST,
      );
    }
    */

    const tiktokUser = await this.registeredUsersRepository.findOne({
      where: { id: userTikTokId },
      relations: ['city'],
    });
    if (!tiktokUser)
      throw new HttpException(
        'Usuario TikTok no encontrado',
        HttpStatus.NOT_FOUND,
      );

    // Validar cupón
    let discountAmount = 0;
    if (couponCode) {
      const coupon = await this.couponRepository.findOne({
        where: { code: couponCode, store, isActive: true },
      });
      if (!coupon)
        throw new HttpException(
          'Cupón no válido o inactivo',
          HttpStatus.BAD_REQUEST,
        );

      const alreadyUsed = await this.couponUsageRepository.findOne({
        where: { coupon, userTikTok: tiktokUser },
      });
      if (alreadyUsed)
        throw new HttpException('Cupón ya usado', HttpStatus.BAD_REQUEST);

      const subtotal = products.reduce(
        (sum, p) => sum + p.price * p.quantity,
        0,
      );
      discountAmount =
        coupon.discountType === 'PERCENTAGE'
          ? (subtotal * coupon.discountValue) / 100
          : coupon.discountValue;

      await this.couponUsageRepository.save({
        coupon,
        userTikTok: tiktokUser,
        usedAt: new Date(),
      });
    }

    const totalAmount =
      products.reduce((sum, p) => sum + p.price * p.quantity, 0) -
      discountAmount +
      shippingCost;

    if (isNaN(totalAmount) || !isFinite(totalAmount)) {
      throw new Error('TotalAmount inválido: ' + totalAmount);
    }

    // Validar monto mínimo de ePayco (normalmente $300 COP)
    if (totalAmount < 300) {
      throw new HttpException(
        `El monto mínimo para procesar un pago es $300 COP. Monto actual: $${totalAmount} COP`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const sale = this.saleRepository.create({ store, totalAmount, shippingCost, discountAmount, cartId });
    const savedSale = await this.saleRepository.save(sale);

    let finalProduct: Product | null = null;

    if (!products || products.length === 0) {
      throw new Error('No se recibieron productos en la venta.');
    }

    for (const item of products) {
      if (!item.quantity || !item.price) {
        throw new Error(`Producto inválido: ${JSON.stringify(item)}`);
      }

      const product = await this.productRepository.findOne({
        where: { id: item.productId },
      });
      if (!product) continue;
      
      // Validar stock disponible
      if (product.stock < item.quantity) {
        throw new HttpException(
          `Stock insuficiente para el producto ${product.name}. Stock disponible: ${product.stock}, solicitado: ${item.quantity}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      
      // Reducir stock del producto
      product.stock -= item.quantity;
      product.inStock = product.stock > 0;
      await this.productRepository.save(product);
      
      finalProduct = product;

      await this.saleDetailRepository.save({
        sale: savedSale,
        tiktokUser,
        quantity: item.quantity,
        price: item.price,
        product,
        productVariant: item.productVariantId
          ? { id: item.productVariantId }
          : null,
      });
    }

    // Nota: La generación de guía se ha movido a payment.service.ts 
    // para que se ejecute DESPUÉS de confirmar el pago con ePayco

    if (!tiktokUser.name) {
      throw new HttpException(
        'El nombre del usuario es requerido',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Preparar pago
    const { nombre, primerApellido, segundoApellido } = this.parseFullName(
      tiktokUser.name,
    );

    // 💰 Calcular split payment si está habilitado
    let platformCommission = 0;
    let storeAmount = totalAmount;
    let epaycoR: any;
    let epaycoRes: any;
    
    epaycoR = {
        bank: bankCode.toString(),
        invoice: `${uuidv4()}`,
        description: finalProduct?.name.toString(),
        value: totalAmount.toString(),
        tax: "0",
        tax_base: "0",
        currency: "COP",
        type_person: tiktokUser.personType.toString(),
        doc_type: tiktokUser.documentType.toString(),
        doc_number: tiktokUser.document.toString(),
        name: nombre,
        last_name: `${primerApellido} ${segundoApellido}`.trim(),
        email: tiktokUser.email.toString(),
        country: "CO",
        cell_phone: tiktokUser.phone.toString(),
        ip: "190.85.50.2", // IP requerida según documentación
        url_response: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/payment-success`,
        url_confirmation: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/webhook/epayco`,
        metodoconfirmacion: "POST",
        // Campos extra según documentación
        extra1: "",
        extra2: "",
        extra3: "",
        extra4: "",
        extra5: "",
        extra6: "",
    };

    // 🔄 Split payment NEW: Comisión descontada del producto
    const splitEnabled = process.env.ENABLE_SPLIT_PAYMENT === 'true';
    const minimumAmount = parseInt(process.env.SPLIT_MINIMUM_AMOUNT || "1000");
    const platformCommissionFee = 1000; // Comisión fija de la plataforma
    
    // 💡 NUEVA LÓGICA DE COMISIÓN:
    // - Descontar $1.000 del valor de productos (comisión plataforma)
    // - Transferir (productos - comisión) + envío completo
    // - Plataforma se queda con los $1.000 descontados
    const productValue = products.reduce((sum, p) => sum + p.price * p.quantity, 0) - discountAmount;
    const productValueAfterCommission = productValue - platformCommissionFee; // Descontar comisión del producto
    storeAmount = productValueAfterCommission + shippingCost; // Lo que se transfiere (productos - comisión + envío)
    platformCommission = platformCommissionFee; // Lo que se queda la plataforma ($1.000)
    
    if (splitEnabled && totalAmount >= minimumAmount) {
      console.log('🆕 === NUEVA LÓGICA COMISIÓN EN PRODUCTOS ===');
      console.log('💰 Valor productos original:', productValue.toLocaleString(), 'COP');
      console.log('💸 Comisión plataforma (descontada):', platformCommissionFee.toLocaleString(), 'COP'); 
      console.log('🏪 Productos después de comisión:', productValueAfterCommission.toLocaleString(), 'COP');
      console.log('📦 Costo envío real:', shippingCost.toLocaleString(), 'COP');
      console.log('📤 Total a transferir (productos - comisión + envío):', storeAmount.toLocaleString(), 'COP');
      console.log('🏦 Comisión neta plataforma:', platformCommission.toLocaleString(), 'COP');
      
      // Obtener configuración de la tienda para split payment
      const storeConfig = await this.configRepository.findOne({
        where: { store: { id: store.id } }
      });
      
      // Constantes ePayco de la plataforma
      const platformId = "877999";      // Plataforma (primary receiver - constante)
      const storeId = storeConfig?.merchantId || "1553366";  // Merchant ID de la tienda (dinámico)
      const splitRuleCode = process.env.EPAYCO_SPLIT_RULE_CODE || "multiple";
      
      console.log('🔧 === CONFIGURACIÓN SPLIT (COMISIÓN EN PRODUCTOS) ===');
      console.log('🏦 Platform ID (primary receiver):', platformId);
      console.log('🏪 Store ID (recibe transfer):', storeId);
      console.log('📜 Split Rule:', splitRuleCode);
      console.log('💰 Total transacción:', totalAmount);
      console.log('📤 Transfer a tienda (productos - comisión + envío):', storeAmount);
      console.log('🏦 Se queda en plataforma (comisión $1.000):', platformCommission);
      console.log('🔧 === FIN CONFIG SPLIT ===');
      
      epaycoR.splitpayment = "true";
      epaycoR.split_app_id = platformId;        // ID de la plataforma (como antes)
      epaycoR.split_merchant_id = platformId;   // ID del comercio que recibe inicialmente (como antes)
      epaycoR.split_type = "01";                // 01 = monto fijo
      epaycoR.split_primary_receiver = platformId; // ID del receptor principal (plataforma - como antes)
      epaycoR.split_primary_receiver_fee = "0"; // Fee del receptor principal
      epaycoR.split_rule = splitRuleCode;       // Código de regla desde environment
      epaycoR.split_receivers = JSON.stringify([
        { 
          "id": storeId,                        // ID de la tienda (1553366)
          "total": totalAmount.toString(),      // Total de la transacción ($86.000)
          "iva": "0", 
          "base_iva": "0", 
          "fee": storeAmount.toString()         // Transfer a tienda ($80.000 - productos)
        }
      ]);
      
      console.log(`💰 Split Payment: Plataforma recibe $${totalAmount.toLocaleString()} COP, transfiere $${storeAmount.toLocaleString()} COP a tienda`);
      console.log(`🏦 Plataforma ID: ${platformId} (se queda con $1.000 comisión)`);
      console.log(`🏪 Tienda ID: ${storeId} (recibe productos - comisión + envío)`);
      console.log(`📊 Parámetros split enviados:`, {
        splitpayment: epaycoR.splitpayment,
        split_app_id: epaycoR.split_app_id,
        split_merchant_id: epaycoR.split_merchant_id,
        split_type: epaycoR.split_type,
        split_primary_receiver: epaycoR.split_primary_receiver,
        split_primary_receiver_fee: epaycoR.split_primary_receiver_fee,
        split_rule: epaycoR.split_rule,
        split_receivers: epaycoR.split_receivers
      });
    } else if (!splitEnabled) {
      console.log(`🚫 Split Payment DESHABILITADO por configuración (ENABLE_SPLIT_PAYMENT=${process.env.ENABLE_SPLIT_PAYMENT})`);
      platformCommission = 0; // Sin split, sin comisión
      storeAmount = totalAmount; // Todo va a la tienda
    } else {
      console.log(`⚠️  Split Payment omitido: Monto total ($${totalAmount.toLocaleString()}) es menor a $${minimumAmount.toLocaleString()} COP`);
      platformCommission = 0; // Sin split, sin comisión
      storeAmount = totalAmount; // Todo va a la tienda
    }
    
    console.log('💳 === ENVIANDO A EPAYCO ===');
    console.log('📋 Datos completos del request:', JSON.stringify(epaycoR, null, 2));
    console.log('💳 === FIN DATOS EPAYCO ===');
    
    try {
      // Split payments se manejan a través del mismo endpoint bank.create()
      if (splitEnabled && totalAmount >= minimumAmount && epaycoR.splitpayment) {
        console.log('🔀 Enviando pago con split payment activado...');
      } else {
        console.log('💳 Enviando pago normal sin split...');
      }
      
      // Retry logic para problemas de conectividad Y fallback para problemas de split
      let retries = 3;
      let splitPaymentAttempted = false;
      
      while (retries > 0) {
        try {
          epaycoRes = await epayco.bank.create(epaycoR);
          console.log('✅ Conexión exitosa con ePayco');
          
          // Verificar si la respuesta indica error de split payment
          if (!epaycoRes.success && epaycoRes.data?.errores?.length > 0) {
            const isSplitRuleError = epaycoRes.data.errores.some(err => 
              err.codError === 'S000' || err.codError === 'S001' || err.codError === 'S003'
            );
            
            if (isSplitRuleError && epaycoR.splitpayment) {
              console.log('❌ ERROR CRÍTICO: Split payment falló - NO se permite fallback');
              console.log('📋 Errores específicos:', JSON.stringify(epaycoRes.data.errores, null, 2));
              
              throw new HttpException(
                `Error crítico de Split Payment. ` +
                `Errores: ${epaycoRes.data.errores.map(err => `${err.codError}: ${err.errorMessage}`).join(', ')}. ` +
                `Contacta a ePayco para configurar correctamente el split payment.`,
                HttpStatus.BAD_REQUEST
              );
            }
          }
          
          break; // Si funciona o no es error de split, salir del loop
        } catch (error) {
          retries--;
          
          // Verificar si es error de regla split en la excepción
          const errorData = error.response?.data || error.data || {};
          const isSplitRuleError = errorData.errores?.some(err => 
            err.codError === 'S000' || err.codError === 'S001' || err.codError === 'S003'
          ) || error.message?.includes('split');
          
          if (isSplitRuleError && epaycoR.splitpayment) {
            console.log('❌ ERROR CRÍTICO: Split payment falló en excepción - NO se permite fallback');
            console.log('📋 Error detectado:', error.message);
            
            throw new HttpException(
              `Error crítico de Split Payment. ` +
              `Error: ${error.message}. ` +
              `Contacta a ePayco para configurar correctamente el split payment.`,
              HttpStatus.BAD_REQUEST
            );
          }
          
          const isNetworkError = error.code === 'EAI_AGAIN' || 
                                error.code === 'ENOTFOUND' ||
                                error.code === 'ECONNREFUSED' ||
                                error.message?.includes('getaddrinfo');
          
          console.log(`🔄 Reintento ${4 - retries}/3 - ${isNetworkError ? 'Error DNS/Red' : 'Error ePayco'}:`, error.message);
          
          if (retries === 0) {
            if (isNetworkError) {
              throw new HttpException(
                'Error de conectividad con ePayco. El servidor no puede acceder a los servicios de ePayco. Contacta al administrador del sistema.',
                HttpStatus.SERVICE_UNAVAILABLE,
              );
            }
            throw error; // Si agotamos reintentos, lanzar error original
          }
          
          // Esperar más tiempo para errores de DNS
          const waitTime = isNetworkError ? 5000 : 2000;
          console.log(`⏱️ Esperando ${waitTime/1000} segundos antes del reintento...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    
      console.log('✅ Transacción ePayco creada exitosamente:', epaycoRes?.data?.ref_payco);
    } catch (error) {
      console.error('🧨 Error al crear transacción con ePayco:', error);
      
      // Verificar si es un error de red
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new HttpException(
          'Error de conexión con ePayco. Verifica tu conexión a internet.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      
      throw new HttpException(
        'Error al procesar el pago con ePayco: ' + (error.message || 'Error desconocido'),
        HttpStatus.BAD_REQUEST,
      );
    }

    console.log('🔍 === RESPUESTA COMPLETA DE EPAYCO ===');
    console.log('📦 epaycoRes completo:', JSON.stringify(epaycoRes, null, 2));
    console.log('✅ Success:', epaycoRes.success);
    console.log('📊 epaycoRes.data:', JSON.stringify(epaycoRes.data, null, 2));
    
    if (!epaycoRes.success) {
      console.error('❌ === ERROR EN EPAYCO ===');
      console.error('🚨 Title:', epaycoRes.title_response);
      console.error('💬 Message:', epaycoRes.text_response);
      console.error('🔍 Last Action:', epaycoRes.last_action);
      console.error('📊 Total errores:', epaycoRes.data?.totalerrores);
      console.error('🔍 Errores específicos:', JSON.stringify(epaycoRes.data?.errores, null, 2));
      console.error('❌ === FIN ERROR EPAYCO ===');
    }
    
    console.log('🎯 Campos específicos:');
    console.log('   - ref_payco:', epaycoRes.data?.ref_payco);
    console.log('   - recibo:', epaycoRes.data?.recibo);
    console.log('   - receipt:', epaycoRes.data?.receipt);
    console.log('   - urlbanco:', epaycoRes.data?.urlbanco);
    console.log('   - estado:', epaycoRes.data?.estado);
    console.log('🔍 === FIN RESPUESTA EPAYCO ===');

    // Si ePayco devuelve error, no continuar con el pago
    if (!epaycoRes.success) {
      throw new HttpException(
        `Error de ePayco: ${epaycoRes.text_response}. Errores: ${epaycoRes.data?.totalerrores}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const paymentReference = epaycoRes.data?.ref_payco || '';
    const receiptNumber = epaycoRes.data?.recibo || epaycoRes.data?.receipt || '';
    
    console.log('💾 GUARDANDO PAYMENT EN BASE DE DATOS:');
    console.log('   📋 Referencia:', paymentReference);
    console.log('   🧾 Recibo:', receiptNumber);
    console.log('   💰 Monto:', totalAmount);
    console.log('   🔐 Autorización:', epaycoRes.data?.autorizacion);
    console.log('   🆔 Transaction ID:', epaycoRes.data?.transactionID);
    console.log('   📄 Factura:', epaycoRes.data?.factura);
    console.log('   🎫 Ticket ID:', epaycoRes.data?.ticketId);
    console.log('   📊 Estado:', epaycoRes.data?.estado);
    console.log('   💬 Respuesta:', epaycoRes.data?.respuesta);
    console.log('   📅 Fecha:', epaycoRes.data?.fecha);

    const payment = this.paymentRepository.create({
      amount: totalAmount,
      store,
      tiktokUser,
      sale: savedSale,
      shipping: null, // Será generado después del pago
      reference: paymentReference,
      receiptNumber: receiptNumber,
      // 🏦 Datos adicionales de ePayco
      authorization: epaycoRes.data?.autorizacion || null,
      transactionId: epaycoRes.data?.transactionID || null,
      invoice: epaycoRes.data?.factura || null,
      ticketId: epaycoRes.data?.ticketId || null,
      estado: epaycoRes.data?.estado || 'Pendiente',
      respuesta: epaycoRes.data?.respuesta || 'Pendiente',
      transactionDate: epaycoRes.data?.fecha || null,
      fechaTransaccion: epaycoRes.data?.fecha || null,
      // 💰 Datos del Split Payment (fijo 1.000 pesos)
      platformCommission: platformCommission,
      storeAmount: storeAmount,
      splitReference: paymentReference, // Misma referencia para tracking
      splitStatus: totalAmount >= minimumAmount ? 'PENDING' : null,
    });
    
    const savedPayment = await this.paymentRepository.save(payment);
    console.log('✅ PAYMENT GUARDADO CON ID:', savedPayment.id);
    console.log('✅ REFERENCIA CONFIRMADA EN BD:', savedPayment.reference);

    // ✅ VENTA CREADA - El webhook se ejecutará cuando el usuario vea la página de éxito

    const response = {
      message: 'Venta registrada exitosamente',
      saleId: savedSale.id,
      totalAmount,
      discountApplied: discountAmount,
      shippingCost,
      urlBanco: epaycoRes.data?.urlbanco,
      shipping: {
        status: 'PENDIENTE_PAGO',
        trackingNumber: null,
        carrier: null,
        message: 'Guía se generará después de confirmar el pago',
        hasError: false,
        pdfUrl: null
      }
    };

    console.log('🎯 === RESPUESTA AL FRONTEND ===');
    console.log('📤 Response:', JSON.stringify(response, null, 2));
    console.log('🔗 urlBanco a devolver:', epaycoRes.data?.urlbanco);
    console.log('🎯 === FIN RESPUESTA ===');

    // Nota: El carrito se marcará como COMPLETED solo cuando el pago sea exitoso (en payment.service.ts)

    return response;
  }

  async generateElectronicInvoiceForSale(saleId: number, paymentMethodCode: string = '48'): Promise<any> {
    try {
      console.log(`📄 Generando factura electrónica para venta ${saleId}...`);
      
      // Verificar que el servicio de facturación electrónica esté disponible
      if (!this.electronicBillingService) {
        console.log('⚠️ Servicio de facturación electrónica no disponible');
        return null;
      }

      const electronicInvoice = await this.electronicBillingService.generateInvoiceFromSale(
        saleId,
        paymentMethodCode
      );
      
      console.log(`✅ Factura electrónica generada con ID: ${electronicInvoice.id}`);
      console.log(`📋 CUFE: ${electronicInvoice.cufe}`);
      console.log(`🔗 PDF: ${electronicInvoice.pdfUrl}`);
      
      return {
        success: true,
        invoiceId: electronicInvoice.id,
        cufe: electronicInvoice.cufe,
        pdfUrl: electronicInvoice.pdfUrl,
        xmlUrl: electronicInvoice.xmlUrl,
        status: electronicInvoice.status,
      };
    } catch (error) {
      console.error(`❌ Error generando factura electrónica para venta ${saleId}:`, error.message);
      
      // No lanzar error para no afectar el flujo principal de ventas
      return {
        success: false,
        error: error.message,
        saleId,
      };
    }
  }

  async generateShippingLabel(
    sale: Sale,
    userTikTok: TikTokUser,
    product: Product,
    transportadora: string,
    store: Store,
  ): Promise<Shipping> {

    // 🔧 Obtener configuración de la tienda para envío gratis
    const storeConfig = await this.configRepository.findOne({
      where: { store: { id: store.id } },
    });

    // Si es envío gratis configurado o transportadora específica de gratis, crear envío local sin 99 Envíos
    const enableFreeShipping = storeConfig?.enableFreeShipping || false;
    
    if (transportadora === 'envio_gratis' || enableFreeShipping) {
      const localMessage = enableFreeShipping 
        ? 'Envío gratis configurado - Modo testing'
        : 'Envío sin costo - No requiere transportadora externa';
      
      console.log('🆓 Envío gratis activado:', {
        storeId: store.id,
        enableFreeShipping,
        transportadora,
        reason: enableFreeShipping ? 'Configuración de tienda' : 'Transportadora específica'
      });
      
      const shipping = this.shippingRepository.create({
        numberGuide: `LOCAL-${sale.id}-${Date.now()}`,
        dateCreate: new Date(),
        message: localMessage,
        status: 'GUÍA ADMITIDA',
        carrier: 'envio_gratis',
        codigoSucursal: null,
        pdfUrl: localMessage, // Mismo valor que message
        sale,
        tiktokUser: userTikTok,
      });

      return await this.shippingRepository.save(shipping);
    }

    // Ya tenemos storeConfig de arriba, usamos la misma configuración
    const enableContrapago = storeConfig?.enableContrapago || false;
    const enableSeguro99 = storeConfig?.enableSeguro99 || false;
    const enableSeguro99Plus = storeConfig?.enableSeguro99Plus || false;

    console.log('🚚 Configuración envío:', {
      storeId: store.id,
      enableContrapago,
      enableSeguro99,
      enableSeguro99Plus,
      transportadora,
    });

    const { nombre, primerApellido, segundoApellido } = this.parseFullName(
      userTikTok.name,
    );

    const shippingData = {
      IdTipoEntrega: 1,
      IdServicio: 1,
      AplicaContrapago: enableContrapago,
      seguro99: enableSeguro99,
      seguro99plus: enableSeguro99Plus,
      peso: product.weight,
      largo: product.length,
      ancho: product.width,
      alto: product.height,
      Observaciones: product.name,
      diceContener: product.name,
      origenCreacion: 1,
      valorDeclarado: product.price,
      Destinatario: {
        tipoDocumento: userTikTok.documentType,
        numeroDocumento: userTikTok.document,
        nombre,
        primerApellido,
        segundoApellido,
        telefono: userTikTok.phone,
        correo: userTikTok.email,
        direccion: userTikTok.address,
        idLocalidad: userTikTok.city.code,
      },
      transportadora: {
        pais: 'colombia',
        nombre: transportadora,
        aplicaContrapago: enableContrapago,
      },
    };

    const bandera = process.env.SHIPPING_TEST === 'true';
    const user = await this.userRepository.findOne({
      where: { id: Number(store.owner.id) },
    });
    const password = bandera
      ? 'Camilo95'
      : await this.cipher.decryptCifrado(user.password);
    const loginData = {
      email: bandera ? '95camilo.ochoa@gmail.com' : user.email,
      password,
    };

    console.log('🔐 === DATOS LOGIN 99 ENVÍOS ===');
    console.log('📧 Email:', loginData.email);
    console.log('🔒 Test mode:', bandera);
    console.log('🏪 Store ID:', store.id);
    
    const loginRes = await axios.post(
      'https://api.99envios.app/api/auth/login',
      loginData,
    );
    const token = loginRes.data.token;
    const codigoSucursal = loginRes.data.sucursales[0].codigo_sucursal;

    console.log('✅ Login exitoso - Código sucursal:', codigoSucursal);
    console.log('🚚 === DATOS ENVÍO A 99 ENVÍOS ===');
    console.log('🎯 URL:', `https://integration1.99envios.app/api/sucursal/preenvio/${codigoSucursal}`);
    console.log('📦 Request:', JSON.stringify(shippingData, null, 2));

    let preEnvioRes;
    try {
      preEnvioRes = await axios.post<GuiaResponse>(
        `https://integration1.99envios.app/api/sucursal/preenvio/${codigoSucursal}`,
        shippingData,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      
      console.log('📋 === RESPUESTA 99 ENVÍOS ===');
      console.log('✅ Response:', JSON.stringify(preEnvioRes.data, null, 2));
      
      // 🚨 Verificar si la respuesta contiene un mensaje de error aunque el status sea 200
      const responseStr = typeof preEnvioRes.data === 'string' ? preEnvioRes.data : JSON.stringify(preEnvioRes.data);
      
      if (responseStr.includes('saldo suficiente') || 
          responseStr.includes('insufficient balance') ||
          responseStr.includes('no cuenta con saldo')) {
        console.error('❌ === ERROR DE SALDO DETECTADO EN RESPUESTA - CONTINUANDO SIN GUÍA ===');
        console.error('💰 Mensaje interno:', responseStr);
        console.error('🏪 Store ID:', store.id);
        console.error('📧 Usuario 99 Envíos:', loginData.email);
        console.error('🚨 ACCIÓN REQUERIDA: Recargar saldo en cuenta 99 Envíos');
        console.error('✅ La venta continuará sin generar guía de envío');
        console.error('❌ === FIN ERROR DE SALDO ===');
        
        // Crear shipping con error pero permitir continuar la venta
        const errorShipping = this.shippingRepository.create({
          numberGuide: `ERROR-SALDO-${sale.id}-${Date.now()}`,
          dateCreate: new Date(),
          message: '❌ Error: Saldo insuficiente en 99 Envíos. Guía pendiente.',
          status: 'ERROR SALDO',
          carrier: transportadora,
          codigoSucursal: null,
          pdfUrl: null,
          sale,
          tiktokUser: userTikTok,
        });

        return await this.shippingRepository.save(errorShipping);
      }
      
      // Verificar que la respuesta tenga la estructura esperada
      if (typeof preEnvioRes.data === 'string' && !preEnvioRes.data.includes('numeroPreenvio')) {
        console.error('❌ === RESPUESTA INESPERADA DE 99 ENVÍOS - CONTINUANDO SIN GUÍA ===');
        console.error('📋 Response:', responseStr);
        console.error('🏪 Store ID:', store.id);
        console.error('✅ La venta continuará sin generar guía de envío');
        
        // Crear shipping con error pero permitir continuar la venta
        const errorShipping = this.shippingRepository.create({
          numberGuide: `ERROR-${sale.id}-${Date.now()}`,
          dateCreate: new Date(),
          message: `❌ Error 99 Envíos: Respuesta inesperada. Guía pendiente.`,
          status: 'ERROR SERVICIO',
          carrier: transportadora,
          codigoSucursal: null,
          pdfUrl: null,
          sale,
          tiktokUser: userTikTok,
        });

        return await this.shippingRepository.save(errorShipping);
      }
      
    } catch (shippingError) {
      console.error('❌ === ERROR GENERANDO GUÍA 99 ENVÍOS ===');
      console.error('🚨 Error message:', shippingError.message);
      console.error('📊 Status:', shippingError.response?.status);
      console.error('📋 Response data:', JSON.stringify(shippingError.response?.data, null, 2));
      console.error('🔍 Request URL:', shippingError.config?.url);
      console.error('📦 Request data:', JSON.stringify(shippingError.config?.data, null, 2));
      console.error('🏪 Store ID:', store.id);
      console.error('📧 Usuario 99 Envíos:', loginData.email);
      console.error('❌ === FIN ERROR 99 ENVÍOS ===');
      
      // Si es error de saldo insuficiente, logs detallados y continuar sin guía
      const errorMessage = shippingError.response?.data?.message || shippingError.response?.data || shippingError.message;
      if (errorMessage.includes && (errorMessage.includes('saldo suficiente') || errorMessage.includes('insufficient balance'))) {
        console.error('💰 === ERROR DE SALDO EN CATCH - CONTINUANDO SIN GUÍA ===');
        console.error('🚨 ACCIÓN REQUERIDA: Recargar saldo en cuenta 99 Envíos');
        console.error('📧 Cuenta afectada:', loginData.email);
        console.error('✅ La venta continuará sin generar guía de envío');
        
        // Crear shipping con error pero permitir continuar la venta
        const errorShipping = this.shippingRepository.create({
          numberGuide: `ERROR-SALDO-${sale.id}-${Date.now()}`,
          dateCreate: new Date(),
          message: '❌ Error: Saldo insuficiente en 99 Envíos. Guía pendiente.',
          status: 'ERROR SALDO',
          carrier: transportadora,
          codigoSucursal: null,
          pdfUrl: null,
          sale,
          tiktokUser: userTikTok,
        });

        return await this.shippingRepository.save(errorShipping);
      }
      
      // Para otros errores de 99 Envíos, también continuar sin guía
      console.error('🚨 Error de 99 Envíos - CONTINUANDO SIN GUÍA:', errorMessage);
      
      const errorShipping = this.shippingRepository.create({
        numberGuide: `ERROR-${sale.id}-${Date.now()}`,
        dateCreate: new Date(),
        message: `❌ Error 99 Envíos: ${errorMessage}. Guía pendiente.`,
        status: 'ERROR SERVICIO',
        carrier: transportadora,
        codigoSucursal: null,
        pdfUrl: null,
        sale,
        tiktokUser: userTikTok,
      });

      return await this.shippingRepository.save(errorShipping);
    }

    let pdfUrl = 'Error generando PDF de guía';
    
    try {
      const pdfData = {
        transportadora: {
          pais: 'colombia',
          nombre: transportadora,
        },
        guia: preEnvioRes.data.numeroPreenvio,
        AplicaContrapago: enableContrapago,
        origenCreacion: 1,
      };
      
      console.log('📄 Generando PDF con datos:', JSON.stringify(pdfData, null, 2));
      
      const pdfRes = await axios.post(
        `https://integration1.99envios.app/api/sucursal/pdf/${codigoSucursal}`,
        pdfData,
      );
      pdfUrl = pdfRes.data;
      
      console.log('✅ PDF generado exitosamente:', pdfUrl);
    } catch (pdfError) {
      console.error('❌ Error generando PDF de guía 99envíos:', pdfError.message);
      console.error('📋 Response data:', pdfError.response?.data);
      console.error('🚚 Transportadora que falló:', transportadora);
      console.error('📦 Guía número:', preEnvioRes.data.numeroPreenvio);
      console.error('🔄 Usuario debería intentar con otra transportadora');
      
      // Lanzar error para que el usuario pueda elegir otra transportadora
      const errorMessage = pdfError.response?.data || pdfError.message;
      throw new HttpException(
        `Error con transportadora ${transportadora}: ${errorMessage}. Por favor intenta con otra transportadora.`,
        HttpStatus.BAD_REQUEST
      );
    }

    const shipping = this.shippingRepository.create({
      numberGuide: String(preEnvioRes.data.numeroPreenvio),
      dateCreate: preEnvioRes.data.fechaCreacion ? new Date(preEnvioRes.data.fechaCreacion) : new Date(),
      message: pdfUrl,
      status: 'PENDING',
      carrier: transportadora,
      codigoSucursal: codigoSucursal, // 🆕 Guardar código de sucursal
      pdfUrl: pdfUrl, // 🆕 Mismo valor que message por ahora
      sale,
      tiktokUser: userTikTok,
    });

    return await this.shippingRepository.save(shipping);
  }

  async getSalesData(userId: number) {
    console.log('📊 Getting sales data for user:', userId);
    
    const sales = await this.saleRepository
      .createQueryBuilder('sale')
      .innerJoin('sale.store', 'store')
      .innerJoin('store.owner', 'owner')
      .innerJoin('sale.payment', 'payment')
      .select("DATE_FORMAT(sale.createdAt, '%b')", 'month')
      .addSelect('CAST(SUM(sale.totalAmount) AS UNSIGNED)', 'revenue')
      .addSelect('CAST(COUNT(DISTINCT sale.id) AS UNSIGNED)', 'visitors')
      .where('owner.id = :userId', { userId })
      .andWhere('payment.estado = :paymentStatus', { paymentStatus: 'Aceptada' })
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany();

    console.log('📊 Sales data result:', sales);
    return sales;
  }

  async getSalesByStore(userId: number, filters?: {
    page: number;
    limit: number;
    search: string;
    startDate: string;
    endDate: string;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const skip = (page - 1) * limit;

    let query = this.saleRepository
      .createQueryBuilder('sale')
      .innerJoinAndSelect('sale.store', 'store')
      .innerJoinAndSelect('store.owner', 'owner')
      .innerJoinAndSelect('sale.saleDetails', 'saleDetail')
      .innerJoinAndSelect('saleDetail.product', 'product')
      .leftJoinAndSelect('saleDetail.productVariant', 'productVariant')
      .leftJoinAndSelect('productVariant.color', 'color')
      .leftJoinAndSelect('productVariant.size', 'size')
      .leftJoinAndSelect('saleDetail.tiktokUser', 'tiktokUser')
      .leftJoinAndSelect('tiktokUser.city', 'city')
      .leftJoinAndSelect('city.department', 'department')
      .leftJoinAndSelect('department.country', 'country')
      .leftJoinAndSelect('sale.shipping', 'shipping')
      .innerJoinAndSelect('sale.payment', 'payment') // Solo ventas con pago
      .where('owner.id = :userId', { userId })
      .andWhere('payment.estado = :paymentStatus', { paymentStatus: 'Aceptada' }); // Solo pagos aceptados

    // Aplicar filtros de búsqueda
    if (filters?.search) {
      console.log('🔍 Aplicando filtro de búsqueda en ventas:', filters.search);
      query = query.andWhere(
        '(product.name LIKE :search OR tiktokUser.name LIKE :search OR tiktokUser.email LIKE :search OR sale.id LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    // Filtrar por rango de fechas
    if (filters?.startDate) {
      console.log('🔍 Aplicando filtro de fecha inicio:', filters.startDate);
      query = query.andWhere('sale.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      console.log('🔍 Aplicando filtro de fecha fin:', filters.endDate);
      query = query.andWhere('sale.createdAt <= :endDate', { endDate: filters.endDate });
    }

    // Obtener total de registros para paginación
    const total = await query.getCount();
    console.log('🔍 Total de ventas encontradas:', total);

    // Aplicar paginación y obtener resultados
    const sales = await query
      .orderBy('sale.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();
      
    console.log('🔍 Ventas obtenidas:', sales.length);

    // Enriquecer con datos de Payment y Cupones
    const enrichedSales = await Promise.all(
      sales.map(async (sale) => {
        const payment = await this.paymentRepository.findOne({
          where: { sale: { id: sale.id } },
        });
        
        // Obtener información de cupones utilizados
        const couponUsage = await this.couponUsageRepository.findOne({
          where: { sale: { id: sale.id } },
          relations: ['coupon'],
        });
        
        return {
          ...sale,
          payment: payment || null,
          couponUsage: couponUsage || null,
        };
      })
    );

    return {
      data: enrichedSales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getRecentOrders(userId: number) {
    console.log(`🔍 Buscando órdenes recientes para usuario ${userId}...`);
    
    const recentOrders = await this.saleRepository
      .createQueryBuilder('sale')
      .innerJoinAndSelect('sale.store', 'store')
      .innerJoinAndSelect('store.owner', 'owner')
      .leftJoinAndSelect('sale.saleDetails', 'details')
      .leftJoinAndSelect('details.product', 'product')
      .leftJoinAndSelect('details.tiktokUser', 'tiktokUser')
      .leftJoinAndSelect('sale.shipping', 'shipping')
      .leftJoinAndSelect('tiktokUser.city', 'city')
      .leftJoinAndSelect('sale.payment', 'payment')
      .where('owner.id = :userId', { userId })
      .andWhere('(payment.estado = :acceptedStatus OR payment.estado = :pendingStatus)', { 
        acceptedStatus: 'Aceptada',
        pendingStatus: 'Pendiente' 
      })
      .orderBy('sale.createdAt', 'DESC')
      .limit(10)
      .getMany();

    console.log(`📊 Se encontraron ${recentOrders.length} órdenes recientes`);

    if (recentOrders.length === 0) {
      // Verificar si hay ventas sin restricción de pago para debug
      const totalSales = await this.saleRepository
        .createQueryBuilder('sale')
        .innerJoin('sale.store', 'store')
        .innerJoin('store.owner', 'owner')
        .where('owner.id = :userId', { userId })
        .getCount();
      
      console.log(`🔍 Total de ventas para este usuario (sin filtros): ${totalSales}`);
    }

    return recentOrders.map((order) => {
      const detail = order.saleDetails?.[0];
      const user = detail?.tiktokUser;

      // Mapear estados para asegurar compatibilidad con estados 99 Envíos
      let shippingStatus = order.shipping?.status || 'GUÍA ADMITIDA';
      
      // Si el estado es uno de los antiguos, mapearlo al nuevo sistema
      if (shippingStatus === 'PENDING' || shippingStatus === 'pending') {
        shippingStatus = 'GUÍA ADMITIDA';
      } else if (shippingStatus === 'IN_TRANSIT' || shippingStatus === 'in_transit') {
        shippingStatus = 'TRANSITO URBANO';
      } else if (shippingStatus === 'DELIVERED' || shippingStatus === 'delivered') {
        shippingStatus = 'ENTREGADA';
      } else if (shippingStatus === 'CANCELLED' || shippingStatus === 'cancelled') {
        shippingStatus = 'CANCELADA';
      }

      const mappedOrder = {
        id: order.id.toString(),
        tiktokUserId: user?.id || null,
        customer: {
          name: user?.name || 'Desconocido',
          phone: user?.phone || 'N/A',
          email: user?.email || 'N/A',
          address: user?.address || 'N/A',
          city: user?.city?.name || 'N/A',
        },
        product: detail?.product?.name || 'Producto desconocido',
        date: order.createdAt.toISOString().split('T')[0],
        amount: parseFloat(order.totalAmount.toString()),
        shippingStatus: shippingStatus,
      };

      console.log(`📦 Orden mapeada:`, mappedOrder);
      return mappedOrder;
    });
  }

  async getOrders(userId: number, filters?: {
    page: number;
    limit: number;
    search: string;
    status: string;
    startDate: string;
    endDate: string;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const skip = (page - 1) * limit;

    // 1. Obtener Sales (órdenes pagadas)
    let salesQuery = this.saleRepository
      .createQueryBuilder('sale')
      .innerJoinAndSelect('sale.store', 'store')
      .innerJoinAndSelect('store.owner', 'owner')
      .leftJoinAndSelect('sale.saleDetails', 'details')
      .leftJoinAndSelect('details.product', 'product')
      .leftJoinAndSelect('details.tiktokUser', 'tiktokUser')
      .leftJoinAndSelect('sale.shipping', 'shipping')
      .leftJoinAndSelect('tiktokUser.city', 'city')
      .where('owner.id = :userId', { userId });

    // 2. Obtener Carts (órdenes en baúl)
    let cartsQuery = this.cartRepository
      .createQueryBuilder('cart')
      .innerJoinAndSelect('cart.store', 'store')
      .innerJoinAndSelect('store.owner', 'owner')
      .leftJoinAndSelect('cart.cartItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productVariant', 'variant')
      .leftJoinAndSelect('variant.color', 'color')
      .leftJoinAndSelect('variant.size', 'size')
      .leftJoinAndSelect('cart.tiktokUser', 'tiktokUser')
      .leftJoinAndSelect('tiktokUser.city', 'city')
      .where('owner.id = :userId', { userId })
      .andWhere('cart.status != :completedStatus', { completedStatus: 'COMPLETED' });

    // Aplicar filtros de búsqueda
    if (filters?.search) {
      salesQuery = salesQuery.andWhere(
        '(tiktokUser.name LIKE :search OR tiktokUser.email LIKE :search OR tiktokUser.phone LIKE :search OR product.name LIKE :search OR shipping.numberGuide LIKE :search)',
        { search: `%${filters.search}%` }
      );
      
      cartsQuery = cartsQuery.andWhere(
        '(tiktokUser.name LIKE :cartSearch OR tiktokUser.email LIKE :cartSearch OR tiktokUser.phone LIKE :cartSearch OR product.name LIKE :cartSearch)',
        { cartSearch: `%${filters.search}%` }
      );
    }

    // Filtrar por estado - si es IN_CART solo traer carts, si es otro estado solo sales
    if (filters?.status) {
      console.log('🔍 Aplicando filtro de estado:', filters.status);
      if (filters.status === 'IN_CART') {
        // Solo mostrar carritos
        salesQuery = salesQuery.andWhere('1 = 0'); // No traer sales
      } else {
        // Solo mostrar sales con ese estado
        salesQuery = salesQuery.andWhere('shipping.status = :status', { status: filters.status });
        cartsQuery = cartsQuery.andWhere('1 = 0'); // No traer carts
      }
    }

    // Filtrar por rango de fechas
    if (filters?.startDate) {
      salesQuery = salesQuery.andWhere('sale.createdAt >= :startDate', { startDate: filters.startDate });
      cartsQuery = cartsQuery.andWhere('cart.createdAt >= :cartStartDate', { cartStartDate: filters.startDate });
    }

    if (filters?.endDate) {
      salesQuery = salesQuery.andWhere('sale.createdAt <= :endDate', { endDate: filters.endDate });
      cartsQuery = cartsQuery.andWhere('cart.createdAt <= :cartEndDate', { cartEndDate: filters.endDate });
    }

    // Obtener totales para paginación
    const [salesTotal, cartsTotal] = await Promise.all([
      salesQuery.getCount(),
      cartsQuery.getCount()
    ]);
    
    const total = salesTotal + cartsTotal;
    console.log('🔍 Total registros encontrados:', { sales: salesTotal, carts: cartsTotal, total });

    // Obtener resultados con orden por fecha
    const [sales, carts] = await Promise.all([
      salesQuery.orderBy('sale.createdAt', 'DESC').getMany(),
      cartsQuery.orderBy('cart.createdAt', 'DESC').getMany()
    ]);

    // Enriquecer sales con datos de Payment y Cupones
    const enrichedSales = await Promise.all(
      sales.map(async (sale) => {
        const payment = await this.paymentRepository.findOne({
          where: { sale: { id: sale.id } },
        });
        
        const couponUsage = await this.couponUsageRepository.findOne({
          where: { sale: { id: sale.id } },
          relations: ['coupon'],
        });
        
        return {
          ...sale,
          payment: payment || null,
          couponUsage: couponUsage || null,
          orderType: 'SALE' // Identificador para órdenes pagadas
        };
      })
    );

    // Transformar carts para que tengan estructura similar a sales
    const transformedCarts = carts.map(cart => ({
      id: cart.id,
      totalAmount: cart.totalAmount.toString(),
      shippingCost: cart.shippingCost?.toString() || '0',
      discountAmount: cart.discountAmount?.toString() || '0',
      createdAt: cart.createdAt,
      orderType: 'CART', // Identificador para órdenes en baúl
      cartStatus: cart.status,
      expiresAt: cart.expiresAt,
      // Transformar cartItems a saleDetails para compatibilidad con frontend
      saleDetails: cart.cartItems.map(item => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price.toString(),
        product: item.product,
        productVariant: item.productVariant || null,
        tiktokUser: cart.tiktokUser
      })),
      // Estado especial para carritos según su estatus
      shipping: {
        id: null,
        numberGuide: null,
        status: cart.status === 'CANCELLED' ? 'CANCELLED' : 'IN_CART',
        message: null,
        dateCreate: cart.createdAt
      },
      payment: null,
      couponUsage: null
    }));

    // Combinar y ordenar todos los resultados por fecha
    const allOrders = [...enrichedSales, ...transformedCarts]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Aplicar paginación sobre el resultado combinado
    const paginatedOrders = allOrders.slice(skip, skip + limit);

    return {
      data: paginatedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getOrdersHistory(userId: number, filters?: {
    page: number;
    limit: number;
    search: string;
    status: string;
    startDate: string;
    endDate: string;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const skip = (page - 1) * limit;

    // 1. Obtener Sales (órdenes pagadas) - TODAS incluyendo canceladas si las hay
    let salesQuery = this.saleRepository
      .createQueryBuilder('sale')
      .innerJoinAndSelect('sale.store', 'store')
      .innerJoinAndSelect('store.owner', 'owner')
      .leftJoinAndSelect('sale.saleDetails', 'details')
      .leftJoinAndSelect('details.product', 'product')
      .leftJoinAndSelect('details.tiktokUser', 'tiktokUser')
      .leftJoinAndSelect('sale.shipping', 'shipping')
      .leftJoinAndSelect('tiktokUser.city', 'city')
      .where('owner.id = :userId', { userId });

    // 2. Obtener Carts (TODOS: activos, cancelados, completados para historial completo)
    let cartsQuery = this.cartRepository
      .createQueryBuilder('cart')
      .innerJoinAndSelect('cart.store', 'store')
      .innerJoinAndSelect('store.owner', 'owner')
      .leftJoinAndSelect('cart.cartItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('cart.tiktokUser', 'tiktokUser')
      .leftJoinAndSelect('tiktokUser.city', 'city')
      .where('owner.id = :userId', { userId });
      // NO filtrar por status - mostrar TODOS para historial

    // Aplicar filtros de búsqueda
    if (filters?.search) {
      salesQuery = salesQuery.andWhere(
        '(tiktokUser.name LIKE :search OR tiktokUser.email LIKE :search OR tiktokUser.phone LIKE :search OR product.name LIKE :search OR shipping.numberGuide LIKE :search)',
        { search: `%${filters.search}%` }
      );
      
      cartsQuery = cartsQuery.andWhere(
        '(tiktokUser.name LIKE :cartSearch OR tiktokUser.email LIKE :cartSearch OR tiktokUser.phone LIKE :cartSearch OR product.name LIKE :cartSearch)',
        { cartSearch: `%${filters.search}%` }
      );
    }

    // Filtrar por estado específico en historial
    if (filters?.status) {
      console.log('🔍 Aplicando filtro de estado en historial:', filters.status);
      if (filters.status === 'IN_CART') {
        // Solo carritos activos
        salesQuery = salesQuery.andWhere('1 = 0');
        cartsQuery = cartsQuery.andWhere('cart.status = :cartStatus', { cartStatus: 'ACTIVE' });
      } else if (filters.status === 'CANCELLED') {
        // Solo cancelados (tanto sales como carts)
        salesQuery = salesQuery.andWhere('shipping.status = :saleStatus', { saleStatus: 'CANCELLED' });
        cartsQuery = cartsQuery.andWhere('cart.status = :cartStatus', { cartStatus: 'CANCELLED' });
      } else {
        // Estados de envío normales (solo sales)
        salesQuery = salesQuery.andWhere('shipping.status = :status', { status: filters.status });
        cartsQuery = cartsQuery.andWhere('1 = 0');
      }
    }

    // Filtrar por rango de fechas
    if (filters?.startDate) {
      salesQuery = salesQuery.andWhere('sale.createdAt >= :startDate', { startDate: filters.startDate });
      cartsQuery = cartsQuery.andWhere('cart.createdAt >= :cartStartDate', { cartStartDate: filters.startDate });
    }

    if (filters?.endDate) {
      salesQuery = salesQuery.andWhere('sale.createdAt <= :endDate', { endDate: filters.endDate });
      cartsQuery = cartsQuery.andWhere('cart.createdAt <= :cartEndDate', { cartEndDate: filters.endDate });
    }

    // Obtener totales para paginación
    const [salesTotal, cartsTotal] = await Promise.all([
      salesQuery.getCount(),
      cartsQuery.getCount()
    ]);
    
    const total = salesTotal + cartsTotal;
    console.log('🔍 Total registros en historial:', { sales: salesTotal, carts: cartsTotal, total });

    // Obtener resultados con orden por fecha
    const [sales, carts] = await Promise.all([
      salesQuery.orderBy('sale.createdAt', 'DESC').getMany(),
      cartsQuery.orderBy('cart.createdAt', 'DESC').getMany()
    ]);

    // Enriquecer sales con datos de Payment y Cupones
    const enrichedSales = await Promise.all(
      sales.map(async (sale) => {
        const payment = await this.paymentRepository.findOne({
          where: { sale: { id: sale.id } },
        });
        
        const couponUsage = await this.couponUsageRepository.findOne({
          where: { sale: { id: sale.id } },
          relations: ['coupon'],
        });
        
        return {
          ...sale,
          payment: payment || null,
          couponUsage: couponUsage || null,
          orderType: 'SALE'
        };
      })
    );

    // Transformar carts para que tengan estructura similar a sales
    const transformedCarts = carts.map(cart => ({
      id: cart.id,
      totalAmount: cart.totalAmount.toString(),
      shippingCost: cart.shippingCost?.toString() || '0',
      discountAmount: cart.discountAmount?.toString() || '0',
      createdAt: cart.createdAt,
      orderType: 'CART',
      cartStatus: cart.status,
      expiresAt: cart.expiresAt,
      saleDetails: cart.cartItems.map(item => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price.toString(),
        product: item.product,
        productVariant: item.productVariant || null,
        tiktokUser: cart.tiktokUser
      })),
      // Estado según el status del carrito
      shipping: {
        id: null,
        numberGuide: null,
        status: cart.status === 'CANCELLED' ? 'CANCELLED' : 
                cart.status === 'COMPLETED' ? 'COMPLETED' : 'IN_CART',
        message: null,
        dateCreate: cart.createdAt
      },
      payment: null,
      couponUsage: null
    }));

    // Combinar y ordenar todos los resultados por fecha
    const allOrders = [...enrichedSales, ...transformedCarts]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Aplicar paginación sobre el resultado combinado
    const paginatedOrders = allOrders.slice(skip, skip + limit);

    return {
      data: paginatedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  private async sendGuideToN8NWebhook(payment: Payment) {
    console.log('🌐 [N8N] Preparando envío al webhook N8N...');
    
    const webhookUrl = process.env.WEBHOOK_GUIA_URL;
    console.log('🔗 [N8N] URL del webhook:', webhookUrl);
    
    if (!webhookUrl) {
      const error = 'WEBHOOK_GUIA_URL no está configurada en las variables de entorno';
      console.error('❌ [N8N]', error);
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
      // 🏦 Datos adicionales de ePayco
      epaycoData: {
        authorization: payment.authorization,
        transactionId: payment.transactionId,
        invoice: payment.invoice,
        ticketId: payment.ticketId,
        estado: payment.estado,
        respuesta: payment.respuesta,
        transactionDate: payment.transactionDate,
        fechaTransaccion: payment.fechaTransaccion,
      },
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
      status: 'CREATED' // Estado de venta creada, no confirmada aún
    };

    console.log('📦 [N8N] DATOS A ENVIAR AL WEBHOOK:', JSON.stringify(guideData, null, 2));
    console.log('🚀 [N8N] Enviando POST request con JSON a:', webhookUrl);

    try {
      const response = await axios.post(webhookUrl, guideData, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ComprePues-Backend/1.0',
        },
        timeout: 15000,
      });

      console.log('✅ [N8N] WEBHOOK RESPONSE STATUS:', response.status);
      console.log('✅ [N8N] WEBHOOK RESPONSE HEADERS:', response.headers);
      console.log('✅ [N8N] WEBHOOK RESPONSE DATA:', response.data);
      
      return {
        success: true,
        status: response.status,
        data: response.data,
        url: webhookUrl
      };
    } catch (error) {
      console.error('💥 [N8N] ERROR EN REQUEST AL WEBHOOK:');
      console.error('[N8N] URL:', webhookUrl);
      console.error('[N8N] Error message:', error.message);
      
      if (error.response) {
        console.error('[N8N] Response status:', error.response.status);
        console.error('[N8N] Response data:', error.response.data);
        console.error('[N8N] Response headers:', error.response.headers);
      } else if (error.request) {
        console.error('[N8N] No response received:', error.request);
      } else {
        console.error('[N8N] Request setup error:', error.message);
      }
      
      throw error;
    }
  }

  async sendGuideToN8NByReference(paymentReference: string) {
    console.log('🔍 BUSCANDO PAGO CON REFERENCIA:', paymentReference);
    console.log('🔍 Tipo de referencia:', typeof paymentReference);
    
    // Convertir a string si viene como número
    const refString = paymentReference.toString();
    
    const payment = await this.paymentRepository.findOne({
      where: { reference: refString },
      relations: ['sale', 'sale.shipping', 'tiktokUser', 'tiktokUser.city', 'store'],
    });

    console.log('🔍 RESULTADO DE BÚSQUEDA:');
    console.log('   Pago encontrado:', !!payment);
    if (payment) {
      console.log('   ID del pago:', payment.id);
      console.log('   Referencia en BD:', payment.reference);
      console.log('   Referencia buscada:', refString);
      console.log('   Coinciden:', payment.reference === refString);
    }

    if (!payment) {
      const error = `Pago no encontrado con referencia: ${paymentReference}`;
      console.error('❌', error);
      
      // Debug adicional: buscar cualquier pago reciente
      console.log('🔍 BUSCANDO PAGOS RECIENTES PARA DEBUG:');
      const recentPayments = await this.paymentRepository.find({
        take: 5,
        order: { id: 'DESC' },
      });
      
      recentPayments.forEach(p => {
        console.log(`   ID: ${p.id}, Referencia: "${p.reference}" (tipo: ${typeof p.reference})`);
      });
      
      throw new Error(error);
    }

    console.log('✅ Pago encontrado para N8N:', {
      id: payment.id,
      referencia: payment.reference,
      monto: payment.amount,
      cliente: payment.tiktokUser.name,
      tieneShipping: !!payment.sale.shipping
    });

    return await this.sendGuideToN8NWebhook(payment);
  }

  // Método para restaurar stock cuando un pago falla
  async rollbackStock(saleId: number): Promise<void> {
    console.log(`🔄 Iniciando rollback de stock para venta ${saleId}`);
    
    try {
      // Obtener todos los detalles de la venta
      const saleDetails = await this.saleDetailRepository.find({
        where: { sale: { id: saleId } },
        relations: ['product']
      });

      if (saleDetails.length === 0) {
        console.log(`⚠️ No se encontraron detalles para la venta ${saleId}`);
        return;
      }

      // Restaurar stock de cada producto
      for (const detail of saleDetails) {
        const product = detail.product;
        
        // Restaurar la cantidad al stock
        product.stock += detail.quantity;
        product.inStock = product.stock > 0;
        
        await this.productRepository.save(product);
        
        console.log(`✅ Stock restaurado para producto ${product.name}: +${detail.quantity} (Stock actual: ${product.stock})`);
      }
      
      console.log(`✅ Rollback de stock completado para venta ${saleId}`);
    } catch (error) {
      console.error(`❌ Error en rollback de stock para venta ${saleId}:`, error.message);
      throw error;
    }
  }

  async createSaleFromExpiredCart(cartId: number, bankCode: string) {
    // Obtener carrito expirado
    const cart = await this.cartRepository.findOne({
      where: { id: cartId, status: CartStatus.EXPIRED },
      relations: [
        'cartItems',
        'cartItems.product',
        'cartItems.productVariant',
        'tiktokUser',
        'store'
      ]
    });

    if (!cart) {
      throw new HttpException('Carrito expirado no encontrado', HttpStatus.NOT_FOUND);
    }

    // Verificar stock nuevamente
    for (const item of cart.cartItems) {
      if (item.product.stock < item.quantity) {
        throw new HttpException(
          `Stock insuficiente para ${item.product.name}. Disponible: ${item.product.stock}`,
          HttpStatus.BAD_REQUEST
        );
      }
    }

    // Preparar datos para crear la venta
    const products = cart.cartItems.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      price: parseFloat(item.price.toString()),
      productVariantId: item.productVariant?.id
    }));

    const saleData = {
      userTikTokId: cart.tiktokUser.id,
      storeName: cart.store.name,
      products,
      shippingCost: parseFloat(cart.shippingCost.toString()) || 0,
      transportadora: 'interrapidisimo', // Default
      bankCode,
      couponCode: undefined, // Los carritos no manejan cupones por ahora
      cartId: cartId // Agregar cartId para tracking
    };

    try {
      // Crear la venta (el carrito se marcará como COMPLETED cuando el pago sea exitoso)
      const saleResult = await this.createSale(saleData);
      
      return saleResult;
    } catch (error) {
      console.error(`Error creando venta desde carrito ${cartId}:`, error.message);
      throw error;
    }
  }

}
