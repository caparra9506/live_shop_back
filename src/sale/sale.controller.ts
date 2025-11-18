import { Controller, Post, Body, UseGuards, Get , Request, Param, Query, Headers, HttpException, HttpStatus} from '@nestjs/common';
import { SalesService } from './sale.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  async createSale(@Body() createSaleDto: CreateSaleDto) {
    console.log('🛒 === CREANDO NUEVA VENTA ===');
    console.log('📦 Datos recibidos:', JSON.stringify(createSaleDto, null, 2));
    
    try {
      const result = await this.salesService.createSale(createSaleDto);
      console.log('✅ === VENTA CREADA EXITOSAMENTE ===');
      return result;
    } catch (error) {
      console.error('❌ === ERROR CREANDO VENTA ===');
      console.error('🚨 Error:', error.message);
      console.error('📚 Stack:', error.stack);
      console.error('🔍 DTO recibido:', JSON.stringify(createSaleDto, null, 2));
      
      // Detectar si es error de transportadora para dar mensaje específico
      if (error.message && error.message.includes('transportadora')) {
        console.error('🚚 Error específico de transportadora detectado');
        console.error('📤 Mensaje que se enviará al frontend:', error.message);
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      
      // Para otros errores, mantener el comportamiento original  
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMySales(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '15',
    @Query('search') search: string = '',
    @Query('startDate') startDate: string = '',
    @Query('endDate') endDate: string = ''
  ) {
    const userId = req.user.id;
    
    console.log('🔍 Parámetros recibidos en ventas:', {
      page,
      limit,
      search: search || 'vacío',
      startDate: startDate || 'vacío',
      endDate: endDate || 'vacío',
      userId
    });
    
    return this.salesService.getSalesByStore(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      startDate,
      endDate
    });
  }

  
  @UseGuards(JwtAuthGuard)
  @Get("data")
  async getSalesData(@Request() req) {
    const userId = req.user.id;
    return this.salesService.getSalesData(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/recent')
  async getRecentOrders(@Request() req) {
    const userId = req.user.id; // Extraemos el usuario autenticado
    return this.salesService.getRecentOrders(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/orders')
  async getOrders(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '15',
    @Query('search') search: string = '',
    @Query('status') status: string = '',
    @Query('startDate') startDate: string = '',
    @Query('endDate') endDate: string = ''
  ) {
    const userId = req.user.id;
    
    console.log('🔍 Parámetros recibidos en órdenes activas:', {
      page,
      limit,
      search: search || 'vacío',
      status: status || 'vacío',
      startDate: startDate || 'vacío',
      endDate: endDate || 'vacío',
      userId
    });
    
    return this.salesService.getOrders(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      status,
      startDate,
      endDate
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('/orders-history')
  async getOrdersHistory(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '15',
    @Query('search') search: string = '',
    @Query('status') status: string = '',
    @Query('startDate') startDate: string = '',
    @Query('endDate') endDate: string = ''
  ) {
    const userId = req.user.id;
    
    console.log('🔍 Parámetros recibidos en historial completo:', {
      page,
      limit,
      search: search || 'vacío',
      status: status || 'vacío',
      startDate: startDate || 'vacío',
      endDate: endDate || 'vacío',
      userId
    });
    
    return this.salesService.getOrdersHistory(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      status,
      startDate,
      endDate
    });
  }

  @Post('notify-n8n/:paymentReference')
  async notifyN8N(@Param('paymentReference') paymentReference: string) {
    console.log('🎯 ===============================================');
    console.log('📞 ENDPOINT LLAMADO: /api/sales/notify-n8n/' + paymentReference);
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('🎯 ===============================================');
    
    try {
      const result = await this.salesService.sendGuideToN8NByReference(paymentReference);
      console.log('✅ ===============================================');
      console.log('🎉 WEBHOOK N8N ENVIADO EXITOSAMENTE!');
      console.log('📊 Resultado:', result);
      console.log('✅ ===============================================');
      return { success: true, message: 'Notificación enviada a N8N', result };
    } catch (error) {
      console.error('💥 ===============================================');
      console.error('❌ ERROR ENVIANDO NOTIFICACIÓN A N8N');
      console.error('🚨 Error:', error.message);
      console.error('📚 Stack:', error.stack);
      console.error('💥 ===============================================');
      return { success: false, message: 'Error enviando notificación', error: error.message };
    }
  }

  @Get('test-webhook/:paymentReference')
  async testWebhook(@Param('paymentReference') paymentReference: string) {
    console.log('🧪 ENDPOINT DE PRUEBA LLAMADO - Referencia:', paymentReference);
    
    try {
      const result = await this.salesService.sendGuideToN8NByReference(paymentReference);
      return { 
        success: true, 
        message: 'Webhook de prueba enviado exitosamente',
        reference: paymentReference,
        result 
      };
    } catch (error) {
      console.error('❌ Error en webhook de prueba:', error.message);
      return { 
        success: false, 
        message: 'Error en webhook de prueba', 
        error: error.message 
      };
    }
  }

  @Post('from-expired-cart')
  async createSaleFromExpiredCart(
    @Body() body: { cartId: number; bankCode: string }
  ) {
    try {
      const result = await this.salesService.createSaleFromExpiredCart(
        body.cartId, 
        body.bankCode
      );
      return {
        success: true,
        message: 'Venta creada desde carrito expirado',
        saleId: result.saleId,
        totalAmount: result.totalAmount,
        urlBanco: result.urlBanco
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.status || 500
      };
    }
  }

  @Post('generate-electronic-invoice/:saleId')
  async generateElectronicInvoice(
    @Param('saleId') saleId: number,
    @Query('paymentMethod') paymentMethod: string = '48'
  ) {
    try {
      console.log(`📄 Solicitando factura electrónica para venta ${saleId}...`);
      
      const result = await this.salesService.generateElectronicInvoiceForSale(
        saleId, 
        paymentMethod
      );
      
      return {
        success: true,
        message: 'Factura electrónica procesada',
        data: result
      };
    } catch (error) {
      console.error(`❌ Error en endpoint de factura electrónica:`, error.message);
      return {
        success: false,
        message: 'Error generando factura electrónica',
        error: error.message
      };
    }
  }
}
