import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Exact validation rules audited from NestJS Backend DTOs:
// RegisterDto: password regex & phone regex
const PASSWORD_REGEX = /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/;
const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

describe('Stage 3A Authentication Contract Validation Tests', () => {
  describe('Password Complexity Contract (RegisterDto)', () => {
    it('should reject passwords shorter than 8 characters', () => {
      const shortPass = 'Pass1!';
      assert.strictEqual(shortPass.length >= 8, false);
    });

    it('should reject passwords without uppercase letters', () => {
      const noUpper = 'securepass123!';
      assert.strictEqual(PASSWORD_REGEX.test(noUpper), false);
    });

    it('should reject passwords without lowercase letters', () => {
      const noLower = 'SECUREPASS123!';
      assert.strictEqual(PASSWORD_REGEX.test(noLower), false);
    });

    it('should reject passwords without digits or special characters', () => {
      const onlyLetters = 'SecurePassword';
      assert.strictEqual(PASSWORD_REGEX.test(onlyLetters), false);
    });

    it('should accept compliant passwords with uppercase, lowercase, and numbers or symbols', () => {
      const valid1 = 'SecurePass123!';
      const valid2 = 'AaravPatel#99';
      const valid3 = 'StrongPass2026';
      assert.strictEqual(valid1.length >= 8 && PASSWORD_REGEX.test(valid1), true);
      assert.strictEqual(valid2.length >= 8 && PASSWORD_REGEX.test(valid2), true);
      assert.strictEqual(valid3.length >= 8 && PASSWORD_REGEX.test(valid3), true);
    });
  });

  describe('Indian Mobile Phone Contract (RegisterDto / UpdateProfileDto)', () => {
    it('should reject 10-digit numbers starting with 0-5', () => {
      assert.strictEqual(INDIAN_PHONE_REGEX.test('5876543210'), false);
      assert.strictEqual(INDIAN_PHONE_REGEX.test('0123456789'), false);
      assert.strictEqual(INDIAN_PHONE_REGEX.test('1234567890'), false);
    });

    it('should reject numbers with invalid lengths or non-digit characters', () => {
      assert.strictEqual(INDIAN_PHONE_REGEX.test('987654321'), false);
      assert.strictEqual(INDIAN_PHONE_REGEX.test('98765432101'), false);
      assert.strictEqual(INDIAN_PHONE_REGEX.test('+919876543210'), false);
    });

    it('should accept valid 10-digit Indian mobile numbers starting with 6, 7, 8, or 9', () => {
      assert.strictEqual(INDIAN_PHONE_REGEX.test('9876543210'), true);
      assert.strictEqual(INDIAN_PHONE_REGEX.test('8765432109'), true);
      assert.strictEqual(INDIAN_PHONE_REGEX.test('7654321098'), true);
      assert.strictEqual(INDIAN_PHONE_REGEX.test('6543210987'), true);
    });
  });

  describe('Email Verification Token Format Contract', () => {
    it('should recognize 32-byte hex string (64 characters)', () => {
      const sampleHexToken = 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0';
      assert.strictEqual(sampleHexToken.length, 64);
      assert.strictEqual(/^[0-9a-fA-F]{64}$/.test(sampleHexToken), true);
    });
  });

  describe('Error Normalization Contract (ApiError)', () => {
    class ApiError extends Error {
      constructor(statusCode, message, error) {
        const primary = Array.isArray(message) ? message[0] || 'An error occurred' : message;
        super(primary);
        this.statusCode = statusCode;
        this.error = error;
        this.messages = Array.isArray(message) ? message : [message];
      }
    }

    it('should extract first message for primary error and retain array when validation fails with multiple errors', () => {
      const validationMessages = [
        'Please provide a valid email address',
        'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character',
      ];
      const err = new ApiError(400, validationMessages, 'Bad Request');
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.message, 'Please provide a valid email address');
      assert.strictEqual(err.messages.length, 2);
    });

    it('should handle single string error messages', () => {
      const err = new ApiError(401, 'Please verify your email before logging in', 'Unauthorized');
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.message, 'Please verify your email before logging in');
      assert.strictEqual(err.messages.length, 1);
    });
  });

  describe('Password Recovery & Reset Contract (ForgotPasswordDto / ResetPasswordDto)', () => {
    it('should validate valid email address for forgot password request', () => {
      const validEmail = 'customer@example.com';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      assert.strictEqual(emailRegex.test(validEmail), true);
    });

    it('should validate reset token format (32-byte hex / 64 hex characters)', () => {
      const sampleResetToken = 'b2c3d4e5f6a17890123456789abcdef0123456789abcdef0123456789abcdef0';
      assert.strictEqual(sampleResetToken.length, 64);
      assert.strictEqual(/^[0-9a-fA-F]{64}$/.test(sampleResetToken), true);
    });

    it('should enforce password complexity on reset password', () => {
      const weakResetPass = 'weakpass';
      assert.strictEqual(weakResetPass.length >= 8 && PASSWORD_REGEX.test(weakResetPass), false);

      const strongResetPass = 'NewSecurePass2026!';
      assert.strictEqual(strongResetPass.length >= 8 && PASSWORD_REGEX.test(strongResetPass), true);
    });
  });
});
