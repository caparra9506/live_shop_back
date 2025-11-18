import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /*@UseGuards(JwtAuthGuard)
  @Post('category/:categoryId')
  create(
    @Param('categoryId') categoryId: number,
    @Body('name') name: string,
    @Body('price') price: number,
    @Body('description') description: string,
    @Body('imageUrl') imageUrl: string,
  ) {
    return this.productService.createProduct(
      name,
      price,
      description,
      imageUrl,
      { id: categoryId } as any,
    );
  }

  @Get(':categoryId')
  findAll(@Param('categoryId') categoryId: number) {
    return this.productService.findProductsByCategory(categoryId);
  }*/

  /*@UseGuards(JwtAuthGuard) 
  @Get('me')
  async getMyStoreProducts(@Request() req) {
    console.log('req ', req);
    const user = req.user; // Esto debería contener el usuario autenticado
    return this.productService.getProductsByStore(user.storeId);
  }*/

  @UseGuards(JwtAuthGuard)
  @Get('me/all')
  async getAllMyStoreProducts(@Request() req) {
    const user = req.user;
    return this.productService.getAllProductsByStore(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyStoreProducts(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '15',
    @Query('search') search: string = '',
    @Query('category') category: string = '',
    @Query('inStock') inStock: string = ''
  ) {
    const user = req.user;
    
    return this.productService.getProductsByStore(user.id, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      category,
      inStock: inStock === 'true' ? true : inStock === 'false' ? false : undefined
    });
  }


  // Crear un producto en la tienda del usuario autenticado
  @UseGuards(JwtAuthGuard)
  @Post()
  async createProduct(
    @Request() req,
    @Body() createProductDto: CreateProductDto,
  ) {
    return this.productService.createProduct(req.user.id, createProductDto);
  }


  @UseGuards(JwtAuthGuard)
  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImageProduct(@UploadedFile() file: Express.Multer.File) {
    return this.productService.uploadImageProduct(file);
  }

  @Get('store/:store/product/:productCode')
  async getProductDetail(
    @Param('store') store: string,
    @Param('productCode') productCode: string,
  ) {
    return await this.productService.getProductByStoreAndCode(
      store,
      productCode,
    );
  }

  @Get('store/:name')
  async getPorductsByNameStore(@Param('name') name: string,) {
    return this.productService.getPorductsByNameStore(name);
  }

  @Get(':id')
  async getProductById(@Param('id') productId: number) {
    return this.productService.getProductById(productId);
  }

  @Get(':id/variants')
  async getProductVariants(
    @Param('id') productId: number,
    @Query('color') color?: string,
    @Query('size') size?: string,
  ) {
    try {
      const variants = await this.productService.getProductVariants(productId, color, size);
      return variants;
    } catch (error) {
      throw new Error(`Error al obtener variantes: ${error.message}`);
    }
  }
}
