import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutService } from './checkout.service.js';

@Injectable()
export class CheckoutExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const isJobDisabled =
      this.config.get<string>('DISABLE_CHECKOUT_EXPIRY_JOB') === 'true';
    if (!isJobDisabled) {
      this.startExpiryLoop();
    } else {
      this.logger.log('Checkout expiry background loop is disabled via config.');
    }
  }

  onModuleDestroy() {
    this.stopExpiryLoop();
  }

  /**
   * Starts periodic polling loop for expired reservations.
   * Interval is configurable via CHECKOUT_EXPIRY_INTERVAL_MS (default 30,000 ms, min 1,000 ms).
   */
  startExpiryLoop() {
    const rawInterval = this.config.get<string>('CHECKOUT_EXPIRY_INTERVAL_MS');
    const parsedInterval = rawInterval ? parseInt(rawInterval, 10) : 30000;
    const intervalMs =
      Number.isInteger(parsedInterval) && parsedInterval >= 1000
        ? parsedInterval
        : 30000;

    this.logger.log(
      `Starting checkout expiry background loop with interval: ${intervalMs}ms`,
    );

    this.timer = setInterval(async () => {
      if (this.isRunning) return;
      this.isRunning = true;
      try {
        const stats = await this.checkoutService.releaseExpiredCheckouts();
        if (stats.releasedCount > 0) {
          this.logger.log(
            `Released ${stats.releasedCount} expired checkout reservation(s).`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Error in checkout expiry loop: ${err.message}`,
          err.stack,
        );
      } finally {
        this.isRunning = false;
      }
    }, intervalMs);

    // Allow node process to shut down cleanly if this timer is active
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  stopExpiryLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('Checkout expiry background loop stopped.');
    }
  }

  /**
   * Manual trigger method for test suits or admin endpoints without waiting.
   */
  async triggerExpiryCheck(overrideDate?: Date) {
    return this.checkoutService.releaseExpiredCheckouts(overrideDate);
  }
}
