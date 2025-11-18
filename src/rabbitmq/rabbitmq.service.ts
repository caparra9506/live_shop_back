import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import https from 'https';

const amqp = require('amqplib');

export interface CommentQueueData {
  username: string;
  comment: string;
  storeName: string;
  timestamp: string;
  retryCount?: number;
}

export interface ShippingNotificationQueueData {
  paymentReference: string;
  receiptNumber: string;
  saleId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  amount: number;
  shippingInfo: {
    trackingNumber: string;
    shippingStatus: string;
    shippingMessage: string;
    shippingDate: Date;
    recipientPhone: string;
    recipientAddress: string;
    recipientCity: string;
  };
  timestamp: string;
  status: string;
  retryCount?: number;
}

export interface CartItemAddedQueueData {
  cartId: number;
  userTikTokId: number;
  userName: string;
  userPhone: string;
  storeName: string;
  product: {
    id: number;
    name: string;
    price: number;
    imageUrl: string;
  };
  quantity: number;
  totalAmount: number;
  shippingCost: number;
  expiresAt: Date;
  timeoutDays: number;
  checkoutUrl: string;
  timestamp: string;
  retryCount?: number;
}

export interface CartExpiredQueueData {
  cartId: number;
  userTikTokId: number;
  userName: string;
  userPhone: string;
  userEmail: string;
  storeName: string;
  totalAmount: number;
  shippingCost: number;
  itemsCount: number;
  paymentLink: string;
  expiresAt: Date;
  createdAt: Date;
  timestamp: string;
  retryCount?: number;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: any = null;
  private channel: any = null;
  private readonly queueName = process.env.RABBITMQ_QUEUE_NAME || 'tiktok_comments_queue';
  private readonly shippingQueueName = process.env.RABBITMQ_SHIPPING_QUEUE_NAME || 'shipping_notifications_queue';
  private readonly cartItemAddedQueueName = process.env.RABBITMQ_CART_ITEM_ADDED_QUEUE_NAME || 'cart_item_added_queue';
  private readonly cartExpiredQueueName = process.env.RABBITMQ_CART_EXPIRED_QUEUE_NAME || 'cart_expired_queue';
  private readonly maxRetries = 3;

  // RabbitMQ connection settings
  private readonly rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@n8n-rabbitmq.shblkb.easypanel.host:5672';
  private readonly webhookUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n-n8n.shblkb.easypanel.host/webhook/99b63e0c-4d80-4dff-b2fe-3d5cde91423b';
  private readonly shippingWebhookUrl = process.env.WEBHOOK_GUIA_URL || 'https://n8n-n8n.shblkb.easypanel.host/webhook/57aa930e-f92b-4e53-b56f-aa23fe8ab865';
  private readonly cartItemAddedWebhookUrl = process.env.WEBHOOK_CART_ITEM_ADDED_URL;
  private readonly cartExpiredWebhookUrl = process.env.WEBHOOK_CART_EXPIRED_URL;

  async onModuleInit() {
    try {
      await this.connect();
      await this.setupQueue();
      await this.startConsumer();
    } catch (error) {
      this.logger.error('❌ Error inicializando RabbitMQ, funcionará en modo fallback:', error);
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      this.logger.log('🔌 Conectando a RabbitMQ...');
      this.connection = await amqp.connect(this.rabbitmqUrl);
      this.channel = await this.connection.createChannel();
      
      this.connection.on('error', (err: Error) => {
        this.logger.error('❌ Error en conexión RabbitMQ:', err);
      });
      
      this.connection.on('close', () => {
        this.logger.warn('⚠️ Conexión RabbitMQ cerrada');
      });
      
      this.logger.log('✅ Conectado a RabbitMQ exitosamente');
    } catch (error) {
      this.logger.error('❌ Error conectando a RabbitMQ:', error);
      throw error;
    }
  }

