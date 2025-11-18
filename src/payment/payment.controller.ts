import { Controller, Get, Post, Body, HttpException, HttpStatus, Param, Query, Res } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Response } from 'express';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('banks/:storeName')
  async getBanks(@Param('storeName') storeName: string) {
    if (!storeName) {
      throw new HttpException(
        'Parámetro "storeName" es requerido',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.paymentService.getBanks(storeName);
  }

  @Post('webhook/epayco')
  async handleEpaycoWebhook(@Body() body: any) {
    console.log('🎯 ENDPOINT WEBHOOK LLAMADO - /api/payment/webhook/epayco');
    console.log('📨 Body recibido:', JSON.stringify(body, null, 2));
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    try {
      const result = await this.paymentService.handlePaymentConfirmation(body);
      console.log('✅ Webhook procesado exitosamente:', result);
      return result;
    } catch (error) {
      console.error('💥 ERROR procesando webhook en controller:', error.message);
      console.error('Stack:', error.stack);
      throw new HttpException(
        'Error procesando webhook',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('confirmation')
  async paymentConfirmation(@Query() query: any, @Res() res: Response) {
    console.log('Confirmación de pago recibida:', query);
    
    try {
      const result = await this.paymentService.processPaymentResponse(query);
      
      if (result.success) {
        // Redirigir a página de éxito
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:4321'}/payment-success?ref=${result.reference}&status=success`);
      } else {
        // Redirigir a página de error
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:4321'}/payment-error?ref=${result.reference}&status=failed`);
      }
    } catch (error) {
      console.error('Error procesando confirmación:', error);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:4321'}/payment-error?status=error`);
    }
  }

  @Get('check-status/:paymentReference')
  async checkPaymentStatus(@Param('paymentReference') paymentReference: string) {
    console.log('🔍 Consultando estado del pago:', paymentReference);
    
    try {
      const result = await this.paymentService.checkPaymentStatusWithEpayco(paymentReference);
      return result;
    } catch (error) {
      console.error('❌ Error consultando estado:', error.message);
      throw new HttpException(
        'Error consultando estado del pago',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('simulate-webhook/:paymentReference')
  async simulateWebhook(@Param('paymentReference') paymentReference: string) {
    console.log('🎯 SIMULANDO WEBHOOK PARA REFERENCIA:', paymentReference);
    
    try {
      // Simular datos de webhook de ePayco para testing
      const simulatedWebhookData = {
        x_ref_payco: paymentReference,
        x_transaction_state: 'Aceptada',
        x_response: 'Aceptada',
        x_transaction_date: new Date().toISOString(),
        x_fecha_transaccion: new Date().toISOString()
      };

      console.log('📨 Datos simulados del webhook:', simulatedWebhookData);
      
      const result = await this.paymentService.handlePaymentConfirmation(simulatedWebhookData);
      return {
        success: true,
        message: 'Webhook simulado exitosamente',
        result
      };
    } catch (error) {
      console.error('❌ Error simulando webhook:', error.message);
      throw new HttpException(
        'Error simulando webhook',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
