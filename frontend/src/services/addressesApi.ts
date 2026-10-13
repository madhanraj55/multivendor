import { apiClient } from './apiClient.ts';
import type {
  Address,
  BackendAddress,
  CreateAddressPayload,
  UpdateAddressPayload,
  SetDefaultAddressResponse,
  DeleteAddressResponse,
} from '../types/index.ts';

/**
 * Adapter converting backend Address schema to frontend UI Address model.
 */
export function mapBackendAddressToUi(addr: BackendAddress): Address {
  return {
    id: addr.id,
    name: addr.fullName,
    phone: addr.phone,
    type: 'HOME', // UI display categorization
    street: addr.addressLine1,
    locality: addr.addressLine2 || addr.landmark || '',
    city: addr.city,
    state: addr.state,
    pincode: addr.postalCode,
    isDefault: addr.isDefault,
  };
}

/**
 * Adapter converting frontend UI Address fields to backend CreateAddressDto.
 */
export function mapUiAddressToCreatePayload(
  addr: Omit<Address, 'id'>,
): CreateAddressPayload {
  return {
    fullName: addr.name.trim(),
    phone: addr.phone.replace(/\D/g, '').slice(-10),
    addressLine1: addr.street.trim(),
    addressLine2: addr.locality ? addr.locality.trim() : undefined,
    city: addr.city.trim(),
    state: addr.state.trim(),
    postalCode: addr.pincode.trim(),
    addressType: 'SHIPPING',
    isDefault: addr.isDefault,
  };
}

/**
 * Adapter converting frontend UI Address fields to backend UpdateAddressDto.
 */
export function mapUiAddressToUpdatePayload(
  addr: Partial<Address>,
): UpdateAddressPayload {
  const payload: UpdateAddressPayload = {};
  if (addr.name !== undefined) payload.fullName = addr.name.trim();
  if (addr.phone !== undefined) payload.phone = addr.phone.replace(/\D/g, '').slice(-10);
  if (addr.street !== undefined) payload.addressLine1 = addr.street.trim();
  if (addr.locality !== undefined) payload.addressLine2 = addr.locality.trim() || undefined;
  if (addr.city !== undefined) payload.city = addr.city.trim();
  if (addr.state !== undefined) payload.state = addr.state.trim();
  if (addr.pincode !== undefined) payload.postalCode = addr.pincode.trim();
  if (addr.isDefault !== undefined) payload.isDefault = addr.isDefault;
  payload.addressType = 'SHIPPING';
  return payload;
}

export const addressesApi = {
  /**
   * GET /api/v1/addresses
   * Retrieves all customer addresses, default address first.
   */
  async getAddresses(): Promise<BackendAddress[]> {
    return apiClient.request<BackendAddress[]>('/addresses', {
      method: 'GET',
    });
  },

  /**
   * GET /api/v1/addresses/:id
   * Retrieves a single address by ID.
   */
  async getAddressById(id: string): Promise<BackendAddress> {
    return apiClient.request<BackendAddress>(`/addresses/${id}`, {
      method: 'GET',
    });
  },

  /**
   * POST /api/v1/addresses
   * Creates a new customer address.
   */
  async createAddress(payload: CreateAddressPayload): Promise<BackendAddress> {
    return apiClient.request<BackendAddress>('/addresses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * PATCH /api/v1/addresses/:id
   * Updates an existing customer address.
   */
  async updateAddress(id: string, payload: UpdateAddressPayload): Promise<BackendAddress> {
    return apiClient.request<BackendAddress>(`/addresses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * PATCH /api/v1/addresses/:id/default
   * Idempotently marks target address as default and unmarks all others.
   */
  async setDefaultAddress(id: string): Promise<SetDefaultAddressResponse> {
    return apiClient.request<SetDefaultAddressResponse>(`/addresses/${id}/default`, {
      method: 'PATCH',
    });
  },

  /**
   * DELETE /api/v1/addresses/:id
   * Deletes an address and automatically designates replacement default if needed.
   */
  async deleteAddress(id: string): Promise<DeleteAddressResponse> {
    return apiClient.request<DeleteAddressResponse>(`/addresses/${id}`, {
      method: 'DELETE',
    });
  },
};
