import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { City } from 'src/entity/city.entity';
import { Country } from 'src/entity/country.entity';
import { Department } from 'src/entity/departament.entity';

@Module({
  imports: [TypeOrmModule.forFeature([City, Country, Department])],
  providers: [LocationService],
  controllers: [LocationController],
})
export class LocationModule {}
