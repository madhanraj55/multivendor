import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AddressType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves all addresses for the authenticated customer.
   * Default address returned first, followed by newest created.
   */
  async getAddresses(userId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses.map((addr) => this.formatAddress(addr));
  }

  /**
   * Retrieves a single address by ID with customer ownership validation.
   */
  async getAddressById(userId: string, id: string) {
    const address = await this.prisma.address.findUnique({
      where: { id },
    });

    if (!address) {
      throw new NotFoundException(`Address with ID "${id}" not found`);
    }

    if (address.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this address',
      );
    }

    return this.formatAddress(address);
  }

  /**
   * Creates a new customer address.
   * Rules:
   * 1. If customer has 0 addresses, automatically mark this address as default (isDefault = true).
   * 2. If isDefault is explicitly true, unmark all other addresses for this customer in a transaction.
   * 3. Order snapshots are untouched (Address table is independent from order address snapshots).
   */
  async createAddress(userId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.address.count({
        where: { userId },
      });

      // Auto-set as default if this is the customer's first address
      const shouldBeDefault = existingCount === 0 ? true : !!dto.isDefault;

      if (shouldBeDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.address.create({
        data: {
          userId,
          addressType: dto.addressType ?? AddressType.SHIPPING,
          fullName: dto.fullName,
          phone: dto.phone,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2 ?? null,
          landmark: dto.landmark ?? null,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode,
          isDefault: shouldBeDefault,
          latitude: dto.latitude !== undefined ? dto.latitude : null,
          longitude: dto.longitude !== undefined ? dto.longitude : null,
        },
      });

      return this.formatAddress(created);
    });
  }

  /**
   * Updates an existing customer address.
   * Validates customer ownership.
   * If isDefault is toggled to true, unmarks other addresses for this customer.
   */
  async updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException(`Address with ID "${id}" not found`);
      }

      if (existing.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to modify this address',
        );
      }

      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      const updated = await tx.address.update({
        where: { id },
        data: {
          ...(dto.addressType ? { addressType: dto.addressType } : {}),
          ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.addressLine1 !== undefined ? { addressLine1: dto.addressLine1 } : {}),
          ...(dto.addressLine2 !== undefined ? { addressLine2: dto.addressLine2 } : {}),
          ...(dto.landmark !== undefined ? { landmark: dto.landmark } : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.state !== undefined ? { state: dto.state } : {}),
          ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
          ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        },
      });

      return this.formatAddress(updated);
    });
  }

  /**
   * Sets a specific customer address as default.
   * Idempotently unmarks all other addresses and marks target as default.
   */
  async setDefaultAddress(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException(`Address with ID "${id}" not found`);
      }

      if (existing.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to modify this address',
        );
      }

      await tx.address.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });

      const updated = await tx.address.update({
        where: { id },
        data: { isDefault: true },
      });

      return {
        message: 'Default address updated successfully',
        address: this.formatAddress(updated),
      };
    });
  }

  /**
   * Deletes a customer address.
   * Sensible Default Replacement Policy:
   * If the address being deleted is marked as default:
   * - Finds the most recently updated/created remaining address for the customer and sets it as the new default.
   * - If no other addresses exist, the customer simply has 0 addresses.
   */
  async deleteAddress(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException(`Address with ID "${id}" not found`);
      }

      if (existing.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to delete this address',
        );
      }

      const wasDefault = existing.isDefault;

      // Delete target address
      await tx.address.delete({
        where: { id },
      });

      let replacementDefaultId: string | null = null;

      // If deleted address was default, select a replacement if any exist
      if (wasDefault) {
        const nextAddress = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });

        if (nextAddress) {
          await tx.address.update({
            where: { id: nextAddress.id },
            data: { isDefault: true },
          });
          replacementDefaultId = nextAddress.id;
        }
      }

      return {
        message: 'Address deleted successfully',
        deletedId: id,
        replacementDefaultId,
      };
    });
  }

  private formatAddress(addr: any) {
    return {
      id: addr.id,
      userId: addr.userId,
      addressType: addr.addressType,
      fullName: addr.fullName,
      phone: addr.phone,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2,
      landmark: addr.landmark,
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      isDefault: addr.isDefault,
      latitude: addr.latitude !== null ? Number(addr.latitude) : null,
      longitude: addr.longitude !== null ? Number(addr.longitude) : null,
      createdAt: addr.createdAt,
      updatedAt: addr.updatedAt,
    };
  }
}
