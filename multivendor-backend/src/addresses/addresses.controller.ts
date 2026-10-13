import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { AddressesService } from './addresses.service.js';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

@Controller('addresses')
@UseGuards(AuthGuard, RolesGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Get()
  async getAddresses(@CurrentUser('userId') userId: string) {
    return this.addressesService.getAddresses(userId);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Get(':id')
  async getAddressById(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.addressesService.getAddressById(userId, id);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createAddress(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressesService.createAddress(userId, dto);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Patch(':id')
  async updateAddress(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.updateAddress(userId, id, dto);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Patch(':id/default')
  @HttpCode(HttpStatus.OK)
  async setDefaultAddress(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.addressesService.setDefaultAddress(userId, id);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SELLER)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteAddress(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.addressesService.deleteAddress(userId, id);
  }
}
