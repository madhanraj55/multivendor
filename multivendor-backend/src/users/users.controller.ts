import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../generated/prisma/client.js';
import {
  AdminUpdateUserRoleDto,
  AdminUpdateUserStatusDto,
  QueryAdminUsersDto,
} from './dto/user-admin.dto.js';
import { UsersService } from './users.service.js';

@Controller('admin/users')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/v1/admin/users
   * Admin-only user listing with pagination and filters.
   */
  @Get()
  async getAdminUsers(@Query() query: QueryAdminUsersDto) {
    return this.usersService.getAdminUsers(query);
  }

  /**
   * GET /api/v1/admin/users/:id
   * Admin-only user details with shop summary and counts.
   */
  @Get(':id')
  async getAdminUserById(@Param('id') id: string) {
    return this.usersService.getAdminUserById(id);
  }

  /**
   * PATCH /api/v1/admin/users/:id/status
   * Update account status and revoke sessions if suspended/deactivated.
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateUserStatus(
    @CurrentUser('userId') adminUserId: string,
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserStatusDto,
  ) {
    return this.usersService.updateUserStatus(adminUserId, id, dto);
  }

  /**
   * PATCH /api/v1/admin/users/:id/role
   * Update user role with self-demotion and last-admin protection.
   */
  @Patch(':id/role')
  @HttpCode(HttpStatus.OK)
  async updateUserRole(
    @CurrentUser('userId') adminUserId: string,
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserRoleDto,
  ) {
    return this.usersService.updateUserRole(adminUserId, id, dto);
  }
}
