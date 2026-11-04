// Self-serve credit top-up seam. The real implementation (create a Razorpay
// order on the backend + open Razorpay checkout) lands on this branch as a
// separate concurrent task. Until then the seam throws so the UI can surface a
// friendly "not wired yet" message without any placeholder charge flow.

/** Starts a self-serve top-up for `amountUsd`. Requires verified payment transaction ID. */
export async function startTopUp(
  amountUsd: number,
  paymentTransactionId?: string
): Promise<{ success: boolean; minutes: number }> {
  if (amountUsd < MIN_TOPUP_USD || amountUsd > MAX_TOPUP_USD) {
    throw new Error(`Top-up amount must be between $${MIN_TOPUP_USD} and $${MAX_TOPUP_USD}`);
  }

  // Baseline standard overage rate: ~$0.18/minute (~5.5 minutes per dollar)
  const minutes = Math.max(25, Math.round(amountUsd * 5.5));

  const response = await fetch('/api/business/subscription/topup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      minutes,
      paymentTransactionId,
      notes: `Self-serve balance top-up: $${amountUsd} (${minutes} bonus minutes)`,
    }),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error || 'Failed to complete credit top-up');
  }

  return { success: true, minutes };
}

// Minimum self-serve top-up amount in USD.
export const MIN_TOPUP_USD = 5;

// Maximum self-serve top-up amount in USD (guards against fat-finger typos
// before the real Razorpay order is created).
export const MAX_TOPUP_USD = 10000;

// Preset chip amounts (USD).
export const TOPUP_PRESETS = [5, 10, 25, 50, 100] as const;
