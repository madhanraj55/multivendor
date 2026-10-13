import { Type } from 'class-transformer';
import {
  IsDateString,
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
import { OrderStatus, SellerOrderStatus } from '../../generated/prisma/client.js';

export class QueryAdminOrdersDto {
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
  @IsEnum(OrderStatus, { message: 'Invalid order status filter' })
  status?: OrderStatus;

  @IsOptional()
  @IsUUID('4', { message: 'Customer ID must be a valid UUID' })
  customerId?: string;

  @IsOptional()
  @IsString({ message: 'Order number must be a string' })
  @MaxLength(100, { message: 'Order number cannot exceed 100 characters' })
  orderNumber?: string;

  @IsOptional()
  @IsDateString({}, { message: 'startDate must be a valid ISO-8601 date string' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate must be a valid ISO-8601 date string' })
  endDate?: string;
}

export class AdminUpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: 'Target status must be a valid OrderStatus' })
  @IsNotEmpty({ message: 'Order status is required' })
  status!: OrderStatus;

  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  @MaxLength(500, { message: 'Notes cannot exceed 500 characters' })
  notes?: string;
}

export class AdminUpdateSubOrderStatusDto {
  @IsEnum(SellerOrderStatus, { message: 'Target status must be a valid SellerOrderStatus' })
  @IsNotEmpty({ message: 'Sub-order status is required' })
  status!: SellerOrderStatus;

  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  @MaxLength(500, { message: 'Notes cannot exceed 500 characters' })
  notes?: string;
}
