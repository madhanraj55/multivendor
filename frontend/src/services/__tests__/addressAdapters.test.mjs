import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Adapter converting backend Address schema to frontend UI Address model.
 */
function mapBackendAddressToUi(addr) {
  return {
    id: addr.id,
    name: addr.fullName,
    phone: addr.phone,
    type: 'HOME',
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
function mapUiAddressToCreatePayload(addr) {
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
function mapUiAddressToUpdatePayload(addr) {
  const payload = {};
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

describe('Stage 3B-1 Address Adapter & Validation Unit Tests', () => {
  const sampleBackendAddress = {
    id: 'addr-uuid-1',
    userId: 'user-uuid-1',
    addressType: 'SHIPPING',
    fullName: 'Aarav Patel',
    phone: '9876543210',
    addressLine1: 'Flat 402, Royal Palms, 100 Feet Rd',
    addressLine2: 'Indiranagar',
    landmark: 'Near Metro Pillar 42',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560038',
    isDefault: true,
    latitude: 12.9716,
    longitude: 77.5946,
    createdAt: '2026-10-13T12:00:00.000Z',
    updatedAt: '2026-10-13T12:00:00.000Z',
  };

  it('should map BackendAddress schema to UI Address model accurately', () => {
    const uiAddress = mapBackendAddressToUi(sampleBackendAddress);

    assert.strictEqual(uiAddress.id, 'addr-uuid-1');
    assert.strictEqual(uiAddress.name, 'Aarav Patel');
    assert.strictEqual(uiAddress.phone, '9876543210');
    assert.strictEqual(uiAddress.street, 'Flat 402, Royal Palms, 100 Feet Rd');
    assert.strictEqual(uiAddress.locality, 'Indiranagar');
    assert.strictEqual(uiAddress.city, 'Bengaluru');
    assert.strictEqual(uiAddress.state, 'Karnataka');
    assert.strictEqual(uiAddress.pincode, '560038');
    assert.strictEqual(uiAddress.isDefault, true);
  });

  it('should fallback to landmark when addressLine2 is missing', () => {
    const noLine2 = {
      ...sampleBackendAddress,
      addressLine2: null,
      landmark: 'Opposite Central Mall',
    };
    const uiAddress = mapBackendAddressToUi(noLine2);
    assert.strictEqual(uiAddress.locality, 'Opposite Central Mall');
  });

  it('should map UI address form fields to CreateAddressPayload satisfying backend DTO rules', () => {
    const uiInput = {
      name: 'Priya Sharma ',
      phone: '+91 98765 43210',
      type: 'HOME',
      street: 'House 12, Rose Garden ',
      locality: 'Koramangala 4th Block ',
      city: 'Bengaluru ',
      state: 'Karnataka ',
      pincode: '560034 ',
      isDefault: false,
    };

    const payload = mapUiAddressToCreatePayload(uiInput);

    assert.strictEqual(payload.fullName, 'Priya Sharma');
    assert.strictEqual(payload.phone, '9876543210'); // 10-digit clean
    assert.strictEqual(payload.addressLine1, 'House 12, Rose Garden');
    assert.strictEqual(payload.addressLine2, 'Koramangala 4th Block');
    assert.strictEqual(payload.city, 'Bengaluru');
    assert.strictEqual(payload.state, 'Karnataka');
    assert.strictEqual(payload.postalCode, '560034');
    assert.strictEqual(payload.addressType, 'SHIPPING');
    assert.strictEqual(payload.isDefault, false);
  });

  it('should map partial edits into UpdateAddressPayload preserving untouched fields', () => {
    const partialEdit = {
      name: 'Aarav M. Patel',
      city: 'Mysuru',
      pincode: '570001',
    };

    const payload = mapUiAddressToUpdatePayload(partialEdit);

    assert.strictEqual(payload.fullName, 'Aarav M. Patel');
    assert.strictEqual(payload.city, 'Mysuru');
    assert.strictEqual(payload.postalCode, '570001');
    assert.strictEqual(payload.phone, undefined);
    assert.strictEqual(payload.addressType, 'SHIPPING');
  });

  it('should validate Indian PIN code format against backend rule /^[1-9][0-9]{5}$/', () => {
    const pinRegex = /^[1-9][0-9]{5}$/;

    assert.strictEqual(pinRegex.test('560038'), true);
    assert.strictEqual(pinRegex.test('110001'), true);
    assert.strictEqual(pinRegex.test('056038'), false); // Starts with 0
    assert.strictEqual(pinRegex.test('56003'), false);  // 5 digits
    assert.strictEqual(pinRegex.test('5600389'), false); // 7 digits
    assert.strictEqual(pinRegex.test('560 038'), false); // Space
  });
});
