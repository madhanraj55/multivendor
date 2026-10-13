import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AddressSnapshotDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  addressLine1!: string;

  @IsString()
  @IsOptional()
  addressLine2?: string;

  @IsString()
  @IsOptional()
  landmark?: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsString()
  @IsNotEmpty()
  postalCode!: string;
}

export class ReserveCheckoutDto {
  @IsString({ message: 'Idempotency key must be a string' })
  @IsNotEmpty({ message: 'Idempotency key is required' })
  @MaxLength(100, { message: 'Idempotency key must not exceed 100 characters' })
  idempotencyKey!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AddressSnapshotDto)
  shippingAddress!: AddressSnapshotDto;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressSnapshotDto)
  billingAddress?: AddressSnapshotDto;
}
