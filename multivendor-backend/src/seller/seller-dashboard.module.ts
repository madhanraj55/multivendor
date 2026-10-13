import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SellerDashboardController } from './seller-dashboard.controller.js';
import { SellerDashboardService } from './seller-dashboard.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SellerDashboardController],
  providers: [SellerDashboardService],
  exports: [SellerDashboardService],
})
export class SellerDashboardModule {}
