import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { AddressType } from '../../generated/prisma/client.js';

export class CreateAddressDto {
  @IsOptional()
  @IsEnum(AddressType, { message: 'Address type must be SHIPPING, BILLING, or SHOP_PICKUP' })
  addressType?: AddressType;

  @IsString({ message: 'Full name must be a string' })
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(100, { message: 'Full name cannot exceed 100 characters' })
  fullName!: string;

  @IsString({ message: 'Phone number must be a string' })
  @IsNotEmpty({ message: 'Phone number is required' })
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Phone number must be a valid 10-digit Indian mobile number',
  })
  phone!: string;

  @IsString({ message: 'Address line 1 must be a string' })
  @IsNotEmpty({ message: 'Address line 1 is required' })
  @MaxLength(255, { message: 'Address line 1 cannot exceed 255 characters' })
  addressLine1!: string;

  @IsOptional()
  @IsString({ message: 'Address line 2 must be a string' })
  @MaxLength(255, { message: 'Address line 2 cannot exceed 255 characters' })
  addressLine2?: string;

  @IsOptional()
  @IsString({ message: 'Landmark must be a string' })
  @MaxLength(100, { message: 'Landmark cannot exceed 100 characters' })
  landmark?: string;

  @IsString({ message: 'City must be a string' })
  @IsNotEmpty({ message: 'City is required' })
  @MaxLength(100, { message: 'City cannot exceed 100 characters' })
  city!: string;

  @IsString({ message: 'State must be a string' })
  @IsNotEmpty({ message: 'State is required' })
  @MaxLength(100, { message: 'State cannot exceed 100 characters' })
  state!: string;

  @IsString({ message: 'PIN code must be a string' })
  @IsNotEmpty({ message: 'PIN code is required' })
  @Matches(/^[1-9][0-9]{5}$/, {
    message: 'Postal code must be a valid 6-digit Indian PIN code',
  })
  postalCode!: string;

  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'Latitude must be a valid number' })
  latitude?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Longitude must be a valid number' })
  longitude?: number;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsEnum(AddressType, { message: 'Address type must be SHIPPING, BILLING, or SHOP_PICKUP' })
  addressType?: AddressType;

  @IsOptional()
  @IsString({ message: 'Full name must be a string' })
  @MaxLength(100, { message: 'Full name cannot exceed 100 characters' })
  fullName?: string;

  @IsOptional()
  @IsString({ message: 'Phone number must be a string' })
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Phone number must be a valid 10-digit Indian mobile number',
  })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'Address line 1 must be a string' })
  @MaxLength(255, { message: 'Address line 1 cannot exceed 255 characters' })
  addressLine1?: string;

  @IsOptional()
  @IsString({ message: 'Address line 2 must be a string' })
  @MaxLength(255, { message: 'Address line 2 cannot exceed 255 characters' })
  addressLine2?: string;

  @IsOptional()
  @IsString({ message: 'Landmark must be a string' })
  @MaxLength(100, { message: 'Landmark cannot exceed 100 characters' })
  landmark?: string;

  @IsOptional()
  @IsString({ message: 'City must be a string' })
  @MaxLength(100, { message: 'City cannot exceed 100 characters' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'State must be a string' })
  @MaxLength(100, { message: 'State cannot exceed 100 characters' })
  state?: string;

  @IsOptional()
  @IsString({ message: 'PIN code must be a string' })
  @Matches(/^[1-9][0-9]{5}$/, {
    message: 'Postal code must be a valid 6-digit Indian PIN code',
  })
  postalCode?: string;

  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'Latitude must be a valid number' })
  latitude?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Longitude must be a valid number' })
  longitude?: number;
}
