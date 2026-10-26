import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendOtpEmailParams {
  toEmail: string;
  recipientName?: string;
  otp: string;
}

export interface BrevoEmailResponse {
  messageId?: string;
  success: boolean;
}

@Injectable()
export class BrevoEmailService {
  private readonly logger = new Logger(BrevoEmailService.name);
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('BREVO_API_KEY')?.trim() || '';
    this.senderEmail = this.configService.get<string>('BREVO_SENDER_EMAIL')?.trim() || '';
    this.senderName = this.configService.get<string>('BREVO_SENDER_NAME')?.trim() || 'BharatBazaar';

    this.isConfigured = Boolean(
      this.apiKey &&
      this.apiKey !== 'your-brevo-api-key' &&
      this.apiKey !== 'xkeysib-placeholder-change-in-production' &&
      this.senderEmail
    );

    if (!this.isConfigured) {
      this.logger.warn(
        'Brevo email integration is not fully configured. Missing valid BREVO_API_KEY or BREVO_SENDER_EMAIL. ' +
        'Emails will fail to dispatch until credentials are provided.',
      );
    }
  }

  /**
   * Checks whether Brevo is properly configured with environment variables.
   */
  public hasValidConfiguration(): boolean {
    return this.isConfigured;
  }

  /**
   * Validates configuration and throws a clear error if missing.
   */
  public validateConfiguration(): void {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'Brevo configuration error: BREVO_API_KEY is not defined in backend environment variables.',
      );
    }
    if (!this.senderEmail) {
      throw new InternalServerErrorException(
        'Brevo configuration error: BREVO_SENDER_EMAIL is not defined in backend environment variables.',
      );
    }
  }

  /**
   * Generates a clean, branded BharatBazaar HTML email for OTP verification.
   */
  public generateOtpHtml(recipientName: string, otp: string): string {
    const safeName = recipientName || 'Valued Customer';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BharatBazaar Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 32px 30px; text-align: center; border-bottom: 3px solid #f97316;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                Bharat<span style="color: #f97316;">Bazaar</span>
              </h1>
              <p style="margin: 6px 0 0; font-size: 13px; color: #cbd5e1; text-transform: uppercase; letter-spacing: 1px;">
                Artisan & Multi-Vendor Marketplace
              </p>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #0f172a;">
                Namaste, ${safeName}!
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #475569;">
                Thank you for joining <strong>BharatBazaar</strong>. To complete your registration and activate your account, please use the 6-digit email verification code below:
              </p>

              <!-- OTP Display Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="background-color: #fff7ed; border: 2px dashed #f97316; border-radius: 10px; padding: 22px 30px; display: inline-block;">
                      <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #ea580c; display: block; margin-left: 10px;">
                        ${otp}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Expiry Alert -->
              <div style="background-color: #f1f5f9; border-left: 4px solid #f97316; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 13.5px; color: #334155; line-height: 1.5;">
                  ⏱️ <strong>This verification code will expire in 5 minutes.</strong> For security purposes, each code can only be used once.
                </p>
              </div>

              <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: #64748b;">
                If you did not attempt to register or request this code on BharatBazaar, you can safely ignore this email. No changes will be made to any account.
              </p>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                ⚠️ <em>Security note: BharatBazaar staff will never ask you for your OTP, password, or financial details.</em>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #64748b;">
                © 2026 BharatBazaar Marketplace. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                This is an automated transactional message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Generates a plain-text fallback for email clients without HTML support.
   */
  public generateOtpText(recipientName: string, otp: string): string {
    const safeName = recipientName || 'Valued Customer';
    return `Namaste, ${safeName}!

Your BharatBazaar email verification code is: ${otp}

This code is valid for 5 minutes. Please enter it on the verification page to activate your account.

If you did not request this code, please disregard this email.
Never share your verification code with anyone.

© 2026 BharatBazaar Marketplace.`;
  }

  /**
   * Sends a branded transactional OTP email through Brevo's REST API.
   */
  async sendOtpEmail(params: SendOtpEmailParams): Promise<BrevoEmailResponse> {
    const { toEmail, recipientName, otp } = params;

    // Validate configuration
    this.validateConfiguration();

    const subject = `[BharatBazaar] Your Verification Code: ${otp}`;
    const htmlContent = this.generateOtpHtml(recipientName || '', otp);
    const textContent = this.generateOtpText(recipientName || '', otp);

    const payload = {
      sender: {
        name: this.senderName,
        email: this.senderEmail,
      },
      to: [
        {
          email: toEmail,
          name: recipientName || toEmail,
        },
      ],
      subject,
      htmlContent,
      textContent,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorDetails = '';
        try {
          const errorJson = (await response.json()) as any;
          errorDetails = errorJson?.message || JSON.stringify(errorJson);
        } catch {
          errorDetails = await response.text();
        }

        this.logger.error(
          `Brevo email delivery failed with status ${response.status}: ${errorDetails}`,
        );
        throw new InternalServerErrorException(
          `Failed to deliver verification email via Brevo: ${errorDetails || response.statusText}`,
        );
      }

      const data = (await response.json()) as { messageId?: string };
      this.logger.log(
        `Successfully dispatched OTP verification email to ${toEmail} via Brevo (messageId: ${data?.messageId || 'unknown'})`,
      );

      return {
        messageId: data?.messageId,
        success: true,
      };
    } catch (err: any) {
      if (err instanceof InternalServerErrorException) {
        throw err;
      }
      if (err?.name === 'AbortError') {
        this.logger.error(`Brevo API request timed out after 10000ms for ${toEmail}`);
        throw new InternalServerErrorException(
          'Email delivery request timed out. Please try resending in a few moments.',
        );
      }
      this.logger.error(`Error sending email through Brevo: ${err?.message || err}`);
      throw new InternalServerErrorException(
        `Unable to dispatch verification email. Please check your Brevo configuration or network connectivity.`,
      );
    }
  }
}
