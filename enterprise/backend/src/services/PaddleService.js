const axios = require('axios');
const crypto = require('crypto');
const { logger } = require('~/config');

class PaddleService {
  constructor() {
    this.apiKey = process.env.PADDLE_API_KEY;
    this.environment = process.env.PADDLE_ENVIRONMENT || 'sandbox';
    this.webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

    this.baseURL =
      this.environment === 'production'
        ? 'https://api.paddle.com'
        : 'https://sandbox-api.paddle.com';

    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createCheckout({ priceId, customerId, customerEmail, customData }) {
    try {
      const payload = {
        items: [{ price_id: priceId, quantity: 1 }],
      };

      if (customerId) {
        payload.customer_id = customerId;
      } else if (customerEmail) {
        payload.customer = { email: customerEmail };
      }

      if (customData) {
        payload.custom_data = customData;
      }

      const response = await this.axiosInstance.post('/transactions', payload);

      return {
        data: response.data.data || response.data,
        checkout: {
          id: response.data.data?.id || response.data.id,
          url: response.data.data?.checkout?.url || response.data.data?.checkout_url,
        },
      };
    } catch (error) {
      logger.error('[PaddleService] Create checkout error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(
        `Failed to create Paddle checkout: ${error.response?.data?.detail || error.message}`,
      );
    }
  }

  async getSubscription(subscriptionId) {
    try {
      const response = await this.axiosInstance.get(`/subscriptions/${subscriptionId}`);
      return response.data.data;
    } catch (error) {
      logger.error(
        '[PaddleService] Get subscription error:',
        error.response?.data || error.message,
      );
      throw new Error(`Failed to get subscription: ${error.message}`);
    }
  }

  async cancelSubscription(subscriptionId, immediately = false) {
    try {
      const payload = {
        effective_from: immediately ? 'immediately' : 'next_billing_period',
      };
      const response = await this.axiosInstance.post(
        `/subscriptions/${subscriptionId}/cancel`,
        payload,
      );
      return response.data.data;
    } catch (error) {
      logger.error(
        '[PaddleService] Cancel subscription error:',
        error.response?.data || error.message,
      );
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  async resumeSubscription(subscriptionId) {
    try {
      const response = await this.axiosInstance.post(`/subscriptions/${subscriptionId}/resume`, {});
      return response.data.data;
    } catch (error) {
      logger.error(
        '[PaddleService] Resume subscription error:',
        error.response?.data || error.message,
      );
      throw new Error(`Failed to resume subscription: ${error.message}`);
    }
  }

  async updateSubscription(
    subscriptionId,
    newPriceId,
    prorationBillingMode = 'prorated_immediately',
  ) {
    try {
      const payload = {
        items: [{ price_id: newPriceId, quantity: 1 }],
        proration_billing_mode: prorationBillingMode,
      };
      const response = await this.axiosInstance.patch(`/subscriptions/${subscriptionId}`, payload);
      return response.data.data;
    } catch (error) {
      logger.error(
        '[PaddleService] Update subscription error:',
        error.response?.data || error.message,
      );
      throw new Error(`Failed to update subscription: ${error.message}`);
    }
  }

  async getCustomer(customerId) {
    try {
      const response = await this.axiosInstance.get(`/customers/${customerId}`);
      return response.data.data;
    } catch (error) {
      logger.error('[PaddleService] Get customer error:', error.response?.data || error.message);
      throw new Error(`Failed to get customer: ${error.message}`);
    }
  }

  async getCustomerTransactions(customerId) {
    try {
      const response = await this.axiosInstance.get('/transactions', {
        params: { customer_id: customerId },
      });
      return response.data.data || [];
    } catch (error) {
      logger.error(
        '[PaddleService] Get transactions error:',
        error.response?.data || error.message,
      );
      throw new Error(`Failed to get transactions: ${error.message}`);
    }
  }

  verifyWebhookSignature(signature, body) {
    try {
      if (!this.webhookSecret) {
        logger.warn('[PaddleService] Webhook secret not configured');
        return false;
      }

      const parts = signature.split(';');
      const timestamp = parts.find((p) => p.startsWith('ts='))?.split('=')[1];
      const receivedSignature = parts.find((p) => p.startsWith('h1='))?.split('=')[1];

      if (!timestamp || !receivedSignature) {
        return false;
      }

      const signedPayload = `${timestamp}:${JSON.stringify(body)}`;
      const hmac = crypto.createHmac('sha256', this.webhookSecret);
      hmac.update(signedPayload);
      const computedSignature = hmac.digest('hex');

      return crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(computedSignature));
    } catch (error) {
      logger.error('[PaddleService] Webhook signature verification error:', error);
      return false;
    }
  }

  getPriceId(plan, billingCycle) {
    const envKey = `PADDLE_PRICE_${plan.toUpperCase()}_${billingCycle.toUpperCase()}`;
    const priceId = process.env[envKey];

    if (!priceId) {
      throw new Error(`Price ID not configured for ${plan} ${billingCycle}`);
    }

    return priceId;
  }
}

module.exports = new PaddleService();
