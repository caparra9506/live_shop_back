import { IsNumber, IsString, IsOptional, IsArray } from 'class-validator';

export interface ElectronicInvoiceItemDto {
  code_reference: string;
  name: string;
  quantity: number;
  discount_rate?: number;
  price: number;
  tax_rate?: number;
  unit_measure_id?: number;
  standard_code_id?: number;
  is_excluded?: number;
  tribute_id?: number;
  withholding_taxes?: any[];
}

export class CreateElectronicInvoiceDto {
  @IsNumber()
  saleId: number;

  @IsNumber()
  @IsOptional()
  numbering_range_id?: number;

  @IsString()
  reference_code: string;

  @IsString()
  payment_method_code: string;

  @IsString()
  @IsOptional()
  observation?: string;

  @IsArray()
  items: ElectronicInvoiceItemDto[];
}