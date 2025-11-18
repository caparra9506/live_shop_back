import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { City } from 'src/entity/city.entity';
import { Country } from 'src/entity/country.entity';
import { Department } from 'src/entity/departament.entity';
import { Repository } from 'typeorm';


@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
  ) {}

  getCountries() {
    return this.countryRepository.find();
  }

  async getDepartments(countryId: number) {

    const country = await this.countryRepository.find({ where: { id: countryId } })

    return this.departmentRepository.find({ where: { country } });
  }

  async getCities(departmentId: number) {

    const department = await this.departmentRepository.find({ where: { id: departmentId } })

    return this.cityRepository.find({ where: { department } });
  }
  
}
