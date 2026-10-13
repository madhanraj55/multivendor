import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ProductStatus } from '../../generated/prisma/client.js';

export class QueryAdminProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit: number = 20;

  @IsOptional()
  @IsEnum(ProductStatus, {
    message: 'Status must be DRAFT, PUBLISHED, INACTIVE, or ARCHIVED',
  })
  status?: ProductStatus;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Shop ID must be a valid UUID' })
  shopId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Seller ID must be a valid UUID' })
  sellerId?: string;

  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  @MaxLength(100, { message: 'Search query cannot exceed 100 characters' })
  search?: string;
}

export class AdminUpdateProductDto {
  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @IsOptional()
  @IsString({ message: 'Product title must be a string' })
  @MaxLength(200, { message: 'Product title cannot exceed 200 characters' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Product description must be a string' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Brand must be a string' })
  @MaxLength(100, { message: 'Brand cannot exceed 100 characters' })
  brand?: string;

  @IsOptional()
  @IsString({ message: 'HSN code must be a string' })
  @MaxLength(20, { message: 'HSN code cannot exceed 20 characters' })
  hsnCode?: string;

  @IsOptional()
  @IsBoolean({ message: 'isReturnable must be a boolean' })
  isReturnable?: boolean;

  @IsOptional()
  @IsInt({ message: 'returnWindowDays must be an integer' })
  @Min(0, { message: 'returnWindowDays cannot be negative' })
  returnWindowDays?: number;

  @IsOptional()
  @IsString({ message: 'metaTitle must be a string' })
  @MaxLength(200, { message: 'metaTitle cannot exceed 200 characters' })
  metaTitle?: string;

  @IsOptional()
  @IsString({ message: 'metaDescription must be a string' })
  @MaxLength(500, { message: 'metaDescription cannot exceed 500 characters' })
  metaDescription?: string;
}

export class AdminUpdateProductStatusDto {
  @IsEnum(ProductStatus, {
    message: 'Status must be DRAFT, PUBLISHED, INACTIVE, or ARCHIVED',
  })
  @IsNotEmpty({ message: 'Status is required' })
  status!: ProductStatus;

  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason?: string;
}
