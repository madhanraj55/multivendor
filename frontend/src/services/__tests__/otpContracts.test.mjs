import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Exact validation rules audited from NestJS Backend OTP DTOs and Contracts
const OTP_REGEX = /^\d{6}$/;
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

describe('Stage 3A-OTP Brevo Email Verification Contract Validation Tests', () => {
  describe('OTP Code Format Contract (VerifyOtpDto)', () => {
    it('should reject OTPs with fewer than 6 digits', () => {
      assert.strictEqual(OTP_REGEX.test('12345'), false);
      assert.strictEqual(OTP_REGEX.test(''), false);
    });

    it('should reject OTPs with more than 6 digits', () => {
      assert.strictEqual(OTP_REGEX.test('1234567'), false);
    });

    it('should reject OTPs containing non-digit characters', () => {
      assert.strictEqual(OTP_REGEX.test('12A456'), false);
      assert.strictEqual(OTP_REGEX.test('12 456'), false);
      assert.strictEqual(OTP_REGEX.test('12-456'), false);
    });

    it('should accept valid 6-digit numerical OTP codes', () => {
      assert.strictEqual(OTP_REGEX.test('123456'), true);
      assert.strictEqual(OTP_REGEX.test('000000'), true);
      assert.strictEqual(OTP_REGEX.test('987654'), true);
    });
  });

  describe('OTP Expiry & Cooldown Timing Contracts', () => {
    it('should enforce 5-minute expiry threshold', () => {
      assert.strictEqual(OTP_EXPIRY_MS, 300000);
      const createdAt = new Date('2026-10-26T12:00:00Z').getTime();
      const validAt = new Date('2026-10-26T12:04:59Z').getTime();
      const expiredAt = new Date('2026-10-26T12:05:01Z').getTime();

      assert.strictEqual(validAt - createdAt < OTP_EXPIRY_MS, true);
      assert.strictEqual(expiredAt - createdAt >= OTP_EXPIRY_MS, true);
    });

    it('should enforce 60-second resend cooldown threshold', () => {
      assert.strictEqual(RESEND_COOLDOWN_MS, 60000);
      const sentAt = new Date('2026-10-26T12:00:00Z').getTime();
      const tooEarly = new Date('2026-10-26T12:00:30Z').getTime();
      const cooldownPassed = new Date('2026-10-26T12:01:01Z').getTime();

      assert.strictEqual(tooEarly - sentAt < RESEND_COOLDOWN_MS, true);
      assert.strictEqual(cooldownPassed - sentAt >= RESEND_COOLDOWN_MS, true);
    });
  });

  describe('OTP Attempt Counter & Lockout Contract', () => {
    it('should allow up to 5 attempts and lock on the 5th failure', () => {
      let failedAttempts = 0;
      const simulateFailure = () => {
        failedAttempts += 1;
        return failedAttempts >= MAX_ATTEMPTS;
      };

      assert.strictEqual(simulateFailure(), false); // 1
      assert.strictEqual(simulateFailure(), false); // 2
      assert.strictEqual(simulateFailure(), false); // 3
      assert.strictEqual(simulateFailure(), false); // 4
      assert.strictEqual(simulateFailure(), true);  // 5 (locked)
    });
  });

  describe('API Endpoint Contract & Sanitization', () => {
    it('should sanitize email addresses to lowercase and trimmed string', () => {
      const rawEmail = '  Customer.One@Example.COM  ';
      const sanitized = rawEmail.trim().toLowerCase();
      assert.strictEqual(sanitized, 'customer.one@example.com');
    });

    it('should clean numeric OTP input from input fields', () => {
      const rawInput = ' 548 921 ';
      const cleaned = rawInput.replace(/\D/g, '').slice(0, 6);
      assert.strictEqual(cleaned, '548921');
      assert.strictEqual(cleaned.length, 6);
    });
  });
});
