import "server-only"

import { getStripeClient } from "./client"
import { getOrCreateCustomer } from "./customer"
import { APP } from "./events/app-guard"

// Locus Remote credit packs are prepaid one-time purchases that sit on top of
// any license state (ADR-0010) — free, trial, and paid users can all buy them.
//
// Amounts deliberately live in Stripe, never in code: locus-api resolves the
// same allowlist of price IDs and reads unit_amount live, and the Mac app is
// explicit that "pack amounts come from Stripe via the API". This module
// mirrors that contract so a purchase started on the web is indistinguishable
// from one started in the app by the time it reaches the ledger.

export type CreditPack = {
  priceId: string
  unitAmountCents: number
  currency: string
}

export class CreditPriceConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CreditPriceConfigurationError"
  }
}

const PACK_CACHE_TTL_MS = 10 * 60 * 1000
const CHECKOUT_EXPIRY_S = 30 * 60

const packCache = new Map<string, { pack: CreditPack; expiresAtMs: number }>()

// Exported for tests — a stale module-level cache would leak across cases.
export function clearCreditPackCache(): void {
  packCache.clear()
}

export function loadCreditPriceIds(
  env: Record<string, string | undefined> = process.env
): string[] {
  return (env.STRIPE_CREDIT_PRICE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

export async function resolveCreditPack(
  priceId: string,
  now: () => number = Date.now
): Promise<CreditPack> {
  const cached = packCache.get(priceId)
  if (cached && cached.expiresAtMs > now()) {
    return cached.pack
  }

  const price = await getStripeClient().prices.retrieve(priceId)

  if (!price.active || price.type !== "one_time" || price.unit_amount === null) {
    throw new CreditPriceConfigurationError(
      `Stripe credit price ${price.id} must be an active one-time fixed price`
    )
  }
  if (price.currency.toLowerCase() !== "usd") {
    throw new CreditPriceConfigurationError(
      `Stripe credit price ${price.id} must use USD; found ${price.currency}`
    )
  }
  if (!Number.isSafeInteger(price.unit_amount) || price.unit_amount <= 0) {
    throw new CreditPriceConfigurationError(
      `Stripe credit price ${price.id} must have a positive integer unit_amount`
    )
  }

  const pack: CreditPack = {
    priceId: price.id,
    unitAmountCents: price.unit_amount,
    currency: "usd",
  }
  packCache.set(priceId, { pack, expiresAtMs: now() + PACK_CACHE_TTL_MS })
  return pack
}

// One bad price ID must not take the whole card down — skip it and sell the
// rest. Returns packs in STRIPE_CREDIT_PRICE_IDS order, which is display order.
export async function listCreditPacks(
  env: Record<string, string | undefined> = process.env
): Promise<CreditPack[]> {
  const priceIds = loadCreditPriceIds(env)
  const packs = await Promise.all(
    priceIds.map(async (priceId) => {
      try {
        return await resolveCreditPack(priceId)
      } catch (error) {
        console.error(
          `[credits] skipping invalid Stripe credit price ${priceId}`,
          error
        )
        return null
      }
    })
  )
  return packs.filter((pack): pack is CreditPack => pack !== null)
}

export type CreateCreditCheckoutSessionParams = {
  userId: string
  email: string
  priceId: string
  purchaseIntentId: string
  origin: string
  now?: Date
}

export async function createCreditCheckoutSession({
  userId,
  email,
  priceId,
  purchaseIntentId,
  origin,
  now,
}: CreateCreditCheckoutSessionParams): Promise<{ url: string }> {
  const pack = await resolveCreditPack(priceId)
  const customerId = await getOrCreateCustomer({ userId, email })

  const stripe = getStripeClient()
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      // The webhook grants against these fields, not against the price as it
      // stands at settlement time — a later Stripe price edit cannot
      // retroactively change what an already-signed session is worth.
      metadata: {
        app: APP,
        locus_credit_purchase: "true",
        user_id: userId,
        credit_price_id: priceId,
        credit_amount_cents: String(pack.unitAmountCents),
      },
      // A one-time charge takes its statement descriptor from the PaymentIntent
      // (subscription renewals take theirs from the Product instead). The
      // account prefix "STL" is prepended by Stripe: "STL* LOCUS APP".
      payment_intent_data: {
        metadata: { app: APP, locus_credit_purchase: "true", user_id: userId },
        statement_descriptor_suffix: "LOCUS APP",
      },
      success_url: `${origin}/account?credits=pending`,
      cancel_url: `${origin}/account`,
      expires_at:
        Math.floor((now ?? new Date()).getTime() / 1000) + CHECKOUT_EXPIRY_S,
      // Credit packs are USD-only, deliberately, and unlike the subscription
      // path (which is multi-currency as of 2026-09-04). No adaptive_pricing:
      // its conversion rate is Stripe's, so the USD actually received for a
      // fixed dollar amount of compute would float. No BRL `currency_options`
      // either, for the same reason — credits buy real dollar-denominated
      // compute, and a frozen BRL amount goes underwater as BRL weakens.
      //
      // Consequence: because the Stripe account is Brazilian, BR-issued cards
      // cannot buy packs at all — they route on domestic rails, which settle
      // only in BRL. Revisit via scripts/stripe/add-currency.mjs --only packs.
    },
    { idempotencyKey: purchaseIntentId }
  )

  if (!session.url) {
    throw new Error("Stripe Checkout did not return a redirect URL")
  }

  return { url: session.url }
}
