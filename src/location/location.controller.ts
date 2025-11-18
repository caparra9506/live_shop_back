import { Controller, Get, Param } from '@nestjs/common';
import { LocationService } from './location.service';

@Controller('location')
export class LocationController {

    constructor(private readonly locationService: LocationService) {}

    @Get('countries')
    getCountries() {
      return this.locationService.getCountries();
    }
  
    @Get('departments/:countryId')
    getDepartments(@Param('countryId') countryId: number) {
      return this.locationService.getDepartments(countryId);
    }
  
    @Get('cities/:departmentId')
    getCities(@Param('departmentId') departmentId: number) {
      return this.locationService.getCities(departmentId);
    }

}
