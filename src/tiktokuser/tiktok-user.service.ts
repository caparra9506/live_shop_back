import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Store } from 'src/entity/store.entity';
import { TikTokUser } from 'src/entity/user-tiktok.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TitokUserService {
  constructor(
    @InjectRepository(TikTokUser)
    private readonly registeredUsersRepository: Repository<TikTokUser>,

    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

  async registerUser(storeName :string, userData: Partial<TikTokUser>): Promise<TikTokUser> {
    // Verificamos si ya existe
    /*let existingUser = await this.registeredUsersRepository.findOne({
      where: { tiktok: userData.tiktok },
    });
  
    if (existingUser) {
      return existingUser; // Si ya está registrado, lo devolvemos
    }*/
  
    // Buscar el storeId basado en el nombre de la tienda
    const store = await this.storeRepository.findOne({ where: { name: storeName } });
  
    if (!store) {
      throw new Error("La tienda no existe");
    }

    console.log('store ', store);

    userData.store = store;

    console.log('userData ', userData);
  
    const user = this.registeredUsersRepository.create({
      ...userData,
    });

    
  
    return await this.registeredUsersRepository.save(user);
  }

  async findByTikTok(tiktok: string): Promise<TikTokUser | null> {
    return await this.registeredUsersRepository.findOne({ where: { tiktok } });
  }

  async findById(userId: number): Promise<TikTokUser | null> {
    return await this.registeredUsersRepository.findOne({ where: { id: userId } });
  }
}
