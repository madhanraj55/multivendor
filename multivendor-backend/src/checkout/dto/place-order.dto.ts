import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class PlaceOrderDto {
  @IsUUID('4', { message: 'Checkout attempt ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Checkout attempt ID is required' })
  checkoutAttemptId!: string;

  @IsString({ message: 'Notes must be a string' })
  @IsOptional()
  @MaxLength(500, { message: 'Notes cannot exceed 500 characters' })
  notes?: string;

  @IsString({ message: 'Payment method must be a string' })
  @IsOptional()
  paymentMethod?: string;
}
