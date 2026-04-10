import { dbService } from './database';
import { notificationChannelService } from './notification-channel';
import {
  NotificationRule,
  NotificationChannel,
  LowestInDaysParams,
  BelowThresholdParams,
  PercentageDropParams,
} from '../models/types';

export class NotificationEvaluator {
  /**
   * Evaluate all applicable rules for a product after a price update
   */
  async evaluateProduct(userId: number, productId: number, currentPrice: number): Promise<void> {
    try {
      // Skip disabled users
      const user = await dbService.getUserById(userId);
      if (!user || user.is_disabled) {
        return;
      }

      // Fetch applicable rules (global + per-product)
      const allRules = await dbService.getNotificationRules(userId, productId);
      if (allRules.length === 0) {
        return;
      }

      // Separate global and per-product rules
      const globalRules = allRules.filter(r => r.product_id === null);
      const perProductRules = allRules.filter(r => r.product_id === productId);

      // Build final rule set (per-product overrides global of same type)
      const rulesToEvaluate = [...globalRules];
      for (const perProductRule of perProductRules) {
        const existingIndex = rulesToEvaluate.findIndex(r => r.type === perProductRule.type);
        if (existingIndex >= 0) {
          rulesToEvaluate[existingIndex] = perProductRule; // Override
        } else {
          rulesToEvaluate.push(perProductRule); // Add new
        }
      }

      // Evaluate each enabled rule
      for (const rule of rulesToEvaluate) {
        if (!rule.enabled) continue;

        const triggered = await this.evaluateRule(rule, productId, currentPrice);
        if (triggered) {
          await this.sendNotification(rule, productId, currentPrice);
        }
      }
    } catch (error) {
      console.error(`Error evaluating notifications for user ${userId}, product ${productId}:`, error);
    }
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateRule(
    rule: NotificationRule,
    productId: number,
    currentPrice: number
  ): Promise<boolean> {
    switch (rule.type) {
      case 'lowest_in_days':
        return this.evaluateLowestInDays(productId, currentPrice, (rule.params as LowestInDaysParams).days);
      case 'below_threshold':
        return this.evaluateBelowThreshold(currentPrice, (rule.params as BelowThresholdParams).threshold);
      case 'percentage_drop':
        const params = rule.params as PercentageDropParams;
        return this.evaluatePercentageDrop(productId, currentPrice, params.percentage, params.window_days);
      default:
        return false;
    }
  }

  /**
   * Evaluate "lowest in N days" trigger
   */
  private async evaluateLowestInDays(
    productId: number,
    currentPrice: number,
    days: number
  ): Promise<boolean> {
    const lowestPrice = await dbService.getLowestPriceInDays(productId, days);
    // Skip if no price history
    if (lowestPrice === null) return false;
    // Trigger if current price is the lowest
    return currentPrice <= lowestPrice;
  }

  /**
   * Evaluate "below threshold" trigger
   */
  private evaluateBelowThreshold(currentPrice: number, threshold: number): boolean {
    return currentPrice < threshold;
  }

  /**
   * Evaluate "percentage drop" trigger
   */
  private async evaluatePercentageDrop(
    productId: number,
    currentPrice: number,
    percentage: number,
    windowDays: number
  ): Promise<boolean> {
    const highestPrice = await dbService.getHighestPriceInDays(productId, windowDays);
    // Skip if no price history
    if (highestPrice === null) return false;
    // Calculate drop percentage
    const dropPercent = ((highestPrice - currentPrice) / highestPrice) * 100;
    return dropPercent >= percentage;
  }

  /**
   * Send notification for a triggered rule
   */
  private async sendNotification(
    rule: NotificationRule,
    productId: number,
    currentPrice: number
  ): Promise<void> {
    // Check de-duplication (same rule + product within 24 hours)
    const recent = await dbService.getRecentNotification(rule.id, productId, 24);
    if (recent) {
      console.log(`Notification already sent recently for rule ${rule.id}, product ${productId}`);
      return;
    }

    // Get channel and product info
    const channel = await dbService.getNotificationChannel(rule.user_id, rule.channel_id);
    if (!channel || !channel.enabled) {
      console.log(`Channel ${rule.channel_id} not found or disabled`);
      return;
    }

    const product = await dbService.getProductById(productId, rule.user_id);
    if (!product) return;

    // Build trigger description
    const triggerDescription = this.getTriggerDescription(rule, currentPrice);

    const payload = {
      productName: product.description,
      asin: product.asin,
      currentPrice,
      triggerDescription,
      productUrl: `https://www.amazon.com.br/dp/${product.asin}`,
    };

    // Send notification
    let status: 'sent' | 'failed' = 'sent';
    let errorMessage: string | null = null;

    try {
      await notificationChannelService.send(channel, payload);
      console.log(`✓ Notification sent via ${channel.type} for ${product.asin}`);
    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`✗ Notification failed via ${channel.type} for ${product.asin}:`, error);
    }

    // Log to notification history
    await dbService.logNotification({
      user_id: rule.user_id,
      rule_id: rule.id,
      product_id: productId,
      channel_id: rule.channel_id,
      trigger_type: rule.type,
      message: `${triggerDescription} - Price: R$ ${currentPrice.toFixed(2)}`,
      status,
      error_message: errorMessage ?? undefined,
    });
  }

  /**
   * Get human-readable trigger description
   */
  private getTriggerDescription(rule: NotificationRule, currentPrice: number): string {
    switch (rule.type) {
      case 'lowest_in_days': {
        const days = (rule.params as LowestInDaysParams).days;
        return `Lowest price in ${days} days`;
      }
      case 'below_threshold': {
        const threshold = (rule.params as BelowThresholdParams).threshold;
        return `Price below R$ ${threshold.toFixed(2)}`;
      }
      case 'percentage_drop': {
        const params = rule.params as PercentageDropParams;
        return `Price dropped ${params.percentage}% from high`;
      }
      default:
        return 'Price alert';
    }
  }
}

export const notificationEvaluator = new NotificationEvaluator();
