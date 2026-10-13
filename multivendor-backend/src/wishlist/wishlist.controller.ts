import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../generated/prisma/client.js';
import { AddToWishlistDto } from './dto/wishlist.dto.js';
import { WishlistService } from './wishlist.service.js';

@Controller('wishlist')
@UseGuards(AuthGuard, RolesGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Get()
  async getWishlist(@CurrentUser('userId') userId: string) {
    return this.wishlistService.getWishlist(userId);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Post('items')
  async addToWishlist(
    @CurrentUser('userId') userId: string,
    @Body() dto: AddToWishlistDto,
  ) {
    return this.wishlistService.addToWishlist(userId, dto);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Delete('items/:productId')
  async removeFromWishlist(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.removeFromWishlist(userId, productId);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Delete()
  async clearWishlist(@CurrentUser('userId') userId: string) {
    return this.wishlistService.clearWishlist(userId);
  }
}
