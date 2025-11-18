import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WebcastPushConnection } from 'tiktok-live-connector';
import { Repository, Like } from 'typeorm';
import axios from 'axios';
import https from 'https';
import { Store } from '../entity/store.entity';
import { TikTokComment } from 'src/entity/tik-tok-comment';
import { TikTokUser } from 'src/entity/user-tiktok.entity';
import { Product } from 'src/entity/product.entity';
import { PurchaseIntent } from 'src/entity/purchase-intent.entity';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

interface CommentData {
  username: string;
  comment: string;
  storeName: string;
  timestamp: string;
}

interface AIAnalysisData {
  username: string;
  comment: string;
  storeName: string;
  storeId: number;
  isRegisteredUser: boolean;
  timestamp: string;
  products: Array<{
    id: number;
    name: string;
    code: string;
    price: number;
  }>;
}

@Injectable()
export class TikTokCommentService {
  private readonly logger = new Logger(TikTokCommentService.name);
  private readonly webhookUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n-n8n.shblkb.easypanel.host/webhook/99b63e0c-4d80-4dff-b2fe-3d5cde91423b';
  private readonly aiAnalysisWebhookUrl = 'https://n8n.srv726018.hstgr.cloud/webhook/ai-purchase-intent-free';
  private tiktokLiveConnection: WebcastPushConnection;

  constructor(
    @InjectRepository(TikTokComment)
    private readonly commentRepository: Repository<TikTokComment>,
    @InjectRepository(PurchaseIntent)
    private readonly purchaseIntentRepository: Repository<PurchaseIntent>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(TikTokUser)
    private readonly tiktokUserRepository: Repository<TikTokUser>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async getCommentsTiktokByStore(
    userId: number,
    page: number = 1,
    limit: number = 50,
    search: string = '',
    searchType: string = 'all'
  ) {
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['categories'],
    });

    if (!store) throw new NotFoundException('La tienda no fue encontrada');

    // Calcular offset para paginación
    const offset = (page - 1) * limit;

    // Construir las condiciones de búsqueda
    let whereConditions: any = { store: { id: store.id } };
    
    if (search.trim()) {
      if (searchType === 'comment') {
        // Buscar solo en el contenido del comentario
        whereConditions.comment = Like(`%${search}%`);
      } else if (searchType === 'username') {
        // Buscar solo en el nombre de usuario
        whereConditions.username = Like(`%${search}%`);
      } else {
        // Buscar en ambos (all) - usar query builder para OR
        const queryBuilder = this.commentRepository.createQueryBuilder('comment')
          .leftJoinAndSelect('comment.user', 'user')
          .where('comment.store = :storeId', { storeId: store.id })
          .andWhere('(comment.comment LIKE :search OR comment.username LIKE :search)', { search: `%${search}%` })
          .orderBy('comment.createdAt', 'DESC')
          .take(limit)
          .skip(offset);

        const [comments, total] = await queryBuilder.getManyAndCount();

        // Calcular información de paginación
        const totalPages = Math.ceil(total / limit);
        const hasNext = page < totalPages;
        const hasPrev = page > 1;

        const paginationInfo = {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev
        };


        return {
          data: comments,
          pagination: paginationInfo
        };
      }
    }

    // console.log('🔍 Backend search params:', {
    //   userId,
    //   page,
    //   limit,
    //   search,
    //   searchType,
    //   offset,
    //   whereConditions: JSON.stringify(whereConditions)
    // });

    // Obtener comentarios con paginación
    const [comments, total] = await this.commentRepository.findAndCount({
      where: whereConditions,
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    // Debug: Verificar los últimos 5 comentarios en la base de datos para comparar
    if (page === 1 && !search.trim()) {
      const latestComments = await this.commentRepository.find({
        where: { store: { id: store.id } },
        order: { createdAt: 'DESC' },
        take: 5,
        relations: ['user']
      });
      
      // console.log('🔍 Los 5 comentarios más recientes en BD:', 
      //   latestComments.map(c => ({
      //     id: c.id,
      //     username: c.username,
      //     comment: c.comment.substring(0, 30) + '...',
      //     createdAt: c.createdAt
      //   }))
      // );
    }


    // Calcular información de paginación
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const paginationInfo = {
      page,
      limit,
      total,
      totalPages,
      hasNext,
      hasPrev
    };


    return {
      data: comments,
      pagination: paginationInfo
    };
  }

  async startListeningByUserId(userId: number) {
    console.log('userId', userId);

    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
    });

    if (!store) throw new NotFoundException('La tienda no fue encontrada');

