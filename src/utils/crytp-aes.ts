import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv } from 'crypto';

export class CryptAes {
  private readonly ALGORITHM = 'aes-256-cbc';

  public decryptData(data: string): string {
    const _key = process.env.CRYPTO_KEY;
    const _iv = process.env.CRYPTO_IV;
    //const _iv = process.env.CRYPTO_IV + this.dateFormat();

    const encryptionKey = Buffer.from(_key, 'hex').toString('base64');
    const key = Buffer.from(encryptionKey, 'base64');
    const encryptionIv = Buffer.from(_iv, 'utf8').toString('base64');
    const iv = Buffer.from(encryptionIv, 'base64');

    const decipher = createDecipheriv(this.ALGORITHM, key, iv);
    let str = decipher.update(data, 'base64', 'utf8');
    str += decipher.final('utf8');
    return str;
  }

  public encryptData(data: string): string {
    const _key = process.env.CRYPTO_KEY;
    const _iv = process.env.CRYPTO_IV;
    //const _iv = process.env.CRYPTO_IV + this.dateFormat();
  
    const encryptionKey = Buffer.from(_key, 'hex').toString('base64');
    const key = Buffer.from(encryptionKey, 'base64');
    const encryptionIv = Buffer.from(_iv, 'utf8').toString('base64');
    const iv = Buffer.from(encryptionIv, 'base64');
  
    const cipher = createCipheriv(this.ALGORITHM, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }
  
/*
  private dateFormat() {
    const date = new Date();
    const year = date.getFullYear();
    const day = date.getDate().toString().padStart(2, '0');
    const formatDate = `${year + day}`;

    return formatDate;
  }*/
}
