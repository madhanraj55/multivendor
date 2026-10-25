import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SellerOrderStatus } from '../../generated/prisma/client.js';

export class QueryOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class QuerySellerOrdersDto extends QueryOrdersDto {
  @IsOptional()
  @IsEnum(SellerOrderStatus, { message: 'Invalid seller order status filter' })
  status?: SellerOrderStatus;
}

export class UpdateSellerOrderStatusDto {
  @IsEnum(SellerOrderStatus, { message: 'Invalid target status' })
  @IsNotEmpty({ message: 'Target status is required' })
  status!: SellerOrderStatus;

  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  notes?: string;
}


export class CustomerCancelOrderDto {
  @IsOptional()
  @IsString({ message: 'Cancellation reason must be a string' })
  @MaxLength(500, { message: 'Cancellation reason cannot exceed 500 characters' })
  reason?: string;
}

export class CustomerReturnOrderDto {
  @IsNotEmpty({ message: 'Sub-order number is required' })
  @IsString()
  subOrderNumber!: string;

  @IsNotEmpty({ message: 'Return reason is required' })
  @IsString()
  @MaxLength(500, { message: 'Return reason cannot exceed 500 characters' })
  reason!: string;
}