    this.logger.log(`🎥 Iniciando conexión a TikTok Live de @${store.name}...`);

    this.logger.log(`🔹 Tienda encontrada: ${store.name} (ID: ${store.id})`);

    this.tiktokLiveConnection = new WebcastPushConnection(store.name, { 
      enableExtendedGiftInfo: true,
      processInitialData: false,
      fetchRoomInfoOnConnect: true,
      enableWebsocketUpgrade: true, // v2.x maneja mejor WebSocket
      requestOptions: {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        }
      }
    });

    try {
      this.logger.log(`🔄 Intentando conectar a TikTok Live de ${store.name}...`);
      
      // Verificar conectividad antes de intentar conexión
      await this.checkTikTokConnectivity();
      
      await this.tiktokLiveConnection.connect();
      this.logger.log(`✅ Conectado exitosamente a TikTok Live de ${store.name}`);

      this.tiktokLiveConnection.on('chat', async (data) => {
        this.logger.log(`💬 @${data.uniqueId}: ${data.comment}`);

        try {
          await this.processComment(data.comment, data.uniqueId, store.name);
          this.logger.log(`✅ Comentario procesado correctamente.`);
        } catch (error) {
          this.logger.error(`❌ Error procesando comentario`, error);
        }
      });
    } catch (error) {
      this.logger.error(`❌ Error conectando a TikTok Live:`, {
        message: error.message,
        store: store.name,
        error: error.toString()
      });
      
      // Retry después de 30 segundos
      setTimeout(() => {
        this.logger.log(`🔄 Reintentando conexión a TikTok Live de ${store.name} en 30 segundos...`);
        this.startListening(store.name);
      }, 30000);
    }
  }

  async saveComment(storeId: number, username: string, comment: string) {
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) {
      this.logger.error('❌ Tienda no encontrada al guardar comentario');
      return;
    }

    const user = await this.tiktokUserRepository.findOne({ where: { tiktok: username } });

    const newComment = this.commentRepository.create({
      username,
      comment,
      store,
      user, // Puede ser null si no existe
    });

    await this.commentRepository.save(newComment);
  }

  /**
   * 💾 Guarda comentario con análisis de IA incluido
   */
  async saveCommentWithAnalysis(
    storeId: number, 
    username: string, 
    comment: string, 
    hasPurchaseIntent: boolean = false,
    aiScore: number = null
  ) {
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) {
      this.logger.error('❌ Tienda no encontrada al guardar comentario');
      return;
    }

    const user = await this.tiktokUserRepository.findOne({ where: { tiktok: username } });

    const newComment = this.commentRepository.create({
      username,
      comment,
      store,
      user, // Puede ser null si no existe
      hasPurchaseIntent,
      aiAnalysisScore: aiScore,
      sentToWebhook: false, // Inicialmente false, se actualiza después
    });

    const savedComment = await this.commentRepository.save(newComment);
    return savedComment;
  }

  /**
   * 📤 Actualiza el estado de webhook de un comentario
   */
  async updateCommentWebhookStatus(storeId: number, username: string, comment: string) {
    try {
      await this.commentRepository.update(
        {
          store: { id: storeId },
          username,
          comment,
        },
        {
          sentToWebhook: true,
        }
      );
      this.logger.log('✅ Estado de webhook actualizado');
    } catch (error) {
      this.logger.error('❌ Error actualizando estado de webhook:', error);
    }
  }

  async processComment(comment: string, username: string, storeName: string): Promise<string | void> {
    this.logger.log(`📝 Procesando comentario: ${comment}`);

    // Get store information FIRST
    const store = await this.storeRepository.findOne({ 
      where: { name: storeName },
      relations: ['categories', 'categories.products']
    });
    
    if (!store) {
      this.logger.error(`❌ Tienda no encontrada: ${storeName}`);
      return;
    }

    // Check if user is registered
    const registeredUser = await this.tiktokUserRepository.findOne({ 
      where: { tiktok: username } 
    });

    // 🧠 Analizar intención de compra (opcional, para información)
    let hasPurchaseIntent = false;
    let aiScore = null;
    
    // 🔑 PALABRA CLAVE ESPECIAL para testing - siempre activa el flujo
    const testKeyword = process.env.TIKTOK_TEST_KEYWORD || "hola";
    
    const commentLower = comment.toLowerCase();
    const isTestKeyword = commentLower.includes(testKeyword.toLowerCase());
    
    if (isTestKeyword) {
      hasPurchaseIntent = true;
      aiScore = 1.0; // Score máximo para palabra clave
      this.logger.log(`🔑 PALABRA CLAVE DETECTADA: "${testKeyword}" en comentario "${comment}" - Activando flujo N8N`);
    } else {
      // Análisis normal con IA
      try {
        hasPurchaseIntent = await this.analyzePurchaseIntent(comment);
        // Si quieres guardar el score, puedes modificar analyzePurchaseIntent para retornarlo
        aiScore = hasPurchaseIntent ? 0.8 : 0.2; // Placeholder score
        this.logger.log(`🧠 Análisis IA: ${hasPurchaseIntent ? 'Intención de compra detectada' : 'Sin intención de compra'}`);
      } catch (error) {
        this.logger.warn(`⚠️ Error en análisis de IA: ${error.message}`);
      }
    }

    // 💾 GUARDAR TODOS LOS COMENTARIOS (independientemente de la intención)
    await this.saveCommentWithAnalysis(store.id, username, comment, hasPurchaseIntent, aiScore);
    this.logger.log(`💾 Comentario guardado en BD: @${username}: ${comment}`);

    // 📤 Solo enviar a webhook/RabbitMQ si tiene intención de compra
    let sentToWebhook = false;
    if (hasPurchaseIntent) {
      this.logger.log('✅ Comentario con intención de compra - enviando a webhook');
      
      const commentData: CommentData = {
        username,
        comment,
        storeName,
        timestamp: new Date().toISOString()
      };

      try {
        const enqueued = await this.rabbitMQService.enqueueComment(commentData);
        
        if (enqueued) {
          this.logger.log('✅ Comentario encolado exitosamente en RabbitMQ');
          sentToWebhook = true;
        } else {
          this.logger.error('❌ Error encolando comentario, enviando directamente como fallback');
          await this.sendDirectToWebhook(commentData);
          sentToWebhook = true;
        }
      } catch (error) {
        this.logger.error('❌ Error con RabbitMQ, enviando directamente como fallback:', error);
        await this.sendDirectToWebhook(commentData);
        sentToWebhook = true;
      }

      // Actualizar el registro para marcar que fue enviado
      if (sentToWebhook) {
        await this.updateCommentWebhookStatus(store.id, username, comment);
      }
    } else {
      this.logger.log('ℹ️ Comentario sin intención de compra - solo guardado en BD');
    }

    if (registeredUser) {
      this.logger.log(`✅ Usuario ${username} registrado`);
    } else {
      this.logger.log(`ℹ️ Usuario ${username} no registrado`);
    }

    return;
  }

  private async sendToAIAnalysis(comment: string, username: string, store: Store, user: TikTokUser) {
    try {
      // Get all products from store
      const products = await this.productRepository.find({
        where: { category: { store: { id: store.id } } },
        relations: ['category'],
        select: ['id', 'name', 'code', 'price']
      });

      const aiAnalysisData: AIAnalysisData = {
        username,
        comment,
        storeName: store.name,
        storeId: store.id,
        isRegisteredUser: true,
        timestamp: new Date().toISOString(),
        products: products.map(p => ({
          id: p.id,
          name: p.name,
          code: p.code,
          price: p.price
        }))
      };

      this.logger.log('🤖 Enviando comentario para análisis de IA:', {
        username,
        comment,
        productsCount: products.length
      });

      const httpsAgent = new https.Agent({
        rejectUnauthorized: false // Ignore self-signed certificates
      });

      axios({
        method: 'post',
        url: this.aiAnalysisWebhookUrl,
        data: aiAnalysisData,
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        httpsAgent: httpsAgent,
        validateStatus: (status) => status >= 200 && status < 300
      })
      .catch(error => {
        this.logger.error('❌ Error enviando comentario para análisis de IA', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
      });

      this.logger.log('✅ Comentario enviado para análisis de IA');
    } catch (error) {
      this.logger.error('❌ Error preparando datos para análisis de IA:', error);
    }
  }

  private async sendDirectToWebhook(commentData: CommentData): Promise<void> {
    try {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false
      });

      const response = await axios({
        method: 'post',
        url: this.webhookUrl,
        data: commentData,
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
        httpsAgent: httpsAgent,
        validateStatus: (status) => status >= 200 && status < 300
      });

      this.logger.log(`✅ Comentario enviado directamente al webhook: ${response.status}`);
    } catch (error) {
      this.logger.error('❌ Error enviando comentario directamente al webhook', {
        message: error.message,
        status: error.response?.status
      });
    }
  }

  private generatePurchaseLink(username: string, product: Product): string {
    const link = `https://comprepues.com.co/checkout?user=${username}&product=${product.id}`;
    this.logger.log(`🔗 Link de compra generado: ${link}`);
    return link;
  }

  async startListening(username: string) {
    this.logger.log(`🎥 Iniciando conexión a TikTok Live de @${username}...`);

    const store = await this.storeRepository.findOne({ where: { name: username } });
    if (!store) {
      this.logger.error(`❌ No se encontró la tienda para ${username}`);
      return;
    }

    this.logger.log(`🔹 Tienda encontrada: ${store.name} (ID: ${store.id})`);

    // Establecer conexión con TikTok Live
    this.tiktokLiveConnection = new WebcastPushConnection(username, { enableExtendedGiftInfo: true });

    try {
      await this.tiktokLiveConnection.connect();
      this.logger.log(`✅ Conectado exitosamente a TikTok Live de ${username}`);

      // Escuchar mensajes de chat
      this.tiktokLiveConnection.on('chat', async (data) => {
        this.logger.log(`💬 @${data.uniqueId}: ${data.comment}`);

        try {
          await this.processComment(data.comment, data.uniqueId, username);
          this.logger.log(`✅ Comentario procesado correctamente.`);
        } catch (error) {
          this.logger.error(`❌ Error procesando comentario`, error);
        }
      });
    } catch (error) {
      this.logger.error(`❌ Error conectando a TikTok Live`, error);
    }
  }

  /**
   * Guarda un comentario con intención de compra en la base de datos.
   */
  async savePurchaseIntent(storeId: number, username: string, comment: string, product: Product) {
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) {
      this.logger.error('❌ Tienda no encontrada al guardar intención de compra');
      return;
    }

    // Buscar usuario pero NO crear uno nuevo si no existe
    const user = await this.tiktokUserRepository.findOne({ where: { tiktok: username } });

    const newIntent = this.purchaseIntentRepository.create({
      comment,
      store,
      userTikTok: user, // Puede ser null si no existe
      product,
    });

    await this.purchaseIntentRepository.save(newIntent);
  }

  /**
   * Obtiene comentarios de una tienda específica (sin intención de compra).
   */
  async getCommentsByStore(storeId: number): Promise<TikTokComment[]> {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['tiktokComments']
    });

    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }

    return store.tiktokComments || []; // Return empty array if tiktokComments is undefined
  }

  /**
   * Obtiene intenciones de compra de una tienda específica.
   */
  async getPurchaseIntentsByStore(storeId: number): Promise<PurchaseIntent[]> {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['purchaseIntents']
    });

    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }

    return store.purchaseIntents;
  }

  async processAIAnalysisResponse(analysisResult: any) {
    try {
      this.logger.log('🤖 Procesando respuesta del análisis de IA:', {
        username: analysisResult.username,
        hasPurchaseIntent: analysisResult.hasPurchaseIntent,
        productsDetected: analysisResult.detectedProducts?.length || 0
      });

      const store = await this.storeRepository.findOne({ 
        where: { id: analysisResult.storeId } 
      });

      if (!store) {
        this.logger.error(`❌ Tienda con ID ${analysisResult.storeId} no encontrada`);
        return { success: false, message: 'Tienda no encontrada' };
      }

      // Si hay intención de compra y productos detectados
      if (analysisResult.hasPurchaseIntent && analysisResult.detectedProducts?.length > 0) {
        const purchaseIntents = [];

        for (const detectedProduct of analysisResult.detectedProducts) {
          if (detectedProduct.confidence >= 0.7) { // Solo productos con alta confianza
            const product = await this.productRepository.findOne({
              where: { id: detectedProduct.id },
              relations: ['category']
            });

            if (product) {
              await this.savePurchaseIntent(
                store.id, 
                analysisResult.username, 
                analysisResult.comment, 
                product
              );

              const purchaseLink = this.generatePurchaseLink(analysisResult.username, product);
              purchaseIntents.push({
                product: product.name,
                code: product.code,
                link: purchaseLink,
                confidence: detectedProduct.confidence
              });

              this.logger.log(`✅ Intención de compra guardada para producto: ${product.name}`);
            }
          }
        }

        return { 
          success: true, 
          message: 'Intención de compra procesada',
          purchaseIntents
        };
      } else {
        // Solo guardar como comentario normal
        await this.saveComment(store.id, analysisResult.username, analysisResult.comment);
        this.logger.log('ℹ️ Comentario guardado sin intención de compra');
        
        return { 
          success: true, 
          message: 'Comentario guardado sin intención de compra' 
        };
      }
    } catch (error) {
      this.logger.error('❌ Error procesando respuesta del análisis de IA:', error);
      return { success: false, message: 'Error procesando análisis' };
    }
  }

  async getQueueStats(): Promise<any> {
    try {
      const stats = await this.rabbitMQService.getQueueStats();
      const isConnected = this.rabbitMQService.isConnected();
      
      return {
        connected: isConnected,
        queueStats: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('❌ Error obteniendo estadísticas de cola:', error);
      return {
        connected: false,
        error: 'No se pudieron obtener las estadísticas',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🧠 Analiza un comentario para detectar intención de compra usando IA
   */
  private async analyzePurchaseIntent(comment: string): Promise<boolean> {
    try {
      // Pre-filtro rápido con regex para obvios casos
      const quickFilter = this.quickPurchaseFilter(comment);
      if (quickFilter !== null) {
        this.logger.log(`🚀 Pre-filtro: ${quickFilter ? 'APROBADO' : 'RECHAZADO'} - "${comment}"`);
        return quickFilter;
      }

      // Usar modelo multilingüe que entiende español directamente
      this.logger.log('🤖 Enviando a IA para análisis multilingüe...');
      
      const response = await fetch('https://router.huggingface.co/hf-inference/models/cardiffnlp/twitter-xlm-roberta-base-sentiment', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: comment
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`❌ Error en API de Hugging Face (${response.status}): ${errorText}`);
        return this.fallbackPurchaseFilter(comment);
      }

      const result = await response.json();
      
      // XLM-RoBERTa multilingüe devuelve NEGATIVE, NEUTRAL, POSITIVE
      const scores = result[0] || [];
      const positiveScore = scores.find(s => s.label === 'POSITIVE')?.score || 0;
      const neutralScore = scores.find(s => s.label === 'NEUTRAL')?.score || 0;
      const negativeScore = scores.find(s => s.label === 'NEGATIVE')?.score || 0;
      
      // Si es positivo (>0.4) o neutral alto (>0.6), podría ser intención de compra
      const hasPurchaseIntent = positiveScore > 0.4 || neutralScore > 0.6;
      
      this.logger.log(`🤖 IA Multilingüe - Pos: ${positiveScore.toFixed(2)}, Neu: ${neutralScore.toFixed(2)}, Neg: ${negativeScore.toFixed(2)} -> ${hasPurchaseIntent ? 'COMPRA' : 'NO COMPRA'}`);
      
      return hasPurchaseIntent;

    } catch (error) {
      this.logger.error('❌ Error en análisis de IA:', error);
      return this.fallbackPurchaseFilter(comment);
    }
  }

  /**
   * 🚀 Pre-filtro rápido con regex
   */
  private quickPurchaseFilter(comment: string): boolean | null {
    const lowerComment = comment.toLowerCase();
    
    // Casos obviamente NO compra
    const rejectionKeywords = /\b(jaja|jeje|😂|🤣|modo|broma|mentira|chiste|gracioso|divertido|chistoso)\b/i;
    if (rejectionKeywords.test(comment)) {
      return false;
    }
    
    // Casos obviamente SÍ compra
    const purchaseKeywords = /\b(quiero|compro|necesito|me interesa|cuánto|precio|envío|disponible|apartado|separado|comprar|costo|vale|pagar|pedido|orden)\b/i;
    if (purchaseKeywords.test(comment)) {
      return true;
    }
    
    // Casos dudosos -> enviar a IA
    return null;
  }

  /**
   * 🛡️ Filtro de respaldo cuando falla la IA
   */
  private fallbackPurchaseFilter(comment: string): boolean {
    this.logger.log('🛡️ Usando filtro de respaldo');
    return this.quickPurchaseFilter(comment) === true;
  }

  /**
   * 🌐 Verifica conectividad con TikTok antes de intentar conexión
   */
  private async checkTikTokConnectivity(): Promise<void> {
    try {
      this.logger.log('🌐 Verificando conectividad con TikTok...');
      
      const response = await fetch('https://www.tiktok.com', {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(10000) // 10 segundos timeout
      });

      if (response.ok) {
        this.logger.log('✅ Conectividad con TikTok verificada');
      } else {
        throw new Error(`TikTok respondió con status ${response.status}`);
      }
    } catch (error) {
      this.logger.error('❌ Error de conectividad con TikTok:', error.message);
      throw new Error(`No se puede conectar a TikTok: ${error.message}`);
    }
  }
}