import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '../../generated/prisma/client.js';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty({ message: 'SKU is required' })
  sku!: string;

  @IsString()
  @IsNotEmpty({ message: 'Variant title is required' })
  title!: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'MRP must be a valid monetary decimal' })
  @Min(0, { message: 'MRP must be non-negative' })
  mrp!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Selling price must be a valid monetary decimal' })
  @Min(0, { message: 'Selling price must be non-negative' })
  price!: number;

  @IsObject()
  attributes!: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  initialStock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}

export class CreateProductImageDto {
  @IsString()
  @IsNotEmpty({ message: 'Image URL is required' })
  url!: string;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isThumbnail?: boolean;
}

export class CreateProductDto {
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Category ID is required' })
  categoryId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Product title is required' })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'Product description is required' })
  description!: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  hsnCode?: string;

  @IsOptional()
  @IsBoolean()
  isReturnable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  returnWindowDays?: number;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants!: CreateVariantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  hsnCode?: string;

  @IsOptional()
  @IsBoolean()
  isReturnable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  returnWindowDays?: number;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;
}

export class AdjustStockDto {
  @IsUUID('4')
  @IsNotEmpty({ message: 'Variant ID is required' })
  variantId!: string;

  @IsInt({ message: 'Quantity delta must be an integer' })
  quantity!: number;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
