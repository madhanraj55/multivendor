import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

// =============================================================================
// VARIANT DTOS
// =============================================================================

export class CreateProductVariantDto {
  @IsString({ message: 'SKU must be a string' })
  @IsNotEmpty({ message: 'SKU is required' })
  @MaxLength(100, { message: 'SKU cannot exceed 100 characters' })
  sku!: string;

  @IsString({ message: 'Variant title must be a string' })
  @IsNotEmpty({ message: 'Variant title is required' })
  @MaxLength(200, { message: 'Variant title cannot exceed 200 characters' })
  title!: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'MRP must be a valid monetary decimal' })
  @Min(0, { message: 'MRP must be non-negative' })
  mrp!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Selling price must be a valid monetary decimal' })
  @Min(0, { message: 'Selling price must be non-negative' })
  price!: number;

  @IsObject({ message: 'Attributes must be a valid JSON object' })
  attributes!: Record<string, any>;

  @IsOptional()
  @IsInt({ message: 'Weight in grams must be an integer' })
  @Min(0, { message: 'Weight cannot be negative' })
  weightGrams?: number;

  @IsOptional()
  @IsInt({ message: 'Initial stock must be an integer' })
  @Min(0, { message: 'Initial stock cannot be negative' })
  initialStock?: number;

  @IsOptional()
  @IsInt({ message: 'Low stock threshold must be an integer' })
  @Min(0, { message: 'Low stock threshold cannot be negative' })
  lowStockThreshold?: number;
}

export class UpdateProductVariantDto {
  @IsOptional()
  @IsString({ message: 'SKU must be a string' })
  @MaxLength(100, { message: 'SKU cannot exceed 100 characters' })
  sku?: string;

  @IsOptional()
  @IsString({ message: 'Variant title must be a string' })
  @MaxLength(200, { message: 'Variant title cannot exceed 200 characters' })
  title?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'MRP must be a valid monetary decimal' })
  @Min(0, { message: 'MRP must be non-negative' })
  mrp?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Selling price must be a valid monetary decimal' })
  @Min(0, { message: 'Selling price must be non-negative' })
  price?: number;

  @IsOptional()
  @IsObject({ message: 'Attributes must be a valid JSON object' })
  attributes?: Record<string, any>;

  @IsOptional()
  @IsInt({ message: 'Weight in grams must be an integer' })
  @Min(0, { message: 'Weight cannot be negative' })
  weightGrams?: number;
}

export class UpdateVariantStatusDto {
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive!: boolean;
}

// =============================================================================
// IMAGE DTOS
// =============================================================================

export class AddProductImageDto {
  @IsString({ message: 'Image URL must be a string' })
  @IsNotEmpty({ message: 'Image URL is required' })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Image URL must be a valid HTTP or HTTPS URL' },
  )
  @MaxLength(500, { message: 'Image URL cannot exceed 500 characters' })
  url!: string;

  @IsOptional()
  @IsString({ message: 'Alt text must be a string' })
  @MaxLength(200, { message: 'Alt text cannot exceed 200 characters' })
  altText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder must be an integer' })
  @Min(0, { message: 'sortOrder cannot be negative' })
  sortOrder?: number;

  @IsOptional()
  @IsBoolean({ message: 'isThumbnail must be a boolean' })
  isThumbnail?: boolean;
}

export class UpdateProductImageDto {
  @IsOptional()
  @IsString({ message: 'Image URL must be a string' })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Image URL must be a valid HTTP or HTTPS URL' },
  )
  @MaxLength(500, { message: 'Image URL cannot exceed 500 characters' })
  url?: string;

  @IsOptional()
  @IsString({ message: 'Alt text must be a string' })
  @MaxLength(200, { message: 'Alt text cannot exceed 200 characters' })
  altText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder must be an integer' })
  @Min(0, { message: 'sortOrder cannot be negative' })
  sortOrder?: number;

  @IsOptional()
  @IsBoolean({ message: 'isThumbnail must be a boolean' })
  isThumbnail?: boolean;
}
