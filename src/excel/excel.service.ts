import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { City } from 'src/entity/city.entity';
import { Country } from 'src/entity/country.entity';
import { Repository } from 'typeorm';

import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import { Department } from 'src/entity/departament.entity';

@Injectable()
export class ExcelService {
  constructor(
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  async importCitiesFromExcel(
    file: Express.Multer.File,
    countryName: string,
    sheetName: string,
  ): Promise<void> {
    // Definir la ruta de almacenamiento
    const uploadDir = path.join(__dirname, '../../uploads');

    // Verificar si la carpeta existe, si no, crearla
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Guardar el archivo en la carpeta uploads
    const filePath = path.join(uploadDir, file.originalname);
    fs.writeFileSync(filePath, file.buffer);

    // Buscar o crear el país
    let country = await this.countryRepository.findOne({
      where: { name: countryName },
    });

    if (!country) {
      country = this.countryRepository.create({ name: countryName });
      country = await this.countryRepository.save(country);
      console.log(`País "${countryName}" creado con ID: ${country.id}`);
    }

    // Leer el archivo Excel
    const workbook = xlsx.readFile(filePath);

    // Verificar si la hoja especificada existe
    if (!workbook.SheetNames.includes(sheetName)) {
      throw new Error(`La hoja "${sheetName}" no existe en el archivo.`);
    }
    const sheet = workbook.Sheets[sheetName];

    // Convertir datos de Excel a JSON correctamente
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Remover la primera fila si contiene encabezados
    rawData.shift();

    console.log('Datos del Excel procesados:', rawData);

    // Iterar sobre los datos y guardarlos en la BD
    for (const row of rawData) {
      const fullCityName = row[0]?.toString().trim(); // Columna A
      const cityCode = row[1]?.toString().trim(); // Columna B

      if (!fullCityName || !cityCode) continue; // Omitir filas vacías

      // Separar ciudad y departamento
      const [cityName, departmentName] = fullCityName.split('/').map((s) => s.trim());

      if (!cityName || !departmentName) {
        console.warn(`Formato incorrecto en fila: ${fullCityName}`);
        continue;
      }

      // Buscar o crear el departamento
      let department = await this.departmentRepository.findOne({
        where: { name: departmentName },
      });

      if (!department) {
        department = this.departmentRepository.create({ name: departmentName, country });
        department = await this.departmentRepository.save(department);
        console.log(`Departamento "${departmentName}" creado con ID: ${department.id}`);
      }

      // Verificar si la ciudad ya existe
      const existingCity = await this.cityRepository.findOne({
        where: { code: cityCode },
      });

      if (!existingCity) {
        const city = this.cityRepository.create({
          name: cityName,
          code: cityCode,
          department: department, // Relacionar con el departamento
        });

        await this.cityRepository.save(city);
      }
    }

    // Eliminar el archivo después de procesarlo
    fs.unlinkSync(filePath);

    console.log('Importación de ciudades completada.');
  }

  
}
