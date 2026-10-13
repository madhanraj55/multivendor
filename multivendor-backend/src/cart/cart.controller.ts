import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../generated/prisma/client.js';
import { CartService } from './cart.service.js';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto.js';

@Controller('cart')
@UseGuards(AuthGuard, RolesGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Get()
  async getCart(@CurrentUser('userId') userId: string) {
    return this.cartService.getCart(userId);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Post('items')
  async addToCart(
    @CurrentUser('userId') userId: string,
    @Body() dto: AddToCartDto,
  ) {
    return this.cartService.addToCart(userId, dto);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Patch('items/:variantId')
  async updateCartItem(
    @CurrentUser('userId') userId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateCartItem(userId, variantId, dto);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Delete('items/:variantId')
  async removeCartItem(
    @CurrentUser('userId') userId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.cartService.removeCartItem(userId, variantId);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Delete()
  async clearCart(@CurrentUser('userId') userId: string) {
    return this.cartService.clearCart(userId);
  }
}
