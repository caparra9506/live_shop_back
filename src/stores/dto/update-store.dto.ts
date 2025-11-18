import { IsString, IsOptional, Length } from 'class-validator';

export class UpdateStoreDto {
  @IsString()
  @IsOptional()
  @Length(3, 255)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
