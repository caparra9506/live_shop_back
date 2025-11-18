import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entity/product.entity';
import { Category } from '../entity/category.entity';
import { Store } from 'src/entity/store.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { Size } from 'src/entity/size.entity';
import { Color } from 'src/entity/color.entity';
import { ProductVariant } from 'src/entity/product-variant.entity';
import { colorMapEs } from './color';
import { minioClient } from '../config/minio.config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Size)
    private readonly sizeRepository: Repository<Size>,
    @InjectRepository(Color)
    private readonly colorRepository: Repository<Color>,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepository: Repository<ProductVariant>,
  ) {}

  async getProductByStoreAndCode(
    storeName: string,
    productCode: string,
  ): Promise<Product> {
    const product = await this.productRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.category', 'category')
      .innerJoinAndSelect('category.store', 'store')
      .leftJoinAndSelect('product.variants', 'variant')
      .leftJoinAndSelect('variant.color', 'color')
      .leftJoinAndSelect('variant.size', 'size')
      .where('store.name = :storeName', { storeName })
      .andWhere('product.id = :productId', { productId: parseInt(productCode) })
      .getOne();

    if (!product) throw new NotFoundException('El producto no fue encontrado');

    // 🔧 Aplicar el mismo filtro de variantes
    if (product.variants) {
      const colorOnlyVariants = product.variants.filter(v => v.color && !v.size);
      const sizeOnlyVariants = product.variants.filter(v => !v.color && v.size);
      const fullVariants = product.variants.filter(v => v.color && v.size);

      if (fullVariants.length > 0) {
        product.variants = fullVariants;
      }
      else if (colorOnlyVariants.length > 0) {
        product.variants = colorOnlyVariants.map(v => ({
          ...v,
          size: { id: 0, name: 'Único' } as any
        }));
      }
      else if (sizeOnlyVariants.length > 0) {
        product.variants = sizeOnlyVariants.map(v => ({
          ...v,
          color: { id: 0, name: 'Único', hexCode: '#000000' } as any
        }));
      }
      else {
        product.variants = [{
          id: 0,
          color: { id: 0, name: 'Único', hexCode: '#000000' } as any,
          size: { id: 0, name: 'Único' } as any
        } as any];
      }
    }

    return product;
  }

  /**
   * 🔍 Obtiene un producto por ID con todas sus variantes
   */
  async getProductById(productId: number): Promise<Product> {
    const product = await this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.store', 'store')
      .leftJoinAndSelect('product.variants', 'variant')
      .leftJoinAndSelect('variant.color', 'color')
      .leftJoinAndSelect('variant.size', 'size')
      .where('product.id = :productId', { productId })
      .getOne();

    if (!product) {
      throw new NotFoundException(`Producto con ID ${productId} no encontrado`);
    }

    // 🔧 Filtrar variantes para evitar nulls en el frontend
    if (product.variants) {
      // Separar variantes en categorías
      const colorOnlyVariants = product.variants.filter(v => v.color && !v.size);
      const sizeOnlyVariants = product.variants.filter(v => !v.color && v.size);
      const fullVariants = product.variants.filter(v => v.color && v.size);

      // Si hay variantes completas (color + size), usar solo esas
      if (fullVariants.length > 0) {
        product.variants = fullVariants;
      }
      // Si no, usar las variantes que existan (colores o tallas)
      else if (colorOnlyVariants.length > 0) {
        // Para variantes solo con color, agregar un size mock
        product.variants = colorOnlyVariants.map(v => ({
          ...v,
          size: { id: 0, name: 'Único' } as any
        }));
      }
      else if (sizeOnlyVariants.length > 0) {
        // Para variantes solo con size, agregar un color mock
        product.variants = sizeOnlyVariants.map(v => ({
          ...v,
          color: { id: 0, name: 'Único', hexCode: '#000000' } as any
        }));
      }
      // Si no hay variantes válidas, crear una básica
      else {
        product.variants = [{
          id: 0,
          color: { id: 0, name: 'Único', hexCode: '#000000' } as any,
          size: { id: 0, name: 'Único' } as any
        } as any];
      }
    }

    return product;
  }

  async getProductVariants(productId: number, color?: string, size?: string): Promise<ProductVariant[]> {
    const query = this.productVariantRepository
      .createQueryBuilder('variant')
      .leftJoinAndSelect('variant.color', 'color')
      .leftJoinAndSelect('variant.size', 'size')
      .leftJoinAndSelect('variant.product', 'product')
      .where('variant.product.id = :productId', { productId });

    if (color) {
      query.andWhere('LOWER(color.name) = LOWER(:color)', { color });
    }

    if (size) {
      query.andWhere('LOWER(size.name) = LOWER(:size)', { size });
    }

    return await query.getMany();
  }

  async findProductsByCategory(categoryId: number): Promise<Product[]> {
    return await this.productRepository.find({
      where: { category: { id: categoryId } },
    });
  }

  async getProductsByStore(userId: number, filters?: {
    page: number;
    limit: number;
    search: string;
    category: string;
    inStock: boolean;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const skip = (page - 1) * limit;

    // Buscar tienda del usuario
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['owner']
    });

    if (!store) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    // Buscar categorías de la tienda
    const categories = await this.categoryRepository.find({
      where: { store: { id: store.id } }
    });

    if (categories.length === 0) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    const categoryIds = categories.map(c => c.id);

    // Query de productos con filtros
    let query = this.productRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.color', 'color')
      .leftJoinAndSelect('variants.size', 'size')
      .where('category.id IN (:...categoryIds)', { categoryIds });

    // Aplicar filtros
    if (filters?.search) {
      query = query.andWhere(
        '(product.name LIKE :search OR product.description LIKE :search OR product.code LIKE :search OR category.name LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters?.category) {
      query = query.andWhere('category.id = :categoryId', { categoryId: filters.category });
    }

    if (filters?.inStock !== undefined) {
      if (filters.inStock) {
        query = query.andWhere('product.stock > 0');
      } else {
        query = query.andWhere('product.stock = 0');
      }
    }

    // Obtener resultados con paginación
    const total = await query.getCount();
    const products = await query
      .orderBy('product.id', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    return {
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  // Crear un nuevo producto en la tienda del usuario autenticado
  async createProduct(userId: number, dto: CreateProductDto) {
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['categories', 'owner'],
    });

    if (!store) throw new NotFoundException('La tienda no fue encontrada');

    const category = await this.categoryRepository.findOne({
      where: { id: dto.categoryId, store: { id: store.id } },
    });

    if (!category)
      throw new NotFoundException('La categoría no fue encontrada');

    // 1️⃣ Guardar o recuperar los colores existentes
    const savedColors = await Promise.all(
      (dto.colors || []).map(async (color) => {
        color.hexCode = this.getHexBySpanishName(color.name);

        console.log('hexadecimal ', color.hexCode);
        
        let existingColor = await this.colorRepository.findOne({
          where: { name: color.name, hexCode: color.hexCode },
        });
        if (!existingColor) {
          existingColor = this.colorRepository.create(color);
          await this.colorRepository.save(existingColor);
        }
        return existingColor;
      }),
    );

    // 2️⃣ Guardar o recuperar las tallas existentes
    const savedSizes = await Promise.all(
      (dto.sizes || []).map(async (size) => {
        let existingSize = await this.sizeRepository.findOne({
          where: { name: size.name },
        });
        if (!existingSize) {
          existingSize = this.sizeRepository.create(size);
          await this.sizeRepository.save(existingSize);
        }
        return existingSize;
      }),
    );

    // 3️⃣ Guardar el producto
    const product = this.productRepository.create({
      name: dto.name,
      description: dto.description,
      price: dto.price,
      imageUrl: dto.imageUrl,
      category: category,
      code: dto.code,
      inStock: dto.inStock,
      weight: dto.weight || null,
      length: dto.length || null,
      width: dto.width || null,
      height: dto.height || null,
      stock: dto.countStock,
    });

    const savedProduct = await this.productRepository.save(product);

    // 4️⃣ Crear variantes según lo que esté disponible
    console.log('📦 Creando variantes para producto:', savedProduct.id);
    console.log('🎨 Colores disponibles:', savedColors.map(c => c.name));
    console.log('📏 Tallas disponibles:', savedSizes.map(s => s.name));
    
    if (savedColors.length > 0 && savedSizes.length > 0) {
      // Caso 1: Hay colores Y tallas - crear todas las combinaciones
      console.log('🔄 Creando combinaciones: color + talla');
      for (const color of savedColors) {
        for (const size of savedSizes) {
          const variant = this.productVariantRepository.create({
            product: savedProduct,
            color: color,
            size: size,
          });
          await this.productVariantRepository.save(variant);
          console.log(`✅ Variante creada: ${color.name} + ${size.name}`);
        }
      }
    } else if (savedColors.length > 0 && savedSizes.length === 0) {
      // Caso 2: Solo hay colores, sin tallas - crear variante por cada color
      console.log('🎨 Creando variantes solo por color (sin tallas)');
      for (const color of savedColors) {
        const variant = this.productVariantRepository.create({
          product: savedProduct,
          color: color,
          size: null, // Sin talla
        });
        await this.productVariantRepository.save(variant);
        console.log(`✅ Variante creada: ${color.name} (sin talla)`);
      }
    } else if (savedColors.length === 0 && savedSizes.length > 0) {
      // Caso 3: Solo hay tallas, sin colores - crear variante por cada talla
      console.log('📏 Creando variantes solo por talla (sin colores)');
      for (const size of savedSizes) {
        const variant = this.productVariantRepository.create({
          product: savedProduct,
          color: null, // Sin color
          size: size,
        });
        await this.productVariantRepository.save(variant);
        console.log(`✅ Variante creada: ${size.name} (sin color)`);
      }
    } else {
      // Caso 4: No hay colores ni tallas - crear variante básica
      console.log('🔍 No hay colores ni tallas - creando variante básica');
      const variant = this.productVariantRepository.create({
        product: savedProduct,
        color: null,
        size: null,
      });
      await this.productVariantRepository.save(variant);
      console.log('✅ Variante básica creada (sin color ni talla)');
    }
    
    console.log(`🎯 Total variantes creadas para producto ${savedProduct.id}`)

    return savedProduct;
  }

  /*
  async uploadImageProduct(file: Express.Multer.File) {
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

    async uploadImageProduct(file: Express.Multer.File) {
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


  getHexBySpanishName(name: string): string {
    // Normalizamos a minúsculas para evitar problemas con mayúsculas
    const lowerName = name.toLowerCase();

    // Verificamos si existe en el diccionario
    if (colorMapEs[lowerName]) {
      return colorMapEs[lowerName];
    }

    // Si no existe, lanzamos un error
    throw new HttpException(
      `El color "${name}" no está en el diccionario.`,
      HttpStatus.NOT_FOUND
    );
  }

  async getCategoriesByStore(userId: number) {
    console.log('🔍 Buscando categorías para userId:', userId);
    
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['categories', 'owner'],
    });

    console.log('🔍 Store encontrado:', store ? `ID: ${store.id}` : 'No encontrado');
    
    if (!store) throw new NotFoundException('La tienda no fue encontrada');
    
    console.log('🔍 Categorías encontradas:', store.categories?.length || 0);
    console.log('🔍 Categorías data:', store.categories);
    
    return store.categories;
  }

  async getPorductsByNameStore(nameStore: string) {
    return this.productRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.category', 'category')
      .innerJoinAndSelect('category.store', 'store')
      .leftJoinAndSelect('product.variants', 'product_variant')
      .leftJoinAndSelect('product_variant.color', 'color')
      .leftJoinAndSelect('product_variant.size', 'size')
      .where('store.name = :nameStore', { nameStore })
      .andWhere('product.inStock = :inStock', { inStock: true })  // ✅ Only show in-stock products
      .getMany();
  }

  async getAllProductsByStore(userId: number) {
    // Buscar tienda del usuario
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['owner']
    });

    if (!store) {
      return [];
    }

    // Buscar categorías de la tienda
    const categories = await this.categoryRepository.find({
      where: { store: { id: store.id } }
    });

    if (categories.length === 0) {
      return [];
    }

    const categoryIds = categories.map(c => c.id);

    // Query de productos sin paginación
    const products = await this.productRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.color', 'color')
      .leftJoinAndSelect('variants.size', 'size')
      .where('category.id IN (:...categoryIds)', { categoryIds })
      .orderBy('product.id', 'DESC')
      .getMany();

    return products;
  }
  
}
