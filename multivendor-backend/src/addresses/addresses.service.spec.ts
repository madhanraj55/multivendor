import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AddressType } from '../generated/prisma/client.js';
import { AddressesService } from './addresses.service.js';

describe('AddressesService (Unit Tests)', () => {
  let service: AddressesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      address: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => await cb(mockPrisma)),
    };

    service = new AddressesService(mockPrisma as any);
  });

  describe('getAddresses', () => {
    it('should return addresses scoped strictly to the authenticated user', async () => {
      mockPrisma.address.findMany.mockResolvedValueOnce([
        {
          id: 'addr-1',
          userId: 'user-1',
          fullName: 'Jane Doe',
          phone: '9876543210',
          addressLine1: '123 Main St',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
          isDefault: true,
          latitude: null,
          longitude: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.getAddresses('user-1');
      expect(mockPrisma.address.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('addr-1');
    });
  });

  describe('getAddressById', () => {
    it('should throw NotFoundException if address does not exist', async () => {
      mockPrisma.address.findUnique.mockResolvedValueOnce(null);

      await expect(service.getAddressById('user-1', 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if address belongs to a different user', async () => {
      mockPrisma.address.findUnique.mockResolvedValueOnce({
        id: 'addr-2',
        userId: 'different-user',
      });

      await expect(service.getAddressById('user-1', 'addr-2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return address if owned by authenticated user', async () => {
      mockPrisma.address.findUnique.mockResolvedValueOnce({
        id: 'addr-3',
        userId: 'user-1',
        fullName: 'Jane Doe',
        phone: '9876543210',
        addressLine1: '456 Tech Park',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560100',
        isDefault: false,
        latitude: null,
        longitude: null,
      });

      const result = await service.getAddressById('user-1', 'addr-3');
      expect(result.id).toBe('addr-3');
      expect(result.city).toBe('Bengaluru');
    });
  });

  describe('createAddress', () => {
    const validDto = {
      fullName: 'Alice Johnson',
      phone: '9876543210',
      addressLine1: 'Flat 101, Lakeview',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
    };

    it('should automatically set isDefault = true if this is the user first address', async () => {
      mockPrisma.address.count.mockResolvedValueOnce(0);
      mockPrisma.address.create.mockResolvedValueOnce({
        id: 'addr-new-1',
        userId: 'user-1',
        ...validDto,
        addressType: AddressType.SHIPPING,
        isDefault: true,
        latitude: null,
        longitude: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createAddress('user-1', validDto);
      expect(result.isDefault).toBe(true);
      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(mockPrisma.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDefault: true }),
        }),
      );
    });

    it('should unmark previous defaults when isDefault is set to true on second address', async () => {
      mockPrisma.address.count.mockResolvedValueOnce(1);
      mockPrisma.address.create.mockResolvedValueOnce({
        id: 'addr-new-2',
        userId: 'user-1',
        ...validDto,
        isDefault: true,
        latitude: null,
        longitude: null,
      });

      const result = await service.createAddress('user-1', { ...validDto, isDefault: true });
      expect(result.isDefault).toBe(true);
      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
    });

    it('should not unmark previous defaults if isDefault is false and user already has addresses', async () => {
      mockPrisma.address.count.mockResolvedValueOnce(1);
      mockPrisma.address.create.mockResolvedValueOnce({
        id: 'addr-new-3',
        userId: 'user-1',
        ...validDto,
        isDefault: false,
        latitude: null,
        longitude: null,
      });

      const result = await service.createAddress('user-1', { ...validDto, isDefault: false });
      expect(result.isDefault).toBe(false);
      expect(mockPrisma.address.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('updateAddress', () => {
    it('should throw ForbiddenException if trying to update another user address', async () => {
      mockPrisma.address.findUnique.mockResolvedValueOnce({
        id: 'addr-foreign',
        userId: 'other-user',
      });

      await expect(
        service.updateAddress('user-1', 'addr-foreign', { city: 'Mysuru' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should unmark other default addresses when isDefault is updated to true', async () => {
      mockPrisma.address.findUnique.mockResolvedValueOnce({
        id: 'addr-mine',
        userId: 'user-1',
        isDefault: false,
      });
      mockPrisma.address.update.mockResolvedValueOnce({
        id: 'addr-mine',
        userId: 'user-1',
        isDefault: true,
        latitude: null,
        longitude: null,
      });

      const result = await service.updateAddress('user-1', 'addr-mine', { isDefault: true });
      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true, id: { not: 'addr-mine' } },
        data: { isDefault: false },
      });
      expect(result.isDefault).toBe(true);
    });
  });

  describe('setDefaultAddress', () => {
    it('should atomically switch default address to specified ID', async () => {
      mockPrisma.address.findUnique.mockResolvedValueOnce({
        id: 'addr-target',
        userId: 'user-1',
        isDefault: false,
      });
      mockPrisma.address.update.mockResolvedValueOnce({
        id: 'addr-target',
        userId: 'user-1',
        isDefault: true,
        latitude: null,
        longitude: null,
      });

      const result = await service.setDefaultAddress('user-1', 'addr-target');
      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true, id: { not: 'addr-target' } },
        data: { isDefault: false },
      });
      expect(result.address.isDefault).toBe(true);
    });
  });

  describe('deleteAddress', () => {
    it('should throw ForbiddenException when deleting another user address', async () => {
      mockPrisma.address.findUnique.mockResolvedValueOnce({
        id: 'addr-foreign-del',
        userId: 'other-user',
      });

      await expect(
        service.deleteAddress('user-1', 'addr-foreign-del'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should delete a non-default address without searching for replacement', async () => {
      mockPrisma.address.findUnique.mockResolvedValueOnce({
        id: 'addr-non-def',
        userId: 'user-1',
        isDefault: false,
      });

      const result = await service.deleteAddress('user-1', 'addr-non-def');
      expect(mockPrisma.address.delete).toHaveBeenCalledWith({ where: { id: 'addr-non-def' } });
      expect(mockPrisma.address.findFirst).not.toHaveBeenCalled();
      expect(result.replacementDefaultId).toBeNull();
    });

    it('should select replacement default address when deleting a default address and another address exists', async () => {
      mockPrisma.address.findUnique.mockResolvedValueOnce({
        id: 'addr-def',
        userId: 'user-1',
        isDefault: true,
      });
      mockPrisma.address.findFirst.mockResolvedValueOnce({
        id: 'addr-remaining',
        userId: 'user-1',
      });

      const result = await service.deleteAddress('user-1', 'addr-def');
      expect(mockPrisma.address.delete).toHaveBeenCalledWith({ where: { id: 'addr-def' } });
      expect(mockPrisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-remaining' },
        data: { isDefault: true },
      });
      expect(result.replacementDefaultId).toBe('addr-remaining');
    });

    it('should allow customer to have 0 addresses when deleting only existing address', async () => {
      mockPrisma.address.findUnique.mockResolvedValueOnce({
        id: 'addr-sole',
        userId: 'user-1',
        isDefault: true,
      });
      mockPrisma.address.findFirst.mockResolvedValueOnce(null);

      const result = await service.deleteAddress('user-1', 'addr-sole');
      expect(mockPrisma.address.delete).toHaveBeenCalledWith({ where: { id: 'addr-sole' } });
      expect(mockPrisma.address.update).not.toHaveBeenCalled();
      expect(result.replacementDefaultId).toBeNull();
    });
  });
});
