import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { Store } from 'src/entity/store.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { City } from 'src/entity/city.entity';
import { User } from 'src/entity/user.entity';
import { Cipher } from 'src/utils/cipher';
import { minioClient } from '../config/minio.config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private storesRepository: Repository<Store>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cipher: Cipher,
  ) {}

  async uploadImageStore(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
  
    // Validaciones
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido. Solo se permiten imágenes.');
    }
  
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('El archivo es demasiado grande. Máximo 5MB.');
    }
  
    try {
      const bucketName = 'storage';
      const fileExtension = file.originalname.split('.').pop() || 'jpg';
      const fileName = `${uuidv4()}.${fileExtension}`;
      
      // Asegurar que el bucket existe y es público
      await this.ensurePublicBucket(bucketName);
  
      // Subir archivo
      await minioClient().putObject(
        bucketName,
        fileName,
        file.buffer,
        file.size,
        {
          'Content-Type': file.mimetype,
        }
      );
  
      // Generar URL pública
      const url = this.getPublicUrl(bucketName, fileName);
  
      console.log('✅ Imagen subida exitosamente:', url);
      return { url, fileName };
      
    } catch (error) {
      console.error('❌ Error al subir la imagen:', error);
      throw new InternalServerErrorException('No se pudo subir la imagen');
    }
  }
  
  // Función para asegurar que el bucket existe y es público
  private async ensurePublicBucket(bucketName: string) {
    const bucketExists = await minioClient().bucketExists(bucketName);
    
    if (!bucketExists) {
      await minioClient().makeBucket(bucketName, 'us-east-1');
      console.log(`Bucket '${bucketName}' creado`);
    }
  
    // Aplicar política pública
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`]
        }
      ]
    };
  
    await minioClient().setBucketPolicy(bucketName, JSON.stringify(policy));
  }
  
  // Función para generar URL pública
  private getPublicUrl(bucketName: string, fileName: string): string {
    // URL directa al objeto en MinIO
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const protocol = useSSL ? 'https' : 'http';
    const minioHost = process.env.MINIO_ENDPOINT;
    
    return `${protocol}://${minioHost}/${bucketName}/${fileName}`;
  }
  
  // Función para eliminar imagen
  async deleteImageProduct(fileName: string) {
    try {
      const bucketName = 'product-images';
      await minioClient().removeObject(bucketName, fileName);
      console.log('✅ Imagen eliminada:', fileName);
      return { success: true };
    } catch (error) {
      console.error('❌ Error al eliminar imagen:', error);
      throw new InternalServerErrorException('No se pudo eliminar la imagen');
    }
  }

  /*
  async uploadImageStore(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    try {
      const instance = process.env.ULTRAMSG_INSTANCE;
      const token = process.env.ULTRAMSG_TOKEN;

      // Convertir el archivo a Base64
      const base64String = file.buffer.toString('base64');

      // ✅ Consumir el endpoint de UltraMSG
      const response = await axios.post(
        `https://api.ultramsg.com/${instance}/media/upload`,
        new URLSearchParams({
          token: token,
          file: base64String,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      return { url: response.data.success };
    } catch (error) {
      console.error('Error al subir la imagen:', error);
      throw new InternalServerErrorException('No se pudo subir la imagen');
    }
  }*/

  async createStore(
    createStoreDto: CreateStoreDto,
    ownerId: string,
  ): Promise<Store> {
    console.log('📌 Recibido DTO:', createStoreDto);

    const bandera: string = String(process.env.SHIPPING_TEST);

    const user = await this.userRepository.findOne({
      where: { id: Number(ownerId) },
    });

    if (!user) {
      throw new HttpException(
        'El user no existe.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 1️⃣ Buscar la ciudad por ID
    const city = await this.cityRepository.findOne({
      where: { id: Number(createStoreDto.cityId) },
    });

    if (!city) {
      throw new HttpException(
        'La ciudad seleccionada no existe.',
        HttpStatus.BAD_REQUEST,
      );
    }

    console.log('🏙️ Ciudad encontrada:', city);

    const newPassword = await this.cipher.decryptCifrado(user.password);

    console.log('bandera ', bandera);

    let email;
    if (bandera === 'true'){
      email = process.env.EMAIL_PRUEBA
    } else {
      email = user.email;
    }

    // 2️⃣ Preparar los datos para el proveedor 99envíos
    const providerData = {
      nombre_apellidos: user.name,
      tipo_identificacion: createStoreDto.documentType, // Tipo de identificación
      num_identificacion: createStoreDto.document,
      direccion: createStoreDto.address,
      pais: '1', // Ajustar si el proveedor requiere otro formato
      ciudad_id: city.code, // ID de la ciudad
      telefono: createStoreDto.phone,
      correo: email,
      contrasena: newPassword, // Puedes generar una aleatoria si lo prefieres
      nombre_sucursal: createStoreDto.name,
      terminos_condiciones: 1,
    };

    console.log('📦 Enviando datos a 99envíos:', providerData);

    try {
      // 3️⃣ Hacer la petición a 99envíos usando HttpService de NestJS
      const response = await axios.post(
        'https://api.99envios.app/api/online/sucursal',
        providerData,
      );

      console.log('✅ Respuesta de 99envíos:', response);
    } catch (error) {
      console.error(
        '❌ Error al registrar la tienda en 99envíos:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        'No se pudo registrar la tienda en 99envíos.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 4️⃣ Guardar la tienda en nuestra base de datos SOLO si el proveedor responde correctamente
    const newStore = this.storesRepository.create({
      ...createStoreDto,
      city,
      owner: { id: ownerId } as any,
    });

    const savedStore = await this.storesRepository.save(newStore);
    console.log('🛍️ Tienda guardada en BD:', savedStore);

    return this.storesRepository.save(newStore); // Devolver la tienda creada
  }

  async findAllStores(): Promise<Store[]> {
    return await this.storesRepository.find();
  }

  async getStoreWithProducts(storeName: string) {
    const storeData = await this.storesRepository.findOne({
      where: { name: storeName },
      relations: ['categories', 'categories.products'], // Aseguramos cargar productos dentro de categorías
    });

    if (!storeData) {
      throw new NotFoundException(`La tienda "${storeName}" no fue encontrada`);
    }

    return storeData;
  }

  async findByOwner(ownerId: number): Promise<Store | null> {
    return this.storesRepository.findOne({
      where: { owner: { id: ownerId } }, // Buscar por el ID del dueño
      relations: ['owner'], // Incluir información del usuario
    });
  }

  async findStoreById(id: number): Promise<Store> {
    const store = await this.storesRepository.findOne({ where: { id } });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async findStoreByName(name: string): Promise<Store> {
    const store = await this.storesRepository.findOne({ where: { name } });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async updateStore(
    id: number,
    updateStoreDto: UpdateStoreDto,
  ): Promise<Store> {
    await this.storesRepository.update(id, updateStoreDto);
    const updatedStore = await this.findStoreById(id);
    return updatedStore;
  }

  async deleteStore(id: number): Promise<void> {
    const result = await this.storesRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('Store not found');
  }
}
