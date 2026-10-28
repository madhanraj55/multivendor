import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { CheckoutExpiryService } from './checkout-expiry.service.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';

@Module({
  imports: [AuthModule, PrismaModule, PricingModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutExpiryService],
  exports: [CheckoutService, CheckoutExpiryService],
})
export class CheckoutModule {}
