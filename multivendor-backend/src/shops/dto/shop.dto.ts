import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ShopStatus } from '../../generated/prisma/client.js';

export class CreateShopApplicationDto {
  @IsString({ message: 'Shop name must be a string' })
  @IsNotEmpty({ message: 'Shop name is required' })
  @MaxLength(100, { message: 'Shop name cannot exceed 100 characters' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'GSTIN must be a string' })
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
    message: 'Invalid Indian GSTIN format (e.g. 22AAAAA0000A1Z5)',
  })
  gstin?: string;

  @IsOptional()
  @IsString({ message: 'PAN must be a string' })
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, {
    message: 'Invalid Indian PAN format (e.g. ABCDE1234F)',
  })
  pan?: string;

  @IsOptional()
  @IsString({ message: 'FSSAI number must be a string' })
  @Matches(/^[0-9]{14}$/, {
    message: 'FSSAI registration number must be 14 numeric digits',
  })
  fssaiNumber?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Pickup address ID must be a valid UUID' })
  pickupAddressId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string;
}

export class UpdateShopDetailsDto {
  @IsOptional()
  @IsString({ message: 'Shop name must be a string' })
  @MaxLength(100, { message: 'Shop name cannot exceed 100 characters' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'GSTIN must be a string' })
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
    message: 'Invalid Indian GSTIN format',
  })
  gstin?: string;

  @IsOptional()
  @IsString({ message: 'PAN must be a string' })
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, {
    message: 'Invalid Indian PAN format',
  })
  pan?: string;

  @IsOptional()
  @IsString({ message: 'FSSAI number must be a string' })
  @Matches(/^[0-9]{14}$/, {
    message: 'FSSAI registration number must be 14 numeric digits',
  })
  fssaiNumber?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Pickup address ID must be a valid UUID' })
  pickupAddressId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string;
}

export class AdminUpdateShopStatusDto {
  @IsEnum(ShopStatus, { message: 'Target status must be APPROVED, REJECTED, or SUSPENDED' })
  @IsNotEmpty({ message: 'Shop status is required' })
  status!: ShopStatus;

  @IsOptional()
  @IsString({ message: 'Rejection/suspension reason must be a string' })
  @MaxLength(1000, { message: 'Reason cannot exceed 1000 characters' })
  reason?: string;
}

export class QueryShopsDto {
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

  @IsOptional()
  @IsEnum(ShopStatus, { message: 'Invalid status filter' })
  status?: ShopStatus;
}
