import * as path from 'path';
import * as fs from 'fs';
import puppeteer from 'puppeteer-extra';
import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Store } from 'src/entity/store.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

@Injectable()
export class TikTokDmService {
  private readonly storagePath = path.join(process.cwd(), 'storage');

  constructor(
    @InjectRepository(Store)
    private storesRepository: Repository<Store>,
  ) {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
      console.log(`[STORAGE] Carpeta creada en: ${this.storagePath}`);
    }
  }

  async loginWithQR(userId: number): Promise<void> {
    const store = await this.storesRepository.findOne({
      where: { owner: { id: userId } },
    });

    if (!store) throw new NotFoundException('La tienda no fue encontrada');

    const cookiesFilePath = path.join(
      this.storagePath,
      `tiktok-cookies-${store.name}.json`,
    );

    console.log(`🔐 Iniciando login por QR para la tienda: ${store.name}`);

    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
    );

    await page.goto('https://www.tiktok.com/login/qrcode', {
      waitUntil: 'networkidle2',
    });

    console.log('[QR] Escanea el código con tu celular para iniciar sesión.');
    console.log('[⏳] Esperando 30 segundos...');
    await new Promise((resolve) => setTimeout(resolve, 30000));

    const cookies = await page.cookies();
    const sessionCookie = cookies.find((c) => c.name === 'sessionid');

    if (!sessionCookie) {
      console.log('❌ No se encontró cookie de sesión. Login fallido.');
      await browser.close();
      throw new Error('El login no se completó. Intenta nuevamente.');
    }

    fs.writeFileSync(cookiesFilePath, JSON.stringify(cookies, null, 2));
    console.log(`✅ Login exitoso. Cookies guardadas en: ${cookiesFilePath}`);
    await browser.close();
  }

  async loadCookies(storeName: string): Promise<any[]> {
    const filePath = path.join(
      this.storagePath,
      `tiktok-cookies-${storeName}.json`,
    );

    if (fs.existsSync(filePath)) {
      console.log(`[COOKIE] Cargando cookies desde: ${filePath}`);
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      console.log(`[❌ COOKIE] No se encontraron cookies para ${storeName}.`);
      throw new HttpException(
        `No se encontraron cookies para la tienda ${storeName}. Inicia sesión primero.`,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  async readDmListOnly(userId: number): Promise<string> {
    const store = await this.storesRepository.findOne({
      where: { owner: { id: userId } },
    });
  
    if (!store) throw new NotFoundException('La tienda no fue encontrada');
  
    const cookies = await this.loadCookies(store.name);
  
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  
    const page = await browser.newPage();
    await page.setCookie(...cookies);
  
    await page.goto('https://www.tiktok.com/business-suite/messages?from=homepage', {
      waitUntil: 'domcontentloaded',
    });
  
    console.log('📥 Página de mensajes cargada, esperando renderizado...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Espera adicional para render
  
    // Intentar múltiples selectores de lista de mensajes
    const possibleSelectors = [
      'div[class*="DivItemWrapper"]',
      'div[id^="more-acton-icon"]',
      'div[tabindex="0"][class*="DivItemWrapper"]',
      'div[class^="css-"][id^="more-acton-icon"]'
    ];
  
    let foundSelector = '';
    for (const selector of possibleSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 8000 });
        foundSelector = selector;
        console.log(`✅ Selector encontrado: ${selector}`);
        break;
      } catch (_) {
        console.warn(`⚠️ No se encontró: ${selector}`);
      }
    }
  
    if (!foundSelector) {
      console.error('❌ No se encontró ningún contenedor válido de mensajes.');
      await browser.close();
      throw new Error('No se pudo acceder a los mensajes.');
    }
  
    const messages = await page.$$eval(foundSelector, (nodes) => {
      return nodes.map((node) => {
        const username = node.querySelector('p[class*="PInfoNickname"]')?.textContent?.trim() || 'sin nombre';
        const message = node.querySelector('span[class*="SpanInfoExtract"]')?.textContent?.trim() || 'sin mensaje';
        return { username, message };
      });
    });
  
    console.log(`📨 Total mensajes encontrados: ${messages.length}`);
    for (const msg of messages) {
      console.log(`🟣 ${msg.username}: ${msg.message}`);
    }
  
    await browser.close();
    return '✅ Lista de mensajes impresa en consola';
  }
  

  async getUserComments(userId: number): Promise<any> {
    const store = await this.storesRepository.findOne({
      where: { owner: { id: userId } },
    });

    if (!store) throw new NotFoundException('La tienda no fue encontrada');

    const cookies = await this.loadCookies(store.name);
    const videos = await this.getVideos(store.name);
    const commentsByVideo: Record<string, any[]> = {};

    console.log(`🎯 Procesando comentarios para: ${store.name}`);
    console.log('videoUrls ', videos);

    for (const videoUrl of videos) {
      if (!videoUrl.includes(`@${store.name}`)) {
        console.warn(
          `⚠️ Saltando video que no pertenece a ${store.name}: ${videoUrl}`,
        );
        continue;
      }

      const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox'],
      });

      const page = await browser.newPage();
      await page.setCookie(...cookies);

      try {
        console.log(`[PROCESSING] Comentarios de: ${videoUrl}`);
        await page.goto(videoUrl, { waitUntil: 'networkidle2' });

        // 🖱️ Clic en botón de comentarios (si está disponible)
        try {
          const commentIcon = await page.$('span[data-e2e="comment-icon"]');
          if (commentIcon) {
            await commentIcon.click();
            console.log('🖱️ Sección de comentarios abierta con éxito');
            await new Promise((resolve) => setTimeout(resolve, 1500));
          } else {
            console.warn('⚠️ Botón de comentarios no encontrado');
          }
        } catch (err) {
          console.error(
            `⚠️ Error al hacer clic en el ícono de comentarios: ${err}`,
          );
        }

        // Forzar carga de comentarios con scroll
        for (let i = 0; i < 8; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        // Buscar contenedor de comentarios usando múltiples posibles selectores
        const possibleSelectors = [
          'div[class*="CommentListContainer"]',
          'div[data-e2e="comment-list"]',
          'div[class*="DivCommentListContainer"]',
        ];

        let foundSelector = '';
        for (const selector of possibleSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 8000 });
            foundSelector = selector;
            break;
          } catch (_) {
            continue;
          }
        }

        if (!foundSelector) {
          console.warn(`❌ Comentarios no encontrados en: ${videoUrl}`);
          continue;
        }

        // Extraer comentarios visibles
        const comments = await page.evaluate(() => {
          const blocks = document.querySelectorAll(
            'div[class*="DivCommentContentWrapper"]',
          );
          return Array.from(blocks)
            .map((block) => {
              const userAnchor = block.querySelector('a[href^="/@"]');
              const username =
                userAnchor?.getAttribute('href')?.replace('/@', '') ??
                'desconocido';
              const userText =
                userAnchor?.textContent?.trim() ?? 'Usuario desconocido';
              const text =
                block
                  .querySelector('span[data-e2e="comment-level-1"] p')
                  ?.textContent?.trim() ?? '';
              return { username, user: userText, text };
            })
            .filter((c) => c.text);
        });

        commentsByVideo[videoUrl] = comments;
        console.log(`✅ ${comments.length} comentarios de: ${videoUrl}`);
      } catch (error) {
        console.error(`[ERROR] Fallo en video ${videoUrl}: ${error.message}`);
      } finally {
        await browser.close();
      }
    }

    return commentsByVideo;
  }

  async getVideos(name: string): Promise<string[]> {
    const cookies = await this.loadCookies(name);

    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox'],
    });

    const page = await browser.newPage();
    await page.setCookie(...cookies);

    const profileUrl = `https://www.tiktok.com/@${name}`;
    console.log(`📱 Cargando perfil de: ${name}`);
    await page.goto(profileUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector('a[href*="/video/"]', { timeout: 15000 });

    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const videoUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/video/"]'))
        .map((link) => link.getAttribute('href'))
        .filter(
          (href) => href && href.includes('@') && href.includes('/video/'),
        )
        .map((href) =>
          href!.startsWith('http') ? href! : `https://www.tiktok.com${href}`,
        )
        .slice(0, 10);
    });

    console.log('videoUrls ', videoUrls);

    await browser.close();
    console.log(`🎥 Videos extraídos: ${videoUrls.length}`);
    return videoUrls;
  }
}
