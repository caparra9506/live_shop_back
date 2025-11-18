import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

    // Habilitar CORS
    app.enableCors({
      origin: '*', // Aceptar solicitudes de cualquier dominio
      methods: 'GET,HEAD,POST,PUT,DELETE,PATCH,OPTIONS', // Métodos HTTP permitidos
      allowedHeaders: 'Content-Type, Authorization, Cache-Control, Pragma', // Headers permitidos
    });

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Habilitar serialización con class-transformer para respetar @Exclude()
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

    app.setGlobalPrefix('api');

    const port = process.env.PORT || 3000;
    // Debug de variables de entorno
    console.log('🚀 SERVIDOR INICIANDO...');
    console.log('📍 Puerto:', port);
    console.log('🔗 WEBHOOK_GUIA_URL:', process.env.WEBHOOK_GUIA_URL);
    console.log('🌐 BASE_URL:', process.env.BASE_URL);
    console.log('🖥️  FRONTEND_URL:', process.env.FRONTEND_URL);
    
  
  await app.listen(port);
  console.log(`✅ Servidor corriendo en puerto ${port}`);
}
bootstrap();
