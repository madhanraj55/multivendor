import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../generated/prisma/client.js';
import { CheckoutExpiryService } from './checkout-expiry.service.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutValidationResponse } from './dto/checkout-validation.dto.js';
import { PlaceOrderDto } from './dto/place-order.dto.js';
import { ReserveCheckoutDto } from './dto/reserve-checkout.dto.js';

@Controller('checkout')
@UseGuards(AuthGuard, RolesGuard)
export class CheckoutController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly expiryService: CheckoutExpiryService,
  ) {}

  /**
   * Validates cart readiness for checkout.
   * Reads cart directly from the authenticated customer's record.
   * Never accepts customer userId or prices from request body.
   */
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateCheckout(
    @CurrentUser('userId') userId: string,
  ): Promise<CheckoutValidationResponse> {
    return this.checkoutService.validateCheckout(userId);
  }

  /**
   * Atomically reserves stock and creates a CheckoutAttempt record.
   * Customer-authenticated, idempotent, and transactional.
   */
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Post('reserve')
  @HttpCode(HttpStatus.CREATED)
  async reserveCheckout(
    @CurrentUser('userId') userId: string,
    @Body() dto: ReserveCheckoutDto,
  ) {
    return this.checkoutService.reserveCheckout(userId, dto);
  }

  /**
   * Trigger expiry release on demand (admin / testing utility).
   */
  @Roles(UserRole.ADMIN)
  @Post('release-expired')
  @HttpCode(HttpStatus.OK)
  async releaseExpiredCheckouts() {
    return this.expiryService.triggerExpiryCheck();
  }

  /**
   * Places an order from a verified, unexpired stock-reserved checkout attempt.
   * Customer-authenticated, splits seller sub-orders, and transitions attempt to COMPLETED.
   */
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Post('place-order')
  @HttpCode(HttpStatus.CREATED)
  async placeOrder(
    @CurrentUser('userId') userId: string,
    @Body() dto: PlaceOrderDto,
  ) {
    return this.checkoutService.placeOrder(userId, dto);
  }

  /**
   * Safe read-only recovery endpoint:
   * Retrieves checkout attempt status and order for the authenticated customer.
   * If COMPLETED, safely returns the already-created order with shop relation.
   */
  @Roles(UserRole.CUSTOMER)
  @Get('attempt/:attemptId')
  @HttpCode(HttpStatus.OK)
  async getCheckoutAttempt(
    @CurrentUser('userId') userId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.checkoutService.getCheckoutAttempt(userId, attemptId);
  }
}
