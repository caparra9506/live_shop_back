import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Delete,
  Param,
  Get,
  Put,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

    @UseGuards(JwtAuthGuard)
    @Post('file')
    @UseInterceptors(FileInterceptor('file'))
    async uploadImageStore(@UploadedFile() file: Express.Multer.File) {
      return this.storesService.uploadImageStore(file);
    }

  @UseGuards(JwtAuthGuard) // 🔹 Usa el guardián directamente
  @Post('create')
  create(@Body() createStoreDto: CreateStoreDto, @Request() req) {
    return this.storesService.createStore(createStoreDto, req.user.id);
  }

  @UseGuards(JwtAuthGuard) 
  @Get('me')
  async getMyStore(@Request() req) {
    return this.storesService.findByOwner(req.user.id);
  }

  @Get()
  findAll() {
    return this.storesService.findAllStores();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.storesService.findStoreById(id);
  }

  @Get('name/:name')
  findOneByName(@Param('name') name: string) {
    return this.storesService.findStoreByName(name);
  }

  @Get('store/:store')
  async getStoreWithProducts(@Param('store') store: string) {
    return this.storesService.getStoreWithProducts(store);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  update(@Param('id') id: number, @Body() updateStoreDto: UpdateStoreDto) {
    return this.storesService.updateStore(id, updateStoreDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.storesService.deleteStore(id);
  }
}
