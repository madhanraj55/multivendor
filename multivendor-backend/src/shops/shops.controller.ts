import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../generated/prisma/client.js';
import {
  AdminUpdateShopStatusDto,
  CreateShopApplicationDto,
  QueryShopsDto,
  UpdateShopDetailsDto,
} from './dto/shop.dto.js';
import { ShopsService } from './shops.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  // ---------------------------------------------------------------------------
  // TASK 1: SELLER SHOP APIS
  // ---------------------------------------------------------------------------

  @Roles(UserRole.SELLER)
  @Get('seller/shop')
  async getSellerShop(@CurrentUser('userId') userId: string) {
    return this.shopsService.getSellerShop(userId);
  }

  @Roles(UserRole.SELLER)
  @Post('seller/shop')
  @HttpCode(HttpStatus.CREATED)
  async createShopApplication(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateShopApplicationDto,
  ) {
    return this.shopsService.createShopApplication(userId, dto);
  }

  @Roles(UserRole.SELLER)
  @Patch('seller/shop')
  async updateSellerShop(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateShopDetailsDto,
  ) {
    return this.shopsService.updateSellerShop(userId, dto);
  }

  // ---------------------------------------------------------------------------
  // TASK 2: ADMIN SHOP APPROVAL APIS
  // ---------------------------------------------------------------------------

  @Roles(UserRole.ADMIN)
  @Get('admin/shops/pending')
  async getPendingShops(@Query() query: QueryShopsDto) {
    return this.shopsService.getPendingShops(query);
  }

  @Roles(UserRole.ADMIN)
  @Get('admin/shops/:id')
  async getShopByIdForAdmin(@Param('id') id: string) {
    return this.shopsService.getShopByIdForAdmin(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch('admin/shops/:id/status')
  @HttpCode(HttpStatus.OK)
  async updateShopStatusByAdmin(
    @CurrentUser('userId') adminUserId: string,
    @Param('id') id: string,
    @Body() dto: AdminUpdateShopStatusDto,
  ) {
    return this.shopsService.updateShopStatusByAdmin(adminUserId, id, dto);
  }
}
