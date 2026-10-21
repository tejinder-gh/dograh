import { BaseToolConnector, ConnectionTestResult, ConnectorExecutionParams } from './connector.interface';
import { safeFetch } from '../../utils/ssrf-guard';

export class PaymentConnector implements BaseToolConnector {
  readonly provider = 'stripe';

  async testConnection(
    credentials?: Record<string, unknown>,
    _metadata?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    const secretKey = (credentials?.secretKey || credentials?.apiKey) as string | undefined;

    if (!secretKey || typeof secretKey !== 'string') {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: 'Missing Stripe Secret Key in connection configuration. Provide a valid restricted key (rk_live_... or sk_live_...).',
      };
    }

    if (!secretKey.startsWith('sk_') && !secretKey.startsWith('rk_')) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: 'Invalid Stripe Secret Key format. Secret key must begin with "sk_live_", "sk_test_", or "rk_live_".',
      };
    }

    try {
      const res = await safeFetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${secretKey}` },
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        return {
          success: false,
          latencyMs: Date.now() - start,
          message: errBody.error?.message || `Stripe authentication failed with status ${res.status}.`,
        };
      }

      return {
        success: true,
        latencyMs: Date.now() - start,
        message: 'Stripe API key authenticated successfully. Account balance endpoint verified.',
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Failed to reach Stripe API server.',
      };
    }
  }

  async execute(params: ConnectorExecutionParams): Promise<Record<string, unknown>> {
    const { capabilityName, arguments: args, decryptedCredentials } = params;
    const secretKey = (decryptedCredentials?.secretKey || decryptedCredentials?.apiKey) as string | undefined;

    if (!secretKey) {
      throw new Error(
        '[STRIPE PAYMENT BLOCKED] No verified Stripe credentials configured for this tenant. ' +
        'Live payment operations are disabled until an authorized provider connection is established.'
      );
    }

    switch (capabilityName) {
      case 'create_payment_link': {
        const amountCents = Number(args.amountCents || 0);
        const description = String(args.description || 'Session Booking Fee');
        const customerEmail = typeof args.customerEmail === 'string' ? args.customerEmail : undefined;

        if (amountCents <= 0 || !Number.isInteger(amountCents)) {
          throw new Error('amountCents must be a positive integer value.');
        }

        const bodyParams = new URLSearchParams({
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][unit_amount]': String(amountCents),
          'line_items[0][price_data][product_data][name]': description,
          'line_items[0][quantity]': '1',
          mode: 'payment',
          success_url: 'https://billing.platform.internal/success?session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'https://billing.platform.internal/cancelled',
        });
        if (customerEmail) {
          bodyParams.append('customer_email', customerEmail);
        }

        const headers: Record<string, string> = {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        };
        if (params.idempotencyKey) {
          headers['Idempotency-Key'] = params.idempotencyKey;
        }

        const res = await safeFetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers,
          body: bodyParams.toString(),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `Stripe API checkout session creation failed (${res.status}).`);
        }

        const session = (await res.json()) as { id: string; url: string; expires_at: number };
        return {
          success: true,
          paymentId: session.id,
          checkoutUrl: session.url,
          amountCents,
          currency: 'usd',
          customerEmail,
          description,
          expiresAt: new Date(session.expires_at * 1000).toISOString(),
        };
      }

      case 'authorize_charge_on_call': {
        const amountCents = Number(args.amountCents || 0);
        const customerId = String(args.customerId || '');
        const chargeReason = String(args.chargeReason || 'On-call authorized deposit');

        if (amountCents <= 0 || !customerId) {
          throw new Error('Valid amountCents and customerId are required for on-call charge.');
        }

        const bodyParams = new URLSearchParams({
          amount: String(amountCents),
          currency: 'usd',
          customer: customerId,
          description: chargeReason,
          confirm: 'true',
        });

        const headers: Record<string, string> = {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        };
        if (params.idempotencyKey) {
          headers['Idempotency-Key'] = params.idempotencyKey;
        }

        const res = await safeFetch('https://api.stripe.com/v1/payment_intents', {
          method: 'POST',
          headers,
          body: bodyParams.toString(),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `Stripe on-call charge authorization failed (${res.status}).`);
        }

        const intent = (await res.json()) as { id: string; status: string };
        return {
          success: true,
          chargeId: intent.id,
          customerId,
          amountCents,
          status: intent.status,
          chargeReason,
          authorizedAt: new Date().toISOString(),
        };
      }

      default:
        throw new Error(`Unsupported capability "${capabilityName}" on PaymentConnector.`);
    }
  }
}
