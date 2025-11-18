import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsNumber()
  price: number;

  @IsNotEmpty()
  @IsString()
  imageUrl: string;

  @IsNotEmpty()
  @IsNumber()
  categoryId: number;

  @IsArray()
  @IsOptional()
  colors?: { name: string; hexCode: string }[];

  @IsArray()
  @IsOptional()
  sizes?: { name: string }[];

  // ❌ Variantes removidas - solo usar colors[] y sizes[]
  // Las variantes se crean automáticamente de todas las combinaciones

  @IsOptional()
  @IsNumber()
  countStock: number;

  @IsNotEmpty()
  @IsBoolean()
  inStock: boolean;

  // 🔹 Nuevas dimensiones (opcionales)
  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsNumber()
  length?: number;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;
}
