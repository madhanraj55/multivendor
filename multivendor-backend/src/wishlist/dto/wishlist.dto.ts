import { IsNotEmpty, IsUUID } from 'class-validator';

export class AddToWishlistDto {
  @IsUUID('4', { message: 'Product ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Product ID is required' })
  productId!: string;
}
