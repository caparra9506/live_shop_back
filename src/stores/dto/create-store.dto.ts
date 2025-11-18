import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 255)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;


  @IsString()
  @IsOptional()
  logo?: string;

  @IsString()
  address: string;

  @IsString()
  documentType: string;

  @IsString()
  document: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  cityId: string;
}
