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
  AdminUpdateOrderStatusDto,
  AdminUpdateSubOrderStatusDto,
  QueryAdminOrdersDto,
} from './dto/admin-order.dto.js';
import {
  CustomerCancelOrderDto,
  CustomerReturnOrderDto,
  QueryOrdersDto,
  QuerySellerOrdersDto,
  UpdateSellerOrderStatusDto,
} from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ---------------------------------------------------------------------------
  // TASK A: CUSTOMER ORDER APIS
  // ---------------------------------------------------------------------------

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Get('orders/my-orders')
  async getCustomerOrders(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryOrdersDto,
  ) {
    return this.ordersService.getCustomerOrders(userId, query);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Get('orders/my-orders/:orderNumber')
  async getCustomerOrderByNumber(
    @CurrentUser('userId') userId: string,
    @Param('orderNumber') orderNumber: string,
  ) {
    return this.ordersService.getCustomerOrderByNumber(userId, orderNumber);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Post('orders/my-orders/:orderNumber/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelCustomerOrder(
    @CurrentUser('userId') userId: string,
    @Param('orderNumber') orderNumber: string,
    @Body() dto: CustomerCancelOrderDto,
  ) {
    return this.ordersService.customerCancelOrder(userId, orderNumber, dto);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Post('orders/my-orders/:orderNumber/return')
  @HttpCode(HttpStatus.OK)
  async requestCustomerReturn(
    @CurrentUser('userId') userId: string,
    @Param('orderNumber') orderNumber: string,
    @Body() dto: CustomerReturnOrderDto,
  ) {
    return this.ordersService.customerRequestReturn(userId, orderNumber, dto);
  }

  // ---------------------------------------------------------------------------
  // TASK B: SELLER ORDER APIS
  // ---------------------------------------------------------------------------

  @Roles(UserRole.SELLER)
  @Get('seller/orders')
  async getSellerOrders(
    @CurrentUser('userId') userId: string,
    @Query() query: QuerySellerOrdersDto,
  ) {
    return this.ordersService.getSellerOrders(userId, query);
  }

  @Roles(UserRole.SELLER)
  @Get('seller/orders/:subOrderNumber')
  async getSellerOrderByNumber(
    @CurrentUser('userId') userId: string,
    @Param('subOrderNumber') subOrderNumber: string,
  ) {
    return this.ordersService.getSellerOrderByNumber(userId, subOrderNumber);
  }

  @Roles(UserRole.SELLER)
  @Patch('seller/orders/:subOrderNumber/status')
  @HttpCode(HttpStatus.OK)
  async updateSellerOrderStatus(
    @CurrentUser('userId') userId: string,
    @Param('subOrderNumber') subOrderNumber: string,
    @Body() dto: UpdateSellerOrderStatusDto,
  ) {
    return this.ordersService.updateSellerOrderStatus(
      userId,
      subOrderNumber,
      dto,
    );
  }

  // ---------------------------------------------------------------------------
  // TASK C: ADMIN ORDER APIS
  // ---------------------------------------------------------------------------

  @Roles(UserRole.ADMIN)
  @Get('admin/orders')
  async getAdminOrders(@Query() query: QueryAdminOrdersDto) {
    return this.ordersService.getAdminOrders(query);
  }

  @Roles(UserRole.ADMIN)
  @Get('admin/orders/:orderNumber')
  async getAdminOrderByNumber(@Param('orderNumber') orderNumber: string) {
    return this.ordersService.getAdminOrderByNumber(orderNumber);
  }

  @Roles(UserRole.ADMIN)
  @Get('admin/orders/:orderNumber/suborders')
  async getAdminSubOrders(@Param('orderNumber') orderNumber: string) {
    return this.ordersService.getAdminSubOrders(orderNumber);
  }

  @Roles(UserRole.ADMIN)
  @Patch('admin/orders/:orderNumber/status')
  @HttpCode(HttpStatus.OK)
  async updateAdminOrderStatus(
    @CurrentUser('userId') adminUserId: string,
    @Param('orderNumber') orderNumber: string,
    @Body() dto: AdminUpdateOrderStatusDto,
  ) {
    return this.ordersService.updateAdminOrderStatus(
      adminUserId,
      orderNumber,
      dto,
    );
  }

  @Roles(UserRole.ADMIN)
  @Patch('admin/orders/suborders/:subOrderNumber/status')
  @HttpCode(HttpStatus.OK)
  async updateAdminSubOrderStatus(
    @CurrentUser('userId') adminUserId: string,
    @Param('subOrderNumber') subOrderNumber: string,
    @Body() dto: AdminUpdateSubOrderStatusDto,
  ) {
    return this.ordersService.updateAdminSubOrderStatus(
      adminUserId,
      subOrderNumber,
      dto,
    );
  }
}
