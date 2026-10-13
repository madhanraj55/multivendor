import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UserRole, UserStatus } from '../../generated/prisma/client.js';

export class QueryAdminUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit: number = 20;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Role must be CUSTOMER, SELLER, or ADMIN' })
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus, {
    message: 'Status must be PENDING_VERIFICATION, ACTIVE, SUSPENDED, or DEACTIVATED',
  })
  status?: UserStatus;
}

export class AdminUpdateUserStatusDto {
  @IsEnum(UserStatus, {
    message: 'Status must be PENDING_VERIFICATION, ACTIVE, SUSPENDED, or DEACTIVATED',
  })
  @IsNotEmpty({ message: 'Status is required' })
  status!: UserStatus;

  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason?: string;
}

export class AdminUpdateUserRoleDto {
  @IsEnum(UserRole, { message: 'Role must be CUSTOMER, SELLER, or ADMIN' })
  @IsNotEmpty({ message: 'Role is required' })
  role!: UserRole;
}
