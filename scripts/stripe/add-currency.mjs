#!/usr/bin/env node
// Add a BRL amount to every Locus USD Price via `currency_options`.
//
// Why this is needed: this Stripe account is Brazilian (account.country = BR).
// Brazilian-issued cards route on domestic rails, and domestic Brazilian rails
// settle only in BRL — so a BR card cannot be charged in USD here at all.
// Stripe rejects it on the BIN before the issuer ever sees it ("Your card
// doesn't support this currency"). Giving each Price a BRL option is what makes
// the domestic route legal.
//
// Rate-driven on purpose: one --rate keeps the subscription and every credit
// pack on a single consistent BRL/USD ratio. Credit packs especially must stay
// proportional — a pack's BRL amount is what a Brazilian pays for a fixed
// dollar amount of AI compute.
//
// SAFE FOR THE CREDIT LEDGER: locus-api grants credits from
// `session.metadata.credit_amount_cents`, written at checkout-creation from the
// price's base USD `unit_amount`, with `currency: "usd"` hardcoded. It never
// reads `amount_total`. So a BRL purchase still grants the USD amount.
//
// NOTE: `currency_options` amounts are fixed prices, not an FX conversion.
// Stripe never re-rates them. If BRL moves materially, re-run with a new --rate.
//
// Only touches products tagged metadata.app=locus — the account is shared with
// Shoulders of Giants, whose prices must not be modified here.
//
// Dry run by default. Nothing is written without --apply.
//
// `--only subs` restricts to the subscription; `--only packs` to credit packs.
//
//   node scripts/stripe/add-currency.mjs --env-file .env --rate 6.633333 --only subs
//   node scripts/stripe/add-currency.mjs --key sk_live_... --live \
//     --rate 6.633333 --skip price_old6,price_old60 --apply

import { makeStripe, parseArgs, resolveKey } from "./catalog.mjs"

const APP = "locus"
const CURRENCY = "brl"
const BASE = "usd"

const args = parseArgs(process.argv.slice(2))
const { key, live } = resolveKey(args)
const stripe = makeStripe(key)
const apply = args["--apply"] === true
const force = args["--force"] === true

const rate = Number(args["--rate"])
if (!Number.isFinite(rate) || rate <= 0) {
  throw new Error("--rate must be a positive number of BRL per USD (e.g. 6.633333)")
}

const only = typeof args["--only"] === "string" ? args["--only"] : "all"
if (!["all", "subs", "packs"].includes(only)) {
  throw new Error("--only must be one of: all, subs, packs")
}

const skip = new Set(
  typeof args["--skip"] === "string"
    ? args["--skip"].split(",").map((s) => s.trim()).filter(Boolean)
    : []
)

const money = (cents, currency) =>
  `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`

const convert = (usdCents) => Math.round(usdCents * rate)

console.log(`\n${"=".repeat(76)}`)
console.log(`  ${live ? "LIVE" : "TEST"}  adding ${CURRENCY.toUpperCase()} to ${APP} prices (--only ${only}) at ${rate} BRL/USD`)
console.log(`${"=".repeat(76)}`)

const account = await stripe.accounts.retrieve()
console.log(`  account ${account.id}  country=${account.country}  default=${account.default_currency}`)
if (account.country !== "BR") {
  console.log(
    `\n  ! account country is ${account.country}, not BR. The domestic-rails\n` +
      `    rationale for this change does not apply. Re-check the diagnosis first.`
  )
}

// ── Collect every active Locus USD price ────────────────────────────────────
const targets = []
for await (const price of stripe.prices.list({
  limit: 100,
  active: true,
  expand: ["data.product"],
})) {
  if (price.product?.metadata?.app !== APP) continue
  if (price.currency !== BASE) continue
  if (price.unit_amount === null) continue // custom_unit_amount / tiered
  if (only === "subs" && !price.recurring) continue
  if (only === "packs" && price.recurring) continue
  targets.push(price)
}

targets.sort((a, b) => {
  const kind = (p) => (p.recurring ? 0 : 1)
  return kind(a) - kind(b) || a.unit_amount - b.unit_amount
})

if (targets.length === 0) {
  console.log(`\n  No active ${BASE.toUpperCase()} prices tagged app=${APP}. Nothing to do.\n`)
  process.exit(0)
}

// ── Plan ────────────────────────────────────────────────────────────────────
console.log(`\n  PLAN`)
const plan = []

for (const price of targets) {
  const kind = price.recurring ? `${price.recurring.interval}ly sub` : "credit pack"
  const label = `${price.id}  ${money(price.unit_amount, BASE).padEnd(10)} ${kind.padEnd(12)}`

  if (skip.has(price.id)) {
    console.log(`    - ${label}  skipped (--skip)`)
    continue
  }

  const next = convert(price.unit_amount)
  const existing = price.currency_options?.[CURRENCY]

  if (existing?.unit_amount === next) {
    console.log(`    = ${label}  already ${money(next, CURRENCY)}`)
    continue
  }
  if (existing && !force) {
    console.log(
      `    ! ${label}  has ${money(existing.unit_amount, CURRENCY)}, want ` +
        `${money(next, CURRENCY)} — pass --force to overwrite`
    )
    continue
  }
  console.log(`    + ${label}  ->  ${money(next, CURRENCY)}${existing ? " (overwrite)" : ""}`)
  plan.push({ price, next })
}

if (plan.length === 0) {
  console.log(`\n  Nothing to write.\n`)
  process.exit(0)
}

if (!apply) {
  console.log(`\n  DRY RUN — nothing written. Re-run with --apply to commit.\n`)
  process.exit(0)
}

// ── Apply ───────────────────────────────────────────────────────────────────
console.log(`\n  APPLYING`)
for (const { price, next } of plan) {
  const updated = await stripe.prices.update(price.id, {
    currency_options: {
      // tax_behavior must match the price's own, or Stripe rejects the option.
      [CURRENCY]: {
        unit_amount: next,
        ...(price.tax_behavior && price.tax_behavior !== "unspecified"
          ? { tax_behavior: price.tax_behavior }
          : {}),
      },
    },
  })
  const wrote = updated.currency_options?.[CURRENCY]
  console.log(
    `    ok ${updated.id}  ${CURRENCY}=${wrote ? money(wrote.unit_amount, CURRENCY) : "MISSING"}`
  )
}
console.log(`\n  Done.\n`)
