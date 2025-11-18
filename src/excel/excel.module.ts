import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { City } from 'src/entity/city.entity';
import { Country } from 'src/entity/country.entity';
import { ExcelService } from './excel.service';
import { ExcelController } from './excel.controller';
import { Department } from 'src/entity/departament.entity';

@Module({
    imports: [TypeOrmModule.forFeature([City, Country, Department])],
    providers: [ExcelService],
    controllers: [ExcelController],
  })
export class ExcelModule {}
