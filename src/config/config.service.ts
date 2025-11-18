import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StoreConfig } from 'src/entity/store-config.entity';
import { Store } from 'src/entity/store.entity';
import { Repository } from 'typeorm';

// store-config.service.ts
@Injectable()
export class StoreConfigService {
  constructor(
    @InjectRepository(StoreConfig)
    private configRepository: Repository<StoreConfig>,
    @InjectRepository(Store)
    private storeRepository: Repository<Store>,
  ) {}

  async getByStore(userId: number) {
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
    });
  
    if (!store) {
      throw new Error("Store not found for user");
    }
  
    return await this.configRepository.findOne({
      where: { store: { id: store.id } },
    });
  }
  

  async update(
    userId: number,
    dto: {
      email?: string;
      epaycoPublicKey?: string;
      epaycoPrivateKey?: string;
      testMode?: string | boolean;
      cartTimeoutDays?: number;
      cartEnabled?: boolean;
    },
  ) {
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
    });

    if (!store) {
      throw new Error("Store not found for user");
    }

    let config = await this.getByStore(userId);
    if (!config) {
      config = this.configRepository.create({ store });
    }

    // Convertir testMode de string a boolean si es necesario
    const updateDto = { ...dto };
    if (typeof dto.testMode === 'string') {
      updateDto.testMode = dto.testMode === 'true';
    }

    Object.assign(config, updateDto);

    return await this.configRepository.save(config);
  }

  async getPublicConfig(storeName: string) {
    const store = await this.storeRepository.findOne({
      where: { name: storeName },
    });

    if (!store) {
      throw new Error("Store not found");
    }

    const config = await this.configRepository.findOne({
      where: { store: { id: store.id } },
    });

    // Solo devolver configuración pública (no keys privadas)
    return {
      cartTimeoutDays: config?.cartTimeoutDays || 2,
      cartEnabled: config?.cartEnabled ?? true,
      testMode: config?.testMode || false,
    };
  }

  async updateFullConfig(userId: number, dto: any) {
    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
    });

    if (!store) {
      throw new Error("Store not found for user");
    }

    let config = await this.getByStore(userId);
    if (!config) {
      config = this.configRepository.create({ store });
    }

    // Convertir testMode y factusTestMode de string a boolean si es necesario
    const updateDto = { ...dto };
    if (typeof dto.testMode === 'string') {
      updateDto.testMode = dto.testMode === 'true';
    }
    if (typeof dto.factusTestMode === 'string') {
      updateDto.factusTestMode = dto.factusTestMode === 'true';
    }
    if (typeof dto.enableElectronicBilling === 'string') {
      updateDto.enableElectronicBilling = dto.enableElectronicBilling === 'true';
    }

    // 🚚 Convertir campos de 99 Envíos de string a boolean si es necesario
    if (typeof dto.enableSeguro99 === 'string') {
      updateDto.enableSeguro99 = dto.enableSeguro99 === 'true';
    }
    if (typeof dto.enableSeguro99Plus === 'string') {
      updateDto.enableSeguro99Plus = dto.enableSeguro99Plus === 'true';
    }
    if (typeof dto.enableContrapago === 'string') {
      updateDto.enableContrapago = dto.enableContrapago === 'true';
    }
    if (typeof dto.enableFreeShipping === 'string') {
      updateDto.enableFreeShipping = dto.enableFreeShipping === 'true';
    }

    // Convertir factusNumberingRangeId: empty string a null, string a number
    if (dto.factusNumberingRangeId !== undefined) {
      if (dto.factusNumberingRangeId === '' || dto.factusNumberingRangeId === null) {
        updateDto.factusNumberingRangeId = null;
      } else if (typeof dto.factusNumberingRangeId === 'string') {
        const numValue = parseInt(dto.factusNumberingRangeId, 10);
        updateDto.factusNumberingRangeId = isNaN(numValue) ? null : numValue;
      }
    }

    Object.assign(config, updateDto);

    return await this.configRepository.save(config);
  }
}