  private async setupQueue(): Promise<void> {
    try {
      if (!this.channel) {
        throw new Error('Canal no disponible');
      }

      // Cola para comentarios de TikTok
      await this.channel.assertQueue(this.queueName, {
        durable: true, // La cola persiste aunque RabbitMQ se reinicie
        arguments: {
          'x-message-ttl': 86400000, // TTL de 24 horas para mensajes
          'x-max-retries': this.maxRetries
        }
      });

      this.logger.log(`✅ Cola '${this.queueName}' configurada correctamente`);

      // Cola para notificaciones de tracking
      await this.channel.assertQueue(this.shippingQueueName, {
        durable: true,
        arguments: {
          'x-message-ttl': 86400000, // TTL de 24 horas para mensajes
          'x-max-retries': this.maxRetries
        }
      });

      this.logger.log(`✅ Cola '${this.shippingQueueName}' configurada correctamente`);

      // Cola para notificaciones de items agregados al carrito
      await this.channel.assertQueue(this.cartItemAddedQueueName, {
        durable: true,
        arguments: {
          'x-message-ttl': 86400000,
          'x-max-retries': this.maxRetries
        }
      });

      this.logger.log(`✅ Cola '${this.cartItemAddedQueueName}' configurada correctamente`);

      // Cola para notificaciones de carritos expirados
      await this.channel.assertQueue(this.cartExpiredQueueName, {
        durable: true,
        arguments: {
          'x-message-ttl': 86400000,
          'x-max-retries': this.maxRetries
        }
      });

      this.logger.log(`✅ Cola '${this.cartExpiredQueueName}' configurada correctamente`);
    } catch (error) {
      this.logger.error('❌ Error configurando colas:', error);
      throw error;
    }
  }

  async enqueueComment(commentData: CommentQueueData): Promise<boolean> {
    try {
      if (!this.channel) {
        this.logger.error('❌ Canal RabbitMQ no disponible');
        return false;
      }

      const messagePayload = {
        ...commentData,
        retryCount: 0,
        enqueuedAt: new Date().toISOString()
      };

      const message = JSON.stringify(messagePayload);

      this.logger.log(`📥 ENCOLANDO MENSAJE:`, {
        queueName: this.queueName,
        payload: messagePayload
      });

      const sent = this.channel.sendToQueue(
        this.queueName,
        Buffer.from(message),
        {
          persistent: true, // El mensaje persiste en disco
          priority: 1,
          timestamp: Date.now()
        }
      );

      if (sent) {
        this.logger.log(`✅ Comentario encolado exitosamente: @${commentData.username} - "${commentData.comment}"`);
        return true;
      } else {
        this.logger.error('❌ No se pudo encolar el comentario');
        return false;
      }
    } catch (error) {
      this.logger.error('❌ Error encolando comentario:', error);
      return false;
    }
  }

  async enqueueShippingNotification(notificationData: ShippingNotificationQueueData): Promise<boolean> {
    try {
      if (!this.channel) {
        this.logger.error('❌ Canal RabbitMQ no disponible');
        return false;
      }

      const messagePayload = {
        ...notificationData,
        retryCount: 0,
        enqueuedAt: new Date().toISOString()
      };

      const message = JSON.stringify(messagePayload);

      this.logger.log(`📥 ENCOLANDO NOTIFICACIÓN DE TRACKING:`, {
        queueName: this.shippingQueueName,
        trackingNumber: notificationData.shippingInfo.trackingNumber,
        status: notificationData.status
      });

      const sent = this.channel.sendToQueue(
        this.shippingQueueName,
        Buffer.from(message),
        {
          persistent: true, // El mensaje persiste en disco
          priority: 1,
          timestamp: Date.now()
        }
      );

      if (sent) {
        this.logger.log(`✅ Notificación de tracking encolada exitosamente: ${notificationData.shippingInfo.trackingNumber} - ${notificationData.status}`);
        return true;
      } else {
        this.logger.error('❌ No se pudo encolar la notificación de tracking');
        return false;
      }
    } catch (error) {
      this.logger.error('❌ Error encolando notificación de tracking:', error);
      return false;
    }
  }

