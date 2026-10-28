import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../generated/prisma/client.js';
import { UpdatePricingSettingsDto } from './dto/update-pricing-settings.dto.js';
import { PricingService } from './pricing.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('admin/pricing/settings')
  @Roles(UserRole.ADMIN)
  getAdminPricingSettings() {
    return this.pricingService.getSettings();
  }

  @Patch('admin/pricing/settings')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  updateAdminPricingSettings(@Body() dto: UpdatePricingSettingsDto) {
    return this.pricingService.updateSettings(dto);
  }

  @Get('pricing/public-settings')
  @Public()
  getPublicSettings() {
    const settings = this.pricingService.getSettings();
    return {
      globalCommissionPercentage: settings.globalCommissionPercentage,
      platformFee: settings.platformFee,
      deliveryRules: settings.deliveryRules,
    };
  }

  @Get('pricing/preview')
  @Public()
  previewPricing(
    @Query('sellerPrice') sellerPrice?: string,
    @Query('mrp') mrp?: string,
  ) {
    const base = Number(sellerPrice) || 0;
    const mrpVal = mrp ? Number(mrp) : undefined;
    return this.pricingService.calculateItemPrice(base, mrpVal);
  }
}
