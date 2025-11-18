import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Get,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyCategories(@Request() req) {
    return this.categoryService.getCategoriesByStore(req.user.id); // Pasamos el userId
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createCategory(@Request() req, @Body() body) {
    const userId = req.user.id;
    return this.categoryService.createCategory(userId, body.name);
  }

  // 📌 NUEVO: Obtener categorías por el nombre de la tienda (PÚBLICO)
  @Get('/store/:storeName')
  findByStoreName(@Param('storeName') storeName: string) {
    return this.categoryService.findCategoriesByStoreName(storeName);
  }
}