  async enqueueCartItemAdded(cartData: CartItemAddedQueueData): Promise<boolean> {
    try {
      if (!this.channel) {
        this.logger.error('❌ Canal RabbitMQ no disponible');
        return false;
      }

      const messagePayload = {
        ...cartData,
        retryCount: 0,
        enqueuedAt: new Date().toISOString()
      };

      const message = JSON.stringify(messagePayload);

      this.logger.log(`📥 ENCOLANDO NOTIFICACIÓN DE ITEM AGREGADO AL CARRITO:`, {
        queueName: this.cartItemAddedQueueName,
        cartId: cartData.cartId,
        productName: cartData.product.name,
        userName: cartData.userName
      });

      const sent = this.channel.sendToQueue(
        this.cartItemAddedQueueName,
        Buffer.from(message),
        {
          persistent: true,
          priority: 1,
          timestamp: Date.now()
        }
      );

      if (sent) {
        this.logger.log(`✅ Notificación de item agregado encolada exitosamente: Cart ${cartData.cartId} - ${cartData.product.name}`);
        return true;
      } else {
        this.logger.error('❌ No se pudo encolar la notificación de item agregado');
        return false;
      }
    } catch (error) {
      this.logger.error('❌ Error encolando notificación de item agregado:', error);
      return false;
    }
  }

  async enqueueCartExpired(cartData: CartExpiredQueueData): Promise<boolean> {
    try {
      if (!this.channel) {
        this.logger.error('❌ Canal RabbitMQ no disponible');
        return false;
      }

      const messagePayload = {
        ...cartData,
        retryCount: 0,
        enqueuedAt: new Date().toISOString()
      };

      const message = JSON.stringify(messagePayload);

      this.logger.log(`📥 ENCOLANDO NOTIFICACIÓN DE CARRITO EXPIRADO:`, {
        queueName: this.cartExpiredQueueName,
        cartId: cartData.cartId,
        userName: cartData.userName,
        totalAmount: cartData.totalAmount
      });

      const sent = this.channel.sendToQueue(
        this.cartExpiredQueueName,
        Buffer.from(message),
        {
          persistent: true,
          priority: 2, // Mayor prioridad para carritos expirados
          timestamp: Date.now()
        }
      );

      if (sent) {
        this.logger.log(`✅ Notificación de carrito expirado encolada exitosamente: Cart ${cartData.cartId}`);
        return true;
      } else {
        this.logger.error('❌ No se pudo encolar la notificación de carrito expirado');
        return false;
      }
    } catch (error) {
      this.logger.error('❌ Error encolando notificación de carrito expirado:', error);
      return false;
    }
  }

