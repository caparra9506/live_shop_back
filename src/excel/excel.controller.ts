import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ExcelService } from './excel.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('excel')
export class ExcelController {
    constructor(private readonly excelService: ExcelService) {}
  
    @Post('import')
    @UseInterceptors(FileInterceptor('file')) // Interceptor para manejar archivos
    async importCities(
      @UploadedFile() file: Express.Multer.File,
      @Body('country') countryName: string, // Captura el país
      @Body('sheet') sheetName: string, // Captura el nombre de la hoja
    ) {
      if (!file) {
        return { message: 'No se subió ningún archivo' };
      }
  
      await this.excelService.importCitiesFromExcel(file, countryName, sheetName);
      return { message: 'Ciudades importadas exitosamente' };
    }
    
}
