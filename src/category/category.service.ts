import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entity/category.entity';
import { Store } from '../entity/store.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

  async getCategoriesByStore(userId: number): Promise<Category[]> {
    return this.categoryRepository
      .createQueryBuilder('category')
      .innerJoinAndSelect('category.store', 'store')
      .innerJoinAndSelect('store.owner', 'owner')
      .where('owner.id = :userId', { userId })
      .getMany();
  }

  async createCategory(userId: number, name: string) {
    console.log(
      '🚀 Creando categoría para el usuario:',
      userId,
      'Nombre:',
      name,
    );

    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['categories'],
    });

    if (!store) throw new NotFoundException('La tienda no fue encontrada');

    const category = this.categoryRepository.create({
      name: name.trim(),
      store: store,
    });

    console.log('✅ Categoría creada:', category);

    return await this.categoryRepository.save(category);
  }

  async findCategoriesByStoreName(storeName: string): Promise<Category[]> {
    const store = await this.storeRepository.findOne({
      where: { name: storeName },
    });
    if (!store) throw new Error('Tienda no encontrada');

    return await this.categoryRepository.find({
      where: { store: { id: store.id } },
    });
  }
}
