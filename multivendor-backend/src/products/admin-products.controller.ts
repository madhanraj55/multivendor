import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../generated/prisma/client.js';
import {
  AdminUpdateProductDto,
  AdminUpdateProductStatusDto,
  QueryAdminProductsDto,
} from './dto/admin-product.dto.js';
import { ProductsService } from './products.service.js';

@Controller('admin/products')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * 1. GET /api/v1/admin/products
   * List products across all sellers with pagination and filters.
   */
  @Get()
  async getAdminProducts(@Query() query: QueryAdminProductsDto) {
    return this.productsService.getAdminProducts(query);
  }

  /**
   * 2. GET /api/v1/admin/products/:id
   * Detailed view of a product across any seller.
   */
  @Get(':id')
  async getAdminProductById(@Param('id') id: string) {
    return this.productsService.getAdminProductById(id);
  }

  /**
   * 3. PATCH /api/v1/admin/products/:id
   * Update permitted product fields.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateAdminProduct(
    @Param('id') id: string,
    @Body() dto: AdminUpdateProductDto,
  ) {
    return this.productsService.updateAdminProduct(id, dto);
  }

  /**
   * 4. PATCH /api/v1/admin/products/:id/status
   * Update product status with shop approval validation.
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateAdminProductStatus(
    @Param('id') id: string,
    @Body() dto: AdminUpdateProductStatusDto,
  ) {
    return this.productsService.updateAdminProductStatus(id, dto);
  }

  /**
   * 5. DELETE /api/v1/admin/products/:id
   * Permanent deletion if unreferenced, or reversible archive if order history exists.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteAdminProduct(@Param('id') id: string) {
    return this.productsService.deleteAdminProduct(id);
  }
}