  private async startConsumer(): Promise<void> {
    try {
      if (!this.channel) {
        throw new Error('Canal no disponible');
      }

      await this.channel.prefetch(1); // Procesar de a un mensaje por vez
      
      await this.channel.consume(this.queueName, async (msg: any) => {
        if (msg && this.channel) {
          try {
            const rawMessage = msg.content.toString();
            const commentData: CommentQueueData = JSON.parse(rawMessage);
            
            this.logger.log(`📥 MENSAJE DESENCOLADO:`, {
              username: commentData.username,
              comment: commentData.comment,
              storeName: commentData.storeName,
              timestamp: commentData.timestamp,
              retryCount: commentData.retryCount || 0
            });
            
            this.logger.log(`🔄 Procesando comentario: @${commentData.username} - "${commentData.comment}"`);
            
            const success = await this.sendToWebhook(commentData);
            
            if (success) {
              // Acknowledge message - se elimina de la cola
              this.channel.ack(msg);
              this.logger.log(`✅ Comentario procesado exitosamente: @${commentData.username}`);
            } else {
              // Reencolar con retry o rechazar definitivamente
              await this.handleFailedMessage(msg, commentData);
            }
          } catch (error) {
            this.logger.error('❌ Error procesando mensaje:', error);
            this.logger.error('📝 Contenido del mensaje raw:', msg.content.toString());
            // Rechazar mensaje sin reencolar si hay error de parsing
            this.channel.nack(msg, false, false);
          }
        }
      });

      this.logger.log('🔄 Consumer de comentarios iniciado - escuchando comentarios...');

      // Consumer para notificaciones de tracking
      await this.channel.consume(this.shippingQueueName, async (msg: any) => {
        if (msg && this.channel) {
          try {
            const rawMessage = msg.content.toString();
            const shippingData: ShippingNotificationQueueData = JSON.parse(rawMessage);

            this.logger.log(`📥 NOTIFICACIÓN DE TRACKING DESENCOLADA:`, {
              trackingNumber: shippingData.shippingInfo.trackingNumber,
              status: shippingData.status,
              retryCount: shippingData.retryCount || 0
            });

            this.logger.log(`🔄 Procesando notificación: ${shippingData.shippingInfo.trackingNumber} - ${shippingData.status}`);

            const success = await this.sendShippingToWebhook(shippingData);

            if (success) {
              // Acknowledge message - se elimina de la cola
              this.channel.ack(msg);
              this.logger.log(`✅ Notificación de tracking procesada exitosamente: ${shippingData.shippingInfo.trackingNumber}`);
            } else {
              // Reencolar con retry o rechazar definitivamente
              await this.handleFailedShippingMessage(msg, shippingData);
            }
          } catch (error) {
            this.logger.error('❌ Error procesando notificación de tracking:', error);
            this.logger.error('📝 Contenido del mensaje raw:', msg.content.toString());
            // Rechazar mensaje sin reencolar si hay error de parsing
            this.channel.nack(msg, false, false);
          }
        }
      });

      this.logger.log('🔄 Consumer de tracking iniciado - escuchando notificaciones de tracking...');

      // Consumer para notificaciones de items agregados al carrito
      await this.channel.consume(this.cartItemAddedQueueName, async (msg: any) => {
        if (msg && this.channel) {
          try {
            const rawMessage = msg.content.toString();
            const cartData: CartItemAddedQueueData = JSON.parse(rawMessage);

            this.logger.log(`📥 NOTIFICACIÓN DE ITEM AGREGADO DESENCOLADA:`, {
              cartId: cartData.cartId,
              productName: cartData.product.name,
              userName: cartData.userName,
              retryCount: cartData.retryCount || 0
            });

            const success = await this.sendCartItemToWebhook(cartData);

            if (success) {
              this.channel.ack(msg);
              this.logger.log(`✅ Notificación de item agregado procesada exitosamente: Cart ${cartData.cartId}`);
            } else {
              await this.handleFailedCartItemMessage(msg, cartData);
            }
          } catch (error) {
            this.logger.error('❌ Error procesando notificación de item agregado:', error);
            this.channel.nack(msg, false, false);
          }
        }
      });

      this.logger.log('🔄 Consumer de items agregados al carrito iniciado - escuchando...');

      // Consumer para notificaciones de carritos expirados
      await this.channel.consume(this.cartExpiredQueueName, async (msg: any) => {
        if (msg && this.channel) {
          try {
            const rawMessage = msg.content.toString();
            const cartData: CartExpiredQueueData = JSON.parse(rawMessage);

            this.logger.log(`📥 NOTIFICACIÓN DE CARRITO EXPIRADO DESENCOLADA:`, {
              cartId: cartData.cartId,
              userName: cartData.userName,
              totalAmount: cartData.totalAmount,
              retryCount: cartData.retryCount || 0
            });

            const success = await this.sendCartExpiredToWebhook(cartData);

            if (success) {
              this.channel.ack(msg);
              this.logger.log(`✅ Notificación de carrito expirado procesada exitosamente: Cart ${cartData.cartId}`);
            } else {
              await this.handleFailedCartExpiredMessage(msg, cartData);
            }
          } catch (error) {
            this.logger.error('❌ Error procesando notificación de carrito expirado:', error);
            this.channel.nack(msg, false, false);
          }
        }
      });

      this.logger.log('🔄 Consumer de carritos expirados iniciado - escuchando...');
    } catch (error) {
      this.logger.error('❌ Error iniciando consumers:', error);
      throw error;
    }
  }

