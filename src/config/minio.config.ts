import { Client } from 'minio';
import https from 'https';
import http from 'http';

let minioClientInstance: Client | null = null;

export const getMinioClient = (): Client => {
  if (!minioClientInstance) {
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    let endPoint = process.env.MINIO_ENDPOINT;
    const port = parseInt(process.env.MINIO_PORT) || 9000;

    // Remove protocol from endpoint if present
    if (endPoint) {
      endPoint = endPoint.replace(/^https?:\/\//, '');
    }

    if (!endPoint) {
      throw new Error('MINIO_ENDPOINT environment variable is required');
    }

    console.log('MinIO Configuration:', {
      endPoint,
      port,
      useSSL,
      protocol: useSSL ? 'https' : 'http'
    });

    minioClientInstance = new Client({
      endPoint,
      port,
      useSSL: useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
      // Configurar el transportAgent según si usa SSL o no
      transportAgent: useSSL 
        ? new https.Agent({
            rejectUnauthorized: false // Para certificados autofirmados (SOLO DESARROLLO)
          })
        : new http.Agent({
            keepAlive: true
          })
    });
  }
  
  return minioClientInstance;
};

// Export a function instead of instantiating the client
export const minioClient = () => getMinioClient();