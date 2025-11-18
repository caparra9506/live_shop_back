import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import axios from 'axios';
import { ElectronicInvoice } from '../entity/electronic-invoice.entity';
import { Store } from '../entity/store.entity';
import { Sale } from '../entity/sale.entity';
import { SaleDetail } from '../entity/sale-detail.entity';
import { User } from '../entity/user.entity';
import { StoreConfig } from '../entity/store-config.entity';
import { CreateElectronicInvoiceDto } from './dto/create-electronic-invoice.dto';

@Injectable()
export class ElectronicBillingService {
  private readonly logger = new Logger(ElectronicBillingService.name);

  constructor(
    @InjectRepository(ElectronicInvoice)
    private readonly electronicInvoiceRepository: Repository<ElectronicInvoice>,
    
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,
    
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    
    @InjectRepository(StoreConfig)
    private readonly storeConfigRepository: Repository<StoreConfig>,
  ) {}

  async getFactusToken(storeConfig: StoreConfig): Promise<string> {
    try {
      const tokenData = {
        grant_type: 'password',
        client_id: storeConfig.factusClientId,
        client_secret: storeConfig.factusClientSecret,
        username: storeConfig.factusUsername,
        password: storeConfig.factusPassword,
      };

      this.logger.log('🔐 Solicitando token a FACTUS...');
      
      const response = await axios.post(
        `${storeConfig.factusApiUrl}/oauth/token`,
        new URLSearchParams(tokenData),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
        }
      );

      if (response.data.access_token) {
        this.logger.log('✅ Token FACTUS obtenido exitosamente');
        return response.data.access_token;
      }

      throw new Error('No se recibió access_token en la respuesta');
    } catch (error) {
      this.logger.error('❌ Error obteniendo token FACTUS:', error.message);
      if (error.response?.data) {
        this.logger.error('📋 Respuesta de error:', error.response.data);
      }
      throw new HttpException(
        'Error de autenticación con FACTUS',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async createElectronicInvoice(dto: CreateElectronicInvoiceDto): Promise<ElectronicInvoice> {
    try {
      // Obtener la venta con todas las relaciones necesarias
      const sale = await this.saleRepository.findOne({
        where: { id: dto.saleId },
        relations: [
          'store',
          'store.owner',
          'saleDetails',
          'saleDetails.product',
          'saleDetails.tiktokUser',
          'saleDetails.tiktokUser.city',
        ],
      });

      if (!sale) {
        throw new HttpException('Venta no encontrada', HttpStatus.NOT_FOUND);
      }

      // Obtener configuración de la tienda
      const storeConfig = await this.storeConfigRepository.findOne({
        where: { store: { id: sale.store.id } },
      });

      if (!storeConfig) {
        throw new HttpException('Configuración de tienda no encontrada', HttpStatus.NOT_FOUND);
      }

      // Verificar si la facturación electrónica está habilitada
      if (!storeConfig.enableElectronicBilling) {
        throw new HttpException('Facturación electrónica no está habilitada para esta tienda', HttpStatus.BAD_REQUEST);
      }

      // Validar configuración de FACTUS
      if (!storeConfig.factusClientId || !storeConfig.factusClientSecret || !storeConfig.factusUsername || !storeConfig.factusPassword) {
        throw new HttpException('Configuración de FACTUS incompleta', HttpStatus.BAD_REQUEST);
      }

      // Verificar que no exista ya una factura electrónica para esta venta
      const existingInvoice = await this.electronicInvoiceRepository.findOne({
        where: { sale: { id: dto.saleId } },
      });

      if (existingInvoice) {
        throw new HttpException(
          'Ya existe una factura electrónica para esta venta',
          HttpStatus.CONFLICT,
        );
      }

      const tiktokUser = sale.saleDetails[0]?.tiktokUser;
      if (!tiktokUser) {
        throw new HttpException(
          'No se encontró información del cliente',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Obtener token de FACTUS
      const token = await this.getFactusToken(storeConfig);

      // Preparar datos para FACTUS
      const factusData = {
        numbering_range_id: dto.numbering_range_id || storeConfig.factusNumberingRangeId,
        reference_code: dto.reference_code,
        payment_method_code: dto.payment_method_code,
        observation: dto.observation || '',
        customer: {
          type_document_identification_id: this.mapDocumentType(tiktokUser.documentType),
          identification_number: tiktokUser.document,
          name: tiktokUser.name,
          email: tiktokUser.email,
          phone: tiktokUser.phone || '',
          address: tiktokUser.address || '',
          municipality_id: tiktokUser.city?.code || 1, // Default a código de municipio
        },
        items: dto.items,
      };

      this.logger.log('📄 Creando factura electrónica en FACTUS...');
      this.logger.log('📋 Datos enviados:', JSON.stringify(factusData, null, 2));

      // Crear factura en FACTUS
      const factusResponse = await axios.post(
        `${storeConfig.factusApiUrl}/api/ubl2.1/invoice`,
        factusData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }
      );

      this.logger.log('✅ Respuesta de FACTUS:', factusResponse.data);

      // Crear registro en base de datos
      const electronicInvoice = this.electronicInvoiceRepository.create({
        store: sale.store,
        sale,
        factusId: factusResponse.data.data?.id?.toString() || null,
        cufe: factusResponse.data.data?.cufe || null,
        invoiceNumber: factusResponse.data.data?.number || null,
        prefix: factusResponse.data.data?.prefix || null,
        resolutionNumber: factusResponse.data.data?.resolution_number || null,
        qrCode: factusResponse.data.data?.qr_code || null,
        pdfUrl: factusResponse.data.data?.pdf?.url || null,
        xmlUrl: factusResponse.data.data?.xml?.url || null,
        status: factusResponse.data.success ? 'GENERATED' : 'FAILED',
        totalAmount: sale.totalAmount,
        taxAmount: this.calculateTaxAmount(dto.items),
        subtotal: this.calculateSubtotal(dto.items),
        customerDocumentType: tiktokUser.documentType.toString(),
        customerDocument: tiktokUser.document,
        customerName: tiktokUser.name,
        customerEmail: tiktokUser.email,
        customerPhone: tiktokUser.phone || null,
        customerAddress: tiktokUser.address || null,
        customerCity: tiktokUser.city?.name || null,
        factusResponse: JSON.stringify(factusResponse.data),
        errorMessage: factusResponse.data.success ? null : factusResponse.data.message,
      });

      const savedInvoice = await this.electronicInvoiceRepository.save(electronicInvoice);

      this.logger.log(`✅ Factura electrónica creada con ID: ${savedInvoice.id}`);
      
      return savedInvoice;
    } catch (error) {
      this.logger.error('❌ Error creando factura electrónica:', error.message);
      if (error.response?.data) {
        this.logger.error('📋 Error de FACTUS:', error.response.data);
      }
      
      // Si es un error de HTTP, relanzarlo tal como está
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Error creando factura electrónica: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async generateInvoiceFromSale(saleId: number, paymentMethodCode: string = '48'): Promise<ElectronicInvoice> {
    const sale = await this.saleRepository.findOne({
      where: { id: saleId },
      relations: [
        'store',
        'saleDetails',
        'saleDetails.product',
        'saleDetails.tiktokUser',
      ],
    });

    if (!sale) {
      throw new HttpException('Venta no encontrada', HttpStatus.NOT_FOUND);
    }

    // Verificar configuración de facturación electrónica
    const storeConfig = await this.storeConfigRepository.findOne({
      where: { store: { id: sale.store.id } },
    });

    if (!storeConfig || !storeConfig.enableElectronicBilling) {
      throw new HttpException('Facturación electrónica no está habilitada para esta tienda', HttpStatus.BAD_REQUEST);
    }

    // Crear items automáticamente desde los detalles de venta
    const items = sale.saleDetails.map((detail, index) => ({
      code_reference: detail.product.id.toString(),
      name: detail.product.name,
      quantity: detail.quantity,
      discount_rate: 0,
      price: parseFloat(detail.price.toString()),
      tax_rate: 19, // IVA del 19% por defecto
      unit_measure_id: 70, // Unidad por defecto
      standard_code_id: 1, // Estándar de adopción del contribuyente
      is_excluded: 0,
      tribute_id: 1, // IVA
      withholding_taxes: [],
    }));

    const createDto: CreateElectronicInvoiceDto = {
      saleId,
      reference_code: `SALE-${saleId}-${Date.now()}`,
      payment_method_code: paymentMethodCode,
      observation: `Factura electrónica para venta #${saleId}`,
      items,
    };

    return await this.createElectronicInvoice(createDto);
  }

  async getInvoicesBySale(saleId: number): Promise<ElectronicInvoice[]> {
    return await this.electronicInvoiceRepository.find({
      where: { sale: { id: saleId } },
      relations: ['store', 'sale'],
    });
  }

  async getInvoicesByStore(storeId: number): Promise<ElectronicInvoice[]> {
    return await this.electronicInvoiceRepository.find({
      where: { store: { id: storeId } },
      relations: ['store', 'sale'],
      order: { createdAt: 'DESC' },
    });
  }

  async getInvoicesByUser(userId: number): Promise<ElectronicInvoice[]> {
    // Primero obtenemos la tienda del usuario (como owner)
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['owner'],
    });

    if (!store) {
      throw new HttpException('Tienda no encontrada para este usuario', HttpStatus.NOT_FOUND);
    }

    return await this.electronicInvoiceRepository.find({
      where: { store: { id: store.id } },
      relations: ['store', 'sale'],
      order: { createdAt: 'DESC' },
    });
  }

  async validateInvoice(invoiceId: number): Promise<ElectronicInvoice> {
    const invoice = await this.electronicInvoiceRepository.findOne({
      where: { id: invoiceId },
      relations: ['store'],
    });

    if (!invoice) {
      throw new HttpException('Factura no encontrada', HttpStatus.NOT_FOUND);
    }

    if (!invoice.factusId) {
      throw new HttpException(
        'La factura no tiene ID de FACTUS',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Obtener configuración de la tienda
    const storeConfig = await this.storeConfigRepository.findOne({
      where: { store: { id: invoice.store.id } },
    });

    if (!storeConfig) {
      throw new HttpException('Configuración de tienda no encontrada', HttpStatus.NOT_FOUND);
    }

    try {
      const token = await this.getFactusToken(storeConfig);

      this.logger.log(`🔍 Validando factura ${invoice.factusId} en FACTUS...`);

      const response = await axios.post(
        `${storeConfig.factusApiUrl}/api/ubl2.1/invoice/${invoice.factusId}/validate`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }
      );

      this.logger.log('✅ Validación exitosa:', response.data);

      // Actualizar estado
      invoice.status = 'VALIDATED';
      invoice.factusResponse = JSON.stringify(response.data);
      
      return await this.electronicInvoiceRepository.save(invoice);
    } catch (error) {
      this.logger.error('❌ Error validando factura:', error.message);
      if (error.response?.data) {
        this.logger.error('📋 Error de FACTUS:', error.response.data);
      }

      throw new HttpException(
        'Error validando factura: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Métodos auxiliares privados
  private mapDocumentType(documentType: string): number {
    const typeMap = {
      '1': 1,  // Registro civil
      '2': 2,  // Tarjeta de identidad
      '3': 3,  // Cédula ciudadanía
      '4': 4,  // Tarjeta de extranjería
      '5': 5,  // Cédula de extranjería
      '6': 6,  // NIT
      '7': 7,  // Pasaporte
      '8': 8,  // Documento de identificación extranjero
      '9': 9,  // PEP
      '10': 10, // NIT otro país
      '11': 11, // NUIP
    };

    return typeMap[documentType] || 3; // Default a cédula de ciudadanía
  }

  private calculateTaxAmount(items: any[]): number {
    return items.reduce((total, item) => {
      const itemTotal = item.price * item.quantity * (1 - (item.discount_rate || 0) / 100);
      const taxAmount = itemTotal * ((item.tax_rate || 0) / 100);
      return total + taxAmount;
    }, 0);
  }

  private calculateSubtotal(items: any[]): number {
    return items.reduce((total, item) => {
      const itemTotal = item.price * item.quantity * (1 - (item.discount_rate || 0) / 100);
      return total + itemTotal;
    }, 0);
  }
}