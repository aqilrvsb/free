export const BILLING_INCREMENT_MODES = ['full_block', 'block_plus_one'] as const;

export type BillingIncrementMode = (typeof BILLING_INCREMENT_MODES)[number];

export const DEFAULT_BILLING_INCREMENT_MODE: BillingIncrementMode = 'full_block';

export function normalizeBillingIncrementMode(value: string | null | undefined): BillingIncrementMode {
  if (!value) {
    return DEFAULT_BILLING_INCREMENT_MODE;
  }
  const normalized = value.trim().toLowerCase();
  return BILLING_INCREMENT_MODES.includes(normalized as BillingIncrementMode)
    ? (normalized as BillingIncrementMode)
    : DEFAULT_BILLING_INCREMENT_MODE;
}