  private async sendToWebhook(commentData: CommentQueueData): Promise<boolean> {
    try {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false
      });

      const webhookPayload = {
        username: commentData.username,
        comment: commentData.comment,
        storeName: commentData.storeName,
        timestamp: commentData.timestamp
      };

      this.logger.log(`📤 ENVIANDO A N8N:`, {
        url: this.webhookUrl,
        payload: webhookPayload
      });

      const response = await axios({
        method: 'post',
        url: this.webhookUrl,
        data: webhookPayload,
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        httpsAgent: httpsAgent,
        validateStatus: (status) => status >= 200 && status < 300
      });

      this.logger.log(`✅ Webhook enviado exitosamente a N8N:`, {
        status: response.status,
        statusText: response.statusText,
        responseData: response.data
      });
      return true;
    } catch (error) {
      this.logger.error('❌ Error enviando a webhook N8N:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: this.webhookUrl
      });
      return false;
    }
  }

  private async sendShippingToWebhook(shippingData: ShippingNotificationQueueData): Promise<boolean> {
    try {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false
      });

      this.logger.log(`📤 ENVIANDO NOTIFICACIÓN DE TRACKING A N8N:`, {
        url: this.shippingWebhookUrl,
        trackingNumber: shippingData.shippingInfo.trackingNumber,
        status: shippingData.status
      });

      const response = await axios({
        method: 'post',
        url: this.shippingWebhookUrl,
        data: shippingData,
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        httpsAgent: httpsAgent,
        validateStatus: (status) => status >= 200 && status < 300
      });

      this.logger.log(`✅ Notificación de tracking enviada exitosamente a N8N:`, {
        status: response.status,
        statusText: response.statusText,
        trackingNumber: shippingData.shippingInfo.trackingNumber
      });
      return true;
    } catch (error) {
      this.logger.error('❌ Error enviando notificación de tracking a webhook N8N:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: this.shippingWebhookUrl,
        trackingNumber: shippingData.shippingInfo.trackingNumber
      });
      return false;
    }
  }

  private async sendCartItemToWebhook(cartData: CartItemAddedQueueData): Promise<boolean> {
    try {
      if (!this.cartItemAddedWebhookUrl) {
        this.logger.warn('⚠️ WEBHOOK_CART_ITEM_ADDED_URL no configurada, saltando envío');
        return true; // No es error, simplemente no está configurado
      }

      const httpsAgent = new https.Agent({
        rejectUnauthorized: false
      });

      this.logger.log(`📤 ENVIANDO NOTIFICACIÓN DE ITEM AGREGADO A N8N:`, {
        url: this.cartItemAddedWebhookUrl,
        cartId: cartData.cartId,
        productName: cartData.product.name
      });

      const response = await axios({
        method: 'post',
        url: this.cartItemAddedWebhookUrl,
        data: cartData,
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        httpsAgent: httpsAgent,
        validateStatus: (status) => status >= 200 && status < 300
      });

      this.logger.log(`✅ Notificación de item agregado enviada exitosamente a N8N:`, {
        status: response.status,
        cartId: cartData.cartId
      });
      return true;
    } catch (error) {
      this.logger.error('❌ Error enviando notificación de item agregado a webhook N8N:', {
        message: error.message,
        status: error.response?.status,
        cartId: cartData.cartId
      });
      return false;
    }
  }

  private async sendCartExpiredToWebhook(cartData: CartExpiredQueueData): Promise<boolean> {
    try {
      if (!this.cartExpiredWebhookUrl) {
        this.logger.warn('⚠️ WEBHOOK_CART_EXPIRED_URL no configurada, saltando envío');
        return true; // No es error, simplemente no está configurado
      }

      const httpsAgent = new https.Agent({
        rejectUnauthorized: false
      });

      this.logger.log(`📤 ENVIANDO NOTIFICACIÓN DE CARRITO EXPIRADO A N8N:`, {
        url: this.cartExpiredWebhookUrl,
        cartId: cartData.cartId,
        userName: cartData.userName
      });

      const response = await axios({
        method: 'post',
        url: this.cartExpiredWebhookUrl,
        data: cartData,
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        httpsAgent: httpsAgent,
        validateStatus: (status) => status >= 200 && status < 300
      });

      this.logger.log(`✅ Notificación de carrito expirado enviada exitosamente a N8N:`, {
        status: response.status,
        cartId: cartData.cartId
      });
      return true;
    } catch (error) {
      this.logger.error('❌ Error enviando notificación de carrito expirado a webhook N8N:', {
        message: error.message,
        status: error.response?.status,
        cartId: cartData.cartId
      });
      return false;
    }
  }

  private async handleFailedMessage(msg: any, commentData: CommentQueueData): Promise<void> {
    if (!this.channel) {
      return;
    }

    const retryCount = (commentData.retryCount || 0) + 1;
    
    if (retryCount <= this.maxRetries) {
      // Reencolar con incremento de retry
      const retryData = {
        ...commentData,
        retryCount
      };
      
      // Delay exponencial: 2^retry segundos
      const delay = Math.pow(2, retryCount) * 1000;
      
      setTimeout(async () => {
        await this.enqueueComment(retryData);
        this.logger.log(`🔄 Reencolando comentario (intento ${retryCount}/${this.maxRetries}): @${commentData.username}`);
      }, delay);
      
      // Acknowledge current message
      this.channel.ack(msg);
    } else {
      // Máximo de reintentos alcanzado
      this.logger.error(`❌ Máximo de reintentos alcanzado para: @${commentData.username}`);
      this.channel.ack(msg); // Remove from queue permanently
      
      // Opcionalmente enviar a dead letter queue o log especial
      await this.handleDeadLetter(commentData);
    }
  }

  private async handleDeadLetter(commentData: CommentQueueData): Promise<void> {
    // Log crítico para comentarios que no se pudieron procesar
    this.logger.error('💀 COMENTARIO PERDIDO - Revisar manualmente:', {
      username: commentData.username,
      comment: commentData.comment,
      storeName: commentData.storeName,
      timestamp: commentData.timestamp,
      retryCount: commentData.retryCount
    });

    // Aquí podrías enviar a una dead letter queue, base de datos, etc.
  }

  private async handleFailedShippingMessage(msg: any, shippingData: ShippingNotificationQueueData): Promise<void> {
    if (!this.channel) {
      return;
    }

    const retryCount = (shippingData.retryCount || 0) + 1;

    if (retryCount <= this.maxRetries) {
      // Reencolar con incremento de retry
      const retryData = {
        ...shippingData,
        retryCount
      };

      // Delay exponencial: 2^retry segundos
      const delay = Math.pow(2, retryCount) * 1000;

      setTimeout(async () => {
        await this.enqueueShippingNotification(retryData);
        this.logger.log(`🔄 Reencolando notificación de tracking (intento ${retryCount}/${this.maxRetries}): ${shippingData.shippingInfo.trackingNumber}`);
      }, delay);

      // Acknowledge current message
      this.channel.ack(msg);
    } else {
      // Máximo de reintentos alcanzado
      this.logger.error(`❌ Máximo de reintentos alcanzado para notificación: ${shippingData.shippingInfo.trackingNumber}`);
      this.channel.ack(msg); // Remove from queue permanently

      // Opcionalmente enviar a dead letter queue o log especial
      await this.handleShippingDeadLetter(shippingData);
    }
  }

  private async handleShippingDeadLetter(shippingData: ShippingNotificationQueueData): Promise<void> {
    // Log crítico para notificaciones que no se pudieron procesar
    this.logger.error('💀 NOTIFICACIÓN DE TRACKING PERDIDA - Revisar manualmente:', {
      trackingNumber: shippingData.shippingInfo.trackingNumber,
      status: shippingData.status,
      customerName: shippingData.customerName,
      saleId: shippingData.saleId,
      timestamp: shippingData.timestamp,
      retryCount: shippingData.retryCount
    });

    // Aquí podrías enviar a una dead letter queue, base de datos, etc.
  }

  private async handleFailedCartItemMessage(msg: any, cartData: CartItemAddedQueueData): Promise<void> {
    if (!this.channel) {
      return;
    }

    const retryCount = (cartData.retryCount || 0) + 1;

    if (retryCount <= this.maxRetries) {
      const retryData = {
        ...cartData,
        retryCount
      };

      const delay = Math.pow(2, retryCount) * 1000;

      setTimeout(async () => {
        await this.enqueueCartItemAdded(retryData);
        this.logger.log(`🔄 Reencolando notificación de item agregado (intento ${retryCount}/${this.maxRetries}): Cart ${cartData.cartId}`);
      }, delay);

      this.channel.ack(msg);
    } else {
      this.logger.error(`❌ Máximo de reintentos alcanzado para notificación de item agregado: Cart ${cartData.cartId}`);
      this.channel.ack(msg);
      await this.handleCartItemDeadLetter(cartData);
    }
  }

  private async handleCartItemDeadLetter(cartData: CartItemAddedQueueData): Promise<void> {
    this.logger.error('💀 NOTIFICACIÓN DE ITEM AGREGADO PERDIDA - Revisar manualmente:', {
      cartId: cartData.cartId,
      productName: cartData.product.name,
      userName: cartData.userName,
      timestamp: cartData.timestamp,
      retryCount: cartData.retryCount
    });
  }

  private async handleFailedCartExpiredMessage(msg: any, cartData: CartExpiredQueueData): Promise<void> {
    if (!this.channel) {
      return;
    }

    const retryCount = (cartData.retryCount || 0) + 1;

    if (retryCount <= this.maxRetries) {
      const retryData = {
        ...cartData,
        retryCount
      };

      const delay = Math.pow(2, retryCount) * 1000;

      setTimeout(async () => {
        await this.enqueueCartExpired(retryData);
        this.logger.log(`🔄 Reencolando notificación de carrito expirado (intento ${retryCount}/${this.maxRetries}): Cart ${cartData.cartId}`);
      }, delay);

      this.channel.ack(msg);
    } else {
      this.logger.error(`❌ Máximo de reintentos alcanzado para notificación de carrito expirado: Cart ${cartData.cartId}`);
      this.channel.ack(msg);
      await this.handleCartExpiredDeadLetter(cartData);
    }
  }

  private async handleCartExpiredDeadLetter(cartData: CartExpiredQueueData): Promise<void> {
    this.logger.error('💀 NOTIFICACIÓN DE CARRITO EXPIRADO PERDIDA - Revisar manualmente:', {
      cartId: cartData.cartId,
      userName: cartData.userName,
      totalAmount: cartData.totalAmount,
      paymentLink: cartData.paymentLink,
      timestamp: cartData.timestamp,
      retryCount: cartData.retryCount
    });
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('🔌 Desconectado de RabbitMQ');
    } catch (error) {
      this.logger.error('❌ Error desconectando de RabbitMQ:', error);
    }
  }

  // Método para verificar el estado de la conexión
  isConnected(): boolean {
    try {
      return !!(this.connection && !this.connection.connection?.destroyed);
    } catch {
      return false;
    }
  }

  // Método para obtener estadísticas de la cola
  async getQueueStats(): Promise<any> {
    try {
      if (!this.channel) {
        return null;
      }
      
      const queueInfo = await this.channel.checkQueue(this.queueName);
      return {
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount
      };
    } catch (error) {
      this.logger.error('❌ Error obteniendo estadísticas de cola:', error);
      return null;
    }
  }
}