import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Coupon } from '../entity/coupon.entity';
import { Store } from '../entity/store.entity';
import { Product } from '../entity/product.entity';
import { Category } from '../entity/category.entity';
import { CouponUsage } from '../entity/coupon-usage.entity';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { Sale } from 'src/entity/sale.entity';
import { TikTokUser } from 'src/entity/user-tiktok.entity';

@Injectable()
export class CouponService {
  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,

    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,

    @InjectRepository(CouponUsage)
    private readonly couponUsageRepository: Repository<CouponUsage>,

    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,

    @InjectRepository(TikTokUser)
    private readonly tikTokUserRepository: Repository<TikTokUser>,
  ) {}

  async createCoupon(
    userId: number,
    createCouponDto: CreateCouponDto,
  ): Promise<Coupon> {
    const {
      code,
      discountValue,
      discountType,
      expirationDate,
      categoryIds,
      productIds,
    } = createCouponDto;

    // Verificar si la tienda pertenece al usuario autenticado
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
    });

    if (!store)
      throw new ForbiddenException(
        'No tienes permisos para gestionar esta tienda',
      );

    if (discountType !== 'PERCENTAGE' && discountType !== 'FIXED') {
      throw new BadRequestException(
        'El tipo de descuento debe ser PERCENTAGE o FIXED',
      );
    }

    const coupon = this.couponRepository.create({
      code,
      discountValue,
      discountType,
      expirationDate,
      store,
      isActive: true,
    });

    if (categoryIds?.length) {
      const categories = await this.categoryRepository.find({
        where: { id: In(categoryIds) }, // 🔹 Usamos `In` en lugar de `findByIds`
      });
      coupon.categories = categories;
    }

    if (productIds?.length) {
      const products = await this.productRepository.find({
        where: { id: In(productIds) }, // 🔹 Usamos `In` aquí también
      });
      coupon.products = products;
    }

    return this.couponRepository.save(coupon);
  }

  async validateCoupon(
    code: string,
    storeId: number,
    userTikTokId: number,
    productId: number,
  ) {
    console.log('🎟 Validando cupón:', code, 'para usuario:', userTikTokId);

    const coupon = await this.couponRepository.findOne({
      where: { code, store: { id: storeId }, isActive: true },
      relations: ['categories', 'products'],
    });

    if (!coupon) {
      throw new NotFoundException('Cupón no válido o expirado');
    }

    // Verificar si el cupón ha expirado
    if (new Date(coupon.expirationDate) < new Date()) {
      throw new BadRequestException('El cupón ha expirado');
    }

    // **Verificar si el usuario ya usó el cupón**
    const previousUsage = await this.couponUsageRepository.findOne({
      where: { coupon: { id: coupon.id }, userTikTok: { id: userTikTokId } },
    });

    if (previousUsage) {
      throw new BadRequestException(
        'El cupón ya ha sido usado por este usuario',
      );
    }

    // Si el cupón aplica a toda la tienda
    if (!coupon.categories.length && !coupon.products.length) {
      return {
        valid: true,
        discountValue: coupon.discountValue,
        discountType: coupon.discountType,
        couponId: coupon.id, // Agregar el ID para registrar su uso después
      };
    }

    // Si el cupón aplica a una categoría y el producto pertenece a esa categoría
    if (coupon.categories.length) {
      const product = await this.productRepository.findOne({
        where: { id: productId },
        relations: ['category'],
      });

      if (
        product &&
        coupon.categories.some((cat) => cat.id === product.category.id)
      ) {
        return {
          valid: true,
          discountValue: coupon.discountValue,
          discountType: coupon.discountType,
          couponId: coupon.id,
        };
      }
    }

    // Si el cupón aplica a un producto específico
    if (
      coupon.products.length &&
      coupon.products.some((p) => p.id === productId)
    ) {
      return {
        valid: true,
        discountValue: coupon.discountValue,
        discountType: coupon.discountType,
        couponId: coupon.id,
      };
    }

    throw new BadRequestException('El cupón no aplica a este producto');
  }

  async useCoupon(userIdTikTok: number, couponId: number, saleId: number) {
    const coupon = await this.couponRepository.findOne({
      where: { id: couponId, isActive: true },
    });

    if (!coupon) {
      throw new NotFoundException('Cupón no válido o expirado');
    }

    const sale = await this.saleRepository.findOne({ where: { id: saleId } });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    const userTikTok = await this.tikTokUserRepository.findOne({
      where: { id: userIdTikTok },
    });

    if (!userTikTok) {
      throw new NotFoundException('Usuario de TikTok no encontrado');
    }

    const usage = this.couponUsageRepository.create({
      coupon,
      sale,
      userTikTok,
      usedAt: new Date(),
    });

    return this.couponUsageRepository.save(usage);
  }

  async toggleCouponStatus(couponId: number): Promise<Coupon> {
    const coupon = await this.couponRepository.findOne({
      where: { id: couponId },
    });

    if (!coupon) {
      throw new NotFoundException('Cupón no encontrado');
    }

    coupon.isActive = !coupon.isActive;
    return this.couponRepository.save(coupon);
  }

  async getCouponsByStore(userId: number): Promise<Coupon[]> {
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
    });

    if (!store) throw new NotFoundException('No tienes una tienda asociada');

    const coupons = await this.couponRepository.find({
      where: { store: { id: store.id } },
      relations: ['categories', 'products'], // 🔹 Incluir relaciones
    });

    return coupons;
  }

  async getCouponUsages(couponId: number): Promise<CouponUsage[]> {
    return this.couponUsageRepository.find({
      where: { coupon: { id: couponId } },
    });
  }
}
