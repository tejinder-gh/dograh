// Self-serve credit top-up seam. The real implementation (create a Razorpay
// order on the backend + open Razorpay checkout) lands on this branch as a
// separate concurrent task. Until then the seam throws so the UI can surface a
// friendly "not wired yet" message without any placeholder charge flow.

/** Starts a self-serve top-up for `amountUsd`. Disabled pending direct payment gateway integration. */
export async function startTopUp(
  amountUsd: number,
  _paymentTransactionId?: string
): Promise<{ success: boolean; minutes: number }> {
  if (amountUsd < MIN_TOPUP_USD || amountUsd > MAX_TOPUP_USD) {
    throw new Error(`Top-up amount must be between $${MIN_TOPUP_USD} and $${MAX_TOPUP_USD}`);
  }

  // Final P0 Security Rule: Client-declared payment transactions are untrusted.
  // Self-serve balance top-up is disabled pending direct payment gateway integration.
  throw new Error(
    'Self-service credit top-up is disabled pending direct payment gateway integration. ' +
    'Entitlements must be granted by platform administration for controlled pilots.'
  );
}

// Minimum self-serve top-up amount in USD.
export const MIN_TOPUP_USD = 5;

// Maximum self-serve top-up amount in USD (guards against fat-finger typos
// before the real Razorpay order is created).
export const MAX_TOPUP_USD = 10000;

// Preset chip amounts (USD).
export const TOPUP_PRESETS = [5, 10, 25, 50, 100] as const;
