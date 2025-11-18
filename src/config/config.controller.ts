import { Body, Controller, Get, Param, Post, Put, UseGuards, Request } from "@nestjs/common";
import { StoreConfigService } from "./config.service";
import { JwtAuthGuard } from "src/auth/guards/jwt.guard";
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// store-config.controller.ts
@Controller('store-config')
export class StoreConfigController {
  constructor(
    private readonly configService: StoreConfigService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  @UseGuards(JwtAuthGuard) 
  @Get()
  getConfig(@Request() req) {
    return this.configService.getByStore(req.user.id);
  }

  @UseGuards(JwtAuthGuard) 
  @Post()
  updateConfig(
    @Request() req,
    @Body() body: { 
      email: string, 
      epaycoPublicKey?: string; 
      epaycoPrivateKey?: string;
      testMode?: string | boolean;
      cartTimeoutDays?: number;
      cartEnabled?: boolean;
    },
  ) {
    return this.configService.update(req.user.id, body);
  }

  @Get('public/:storeName')
  getPublicConfig(@Param('storeName') storeName: string) {
    return this.configService.getPublicConfig(storeName);
  }

  @UseGuards(JwtAuthGuard)
  @Get('chatwoot-url')
  getChatwootUrl() {
    return {
      chatwootUrl: process.env.CHATWOOT_URL || 'https://n8n-chatwoot.shblkb.easypanel.host/app/accounts/1/dashboard'
    };
  }

  @UseGuards(JwtAuthGuard)
  @Put()
  updateFullConfig(
    @Request() req,
    @Body() body: any,
  ) {
    return this.configService.updateFullConfig(req.user.id, body);
  }

  @Post('migrate-electronic-billing')
  async migrateElectronicBilling() {
    try {
      // Add columns one by one to avoid MySQL syntax issues
      const queries = [
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS enableElectronicBilling BOOLEAN DEFAULT FALSE',
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS factusClientId VARCHAR(255) NULL',
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS factusClientSecret VARCHAR(255) NULL',
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS factusUsername VARCHAR(255) NULL',
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS factusPassword VARCHAR(255) NULL',
        "ALTER TABLE store_config ADD COLUMN IF NOT EXISTS factusApiUrl VARCHAR(255) DEFAULT 'https://api-sandbox.factus.com.co'",
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS factusTestMode BOOLEAN DEFAULT TRUE',
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS factusNumberingRangeId INT NULL'
      ];

      for (const query of queries) {
        try {
          await this.dataSource.query(query);
        } catch (err) {
          // Ignore "column already exists" errors
          if (!err.message.includes('Duplicate column name')) {
            throw err;
          }
        }
      }

      return {
        success: true,
        message: 'Migración de facturación electrónica completada exitosamente'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error en la migración',
        error: error.message
      };
    }
  }

  @Post('migrate-99envios-shipping')
  async migrate99EnviosShipping() {
    try {
      // Add columns for 99 Envíos shipping configuration
      const queries = [
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS enableSeguro99 BOOLEAN DEFAULT FALSE',
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS enableSeguro99Plus BOOLEAN DEFAULT FALSE',
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS enableContrapago BOOLEAN DEFAULT FALSE',
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS enableFreeShipping BOOLEAN DEFAULT FALSE',
        'ALTER TABLE store_config ADD COLUMN IF NOT EXISTS shippingOriginCode VARCHAR(255) NULL'
      ];

      for (const query of queries) {
        try {
          await this.dataSource.query(query);
        } catch (err) {
          // Ignore "column already exists" errors
          if (!err.message.includes('Duplicate column name')) {
            throw err;
          }
        }
      }

      return {
        success: true,
        message: '🚚 Migración de configuración 99 Envíos completada exitosamente'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error en la migración',
        error: error.message
      };
    }
  }
}
