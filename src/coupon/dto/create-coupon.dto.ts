import { IsNotEmpty, IsNumber, IsOptional, IsEnum, IsDate, IsArray } from 'class-validator';

export class CreateCouponDto {
  @IsNotEmpty()
  code: string;

  @IsNumber()
  discountValue: number;

  @IsEnum(['PERCENTAGE', 'FIXED'])
  discountType: 'PERCENTAGE' | 'FIXED';

  @IsDate()
  expirationDate: Date;

  @IsOptional()
  @IsArray()
  categoryIds?: number[];

  @IsOptional()
  @IsArray()
  productIds?: number[];
}
