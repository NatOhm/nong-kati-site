# Slip2Go checkReceiver — production live-verify runbook

One claim in this thread was never exercised live: that a real stored slip
re-submitted with the store account attached returns `200000` (and that a
wrong-account slip returns `200401` → `RECEIVER_MISMATCH`, fail-closed).
Workstation attempts are blocked by two environment facts, both outside the
code — so this must run **from production** (server IP + prod secret).

## Why not from the workstation

1. `NK_SLIP2GO_SECRET` in local `.env.local` (Oct 1) is rejected by the
   provider (`Authentication Token Mismatch` on both Bearer and raw schemes).
   The valid secret lives in the Plesk prod env.
2. Slip2Go IP-whitelists the server (`147.50.254.11`); workstation calls may
   401007 even with a good secret.

A retry from here fails identically at auth before any image check — one
probe was spent confirming this, further calls buy nothing.

## Steps (quota cost: 1–2 verification credits)

1. Pick a **real stored customer JPEG** from the vault (265–585 KB range —
   NOT the latest order's 144-byte PNG stub, which is not a real slip).
   Note its order number and order amount, never copy the image off-server.
2. From the production host (or a prod shell), call the verify path once with
   the store account digits attached — same shape the route already sends:
   `checkReceiver: [{ accountNumber: <store digits> }]` + `checkAmount` eq.
3. Expect **`200200`** — the observed live answer (2 calls on 30 ต.ค. 2026):
   the bank-side `checkReceiver` condition we send does not fire, so the
   provider reports the slip valid and the **local** `checkReceiverMatch`
   decides. Log **provider code only**
   (`200000` / `200401` / …) plus trailing-4 comparison — no PII, no secret,
   no image bytes in any log.
4. If a known wrong-account slip sample exists, repeat once and expect
   `200401` → mapped to `RECEIVER_MISMATCH`, order left payable, slip kept
   for manual review, no fulfilment. If no such sample exists, skip — do NOT
   manufacture one against live quota.
5. Confirm order-state agreement: matched order confirmable, mismatched
   order still `pending_payment` with the slip visible in the admin queue.

## After

- Delete this file's claim from the stuck list; correctness for the money
  path can then be graded above 6.
- **Decision (30 ต.ค. 2026): the bank-side `checkReceiver` stays belt-only.**
  Docs show `checkReceiver: [{ accountNumber: "…" }]` as a valid standalone
  example (`accountType` is documented as optional), so our payload matches
  published usage — yet the live proof answered `200200` for a wrong account.
  No payload change without a credit-backed probe; enforcement is the local
  `checkReceiverMatch` in `src/lib/payment/receiverPolicy.ts` (one owner,
  applied by the route after ANY provider success).
- If the provider ever rejects digits-only account numbers (docs show dashed
  examples but mandate no-symbols), the fix is in `normalizeAccountDigits`
  (`src/lib/payment/receiverPolicy.ts`) — one place, both enforcement layers.

## 2026-10-30 probe outcome (1 credit, user-approved) — genuine slip FAILED

- Setup: real stored slip-171 (347,885 B JPEG) resubmitted through the live
  `POST /api/v1/payments/slip-verify` against a fresh 9-THB probe order
  `NK-2026-000175` (amount 9 = 9, same receiver). No order was created blind:
  a price preview confirmed total 9 first; the order stays `pending_payment`
  and auto-expires like any abandoned checkout.
- Result: **HTTP 422 `RECEIVER_MISMATCH`, `slipStored: true`**, order payable.
  NOT the expected `200501` duplicate — the receiver guard fires first.
- Root cause (mask-window, not a wrong account): the genuine slip to
  `199-1-73578-6` reports `xxx-x-x3578-x` — digits `3578` are positions 6–9,
  the tail `5786` is never exposed. Trailing-4 equality (`5786` vs `3578`)
  false-rejected a real customer slip. The OQ answers itself: `…5786` (tail)
  and `…3578` (mask window) are the SAME account — settings were already
  correct, no change made (verified no-op).
- Fix: `checkReceiverMatch` is now containment — the slip's exposed digit run
  must appear inside the store digits (or vice versa). Regression test uses
  the real mask. Failing safe is preserved: mismatch still queues to manual
  review, never fulfils.
- Side note: this was the slip's 3rd provider submit and still no `200501`,
  so provider-side duplicate is not a reliable second line — the DB unique
  slip-ref index remains the real one-slip-one-order guard.
- Re-probe after the fix ships: 1 more credit, expect `INVALID_SLIP`
  (duplicate) or `confirmed`. Open side effects of this probe: 1 Discord
  payment-pending ping for the test order; no secrets touched (the Slip2Go
  secret never left the server — the app called the provider itself).
