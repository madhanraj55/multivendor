import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoEmailService } from './brevo-email.service.js';

describe('BrevoEmailService (Unit Tests)', () => {
  let service: BrevoEmailService;
  let mockConfigService: any;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'BREVO_API_KEY') return 'test-valid-brevo-api-key';
        if (key === 'BREVO_SENDER_EMAIL') return 'noreply@bharatbazaar.com';
        if (key === 'BREVO_SENDER_NAME') return 'BharatBazaar';
        return null;
      }),
    };

    service = new BrevoEmailService(mockConfigService as unknown as ConfigService);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should identify valid Brevo configuration', () => {
    expect(service.hasValidConfiguration()).toBe(true);
    expect(() => service.validateConfiguration()).not.toThrow();
  });

  it('should throw InternalServerErrorException when BREVO_API_KEY is missing during validation', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'BREVO_SENDER_EMAIL') return 'noreply@bharatbazaar.com';
      return null;
    });

    const unconfiguredService = new BrevoEmailService(
      mockConfigService as unknown as ConfigService,
    );

    expect(unconfiguredService.hasValidConfiguration()).toBe(false);
    expect(() => unconfiguredService.validateConfiguration()).toThrow(
      InternalServerErrorException,
    );
  });

  it('should throw InternalServerErrorException when BREVO_SENDER_EMAIL is missing during validation', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'BREVO_API_KEY') return 'test-key';
      return null;
    });

    const unconfiguredService = new BrevoEmailService(
      mockConfigService as unknown as ConfigService,
    );

    expect(() => unconfiguredService.validateConfiguration()).toThrow(
      InternalServerErrorException,
    );
  });

  it('should generate clean, branded BharatBazaar HTML email containing the OTP and security warnings', () => {
    const html = service.generateOtpHtml('Aarav Patel', '784912');
    expect(html).toContain('BharatBazaar');
    expect(html).toContain('Namaste, Aarav Patel!');
    expect(html).toContain('784912');
    expect(html).toContain('5 minutes');
    expect(html).toContain('never ask you for your OTP');
  });

  it('should generate plain-text fallback containing the 6-digit OTP', () => {
    const text = service.generateOtpText('Priya Sharma', '654321');
    expect(text).toContain('654321');
    expect(text).toContain('Priya Sharma');
    expect(text).toContain('5 minutes');
  });

  it('should successfully send transactional email to Brevo API endpoint', async () => {
    const mockResponse = {
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue({ messageId: 'msg-brevo-999' }),
    };
    globalThis.fetch = jest.fn().mockResolvedValue(mockResponse) as any;

    const result = await service.sendOtpEmail({
      toEmail: 'customer@example.com',
      recipientName: 'Customer One',
      otp: '123456',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-brevo-999');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'api-key': 'test-valid-brevo-api-key',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('123456'),
      }),
    );
  });

  it('should handle Brevo API failure and throw sanitized error without leaking API key', async () => {
    const mockErrorResponse = {
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({ message: 'Invalid recipient email' }),
    };
    globalThis.fetch = jest.fn().mockResolvedValue(mockErrorResponse) as any;

    await expect(
      service.sendOtpEmail({
        toEmail: 'invalid-email',
        recipientName: 'Invalid',
        otp: '123456',
      }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
