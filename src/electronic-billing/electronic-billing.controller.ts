import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpStatus,
  HttpException,
  Query,
  Request,
} from '@nestjs/common';
import { ElectronicBillingService } from './electronic-billing.service';
import { CreateElectronicInvoiceDto } from './dto/create-electronic-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('electronic-billing')
@UseGuards(JwtAuthGuard)
export class ElectronicBillingController {
  constructor(
    private readonly electronicBillingService: ElectronicBillingService,
  ) {}

  @Post('invoice')
  async createInvoice(@Body() dto: CreateElectronicInvoiceDto) {
    try {
      const invoice = await this.electronicBillingService.createElectronicInvoice(dto);
      
      return {
        success: true,
        message: 'Factura electrónica creada exitosamente',
        data: invoice,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Error creando factura electrónica',
          error: error.response?.data || error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('invoice/auto/:saleId')
  async generateInvoiceFromSale(
    @Param('saleId') saleId: number,
    @Query('paymentMethod') paymentMethod: string = '48', // Tarjeta de crédito por defecto
  ) {
    try {
      const invoice = await this.electronicBillingService.generateInvoiceFromSale(
        saleId,
        paymentMethod,
      );
      
      return {
        success: true,
        message: 'Factura electrónica generada automáticamente',
        data: invoice,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Error generando factura automática',
          error: error.response?.data || error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('invoice/:invoiceId/validate')
  async validateInvoice(@Param('invoiceId') invoiceId: number) {
    try {
      const invoice = await this.electronicBillingService.validateInvoice(invoiceId);
      
      return {
        success: true,
        message: 'Factura validada exitosamente',
        data: invoice,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Error validando factura',
          error: error.response?.data || error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('invoice/sale/:saleId')
  async getInvoicesBySale(@Param('saleId') saleId: number) {
    try {
      const invoices = await this.electronicBillingService.getInvoicesBySale(saleId);
      
      return {
        success: true,
        message: 'Facturas obtenidas exitosamente',
        data: invoices,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Error obteniendo facturas',
          error: error.response?.data || error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('invoice/store/:storeId')
  async getInvoicesByStore(@Param('storeId') storeId: number) {
    try {
      const invoices = await this.electronicBillingService.getInvoicesByStore(storeId);
      
      return {
        success: true,
        message: 'Facturas de la tienda obtenidas exitosamente',
        data: invoices,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Error obteniendo facturas de la tienda',
          error: error.response?.data || error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('invoices')
  async getMyInvoices(@Request() req) {
    try {
      const userId = req.user.id;
      const invoices = await this.electronicBillingService.getInvoicesByUser(userId);
      
      return {
        success: true,
        message: 'Facturas obtenidas exitosamente',
        data: invoices,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Error obteniendo facturas',
          error: error.response?.data || error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('test-connection')
  async testConnection(@Body() config: any) {
    try {
      // Crear configuración temporal para la prueba
      const testConfig = {
        factusClientId: config.factusClientId,
        factusClientSecret: config.factusClientSecret,
        factusUsername: config.factusUsername,
        factusPassword: config.factusPassword,
        factusApiUrl: config.factusApiUrl || 'https://api-sandbox.factus.com.co',
      };

      const token = await this.electronicBillingService.getFactusToken(testConfig as any);
      
      return {
        success: true,
        message: 'Conexión exitosa con FACTUS',
        tokenReceived: !!token,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Error probando conexión con FACTUS',
          error: error.response?.data || error.message,
        },
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }
}