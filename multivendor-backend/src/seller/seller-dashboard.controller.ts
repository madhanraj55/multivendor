import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../generated/prisma/client.js';
import { QuerySellerProductsDto } from './dto/seller-dashboard.dto.js';
import { SellerDashboardService } from './seller-dashboard.service.js';

@Controller('seller/dashboard')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
export class SellerDashboardController {
  constructor(
    private readonly sellerDashboardService: SellerDashboardService,
  ) {}

  /**
   * 1. GET /api/v1/seller/dashboard/summary
   * Aggregated dashboard metrics: shop approval status, products, variants, low stock,
   * suborder status counts, and completed sales values.
   */
  @Get('summary')
  async getDashboardSummary(@CurrentUser('userId') userId: string) {
    return this.sellerDashboardService.getDashboardSummary(userId);
  }

  /**
   * 2. GET /api/v1/seller/dashboard/products
   * Paginated view of seller products and variants with stock and low-stock indicators.
   */
  @Get('products')
  async getSellerProducts(
    @CurrentUser('userId') userId: string,
    @Query() query: QuerySellerProductsDto,
  ) {
    return this.sellerDashboardService.getSellerProducts(userId, query);
  }

  /**
   * 3. GET /api/v1/seller/dashboard/inventory/movements
   * Recent stock movement audit records for the seller's variants.
   */
  @Get('inventory/movements')
  async getRecentInventoryMovements(
    @CurrentUser('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? parseInt(limit, 10) : 20;
    return this.sellerDashboardService.getRecentInventoryMovements(
      userId,
      take,
    );
  }
}
