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
- Re-probe after the fix ships: 1 more credit, expect `SLIP_DUPLICATE`
  (duplicate) or `confirmed`. Open side effects of this probe: 1 Discord
  payment-pending ping for the test order; no secrets touched (the Slip2Go
  secret never left the server — the app called the provider itself).

## 2026-11-23 console evidence (free, 0 credits) — NK-2026-000237 answered 200404

The merchant console's own API log (ร้าน Nongkati store → API Connect →
ประวัติการใช้งาน, week of 23 พ.ย. 2569) lists exactly two calls, and the only
one at 21:12 — the second the order NK-2026-000237 ฿67 slip was uploaded — is:

| API Endpoint | Response code | เวลา | bucket |
| --- | --- | --- | --- |
| `/verify-slip/qr-base64/info` | **`200404`** | 23 พ.ย. 2569 21:12 | ไม่พบสลิป/หมดอายุ |

The other (`200200`, 17:31) is unrelated. So the provider did NOT answer a
fraud code and did not go silent: it said "this slip is not published yet",
which is the documented BBL delay — the case that maps to `SLIP_DELAYED`.

- **The app stored `INVALID_SLIP` anyway.** Because that response also carries
  a `data` object, `verifySlip2Go` passed its `!parsed.data` guard, ran
  `verifySuccess`, and the missing-amount/transRef branch returned
  `INVALID_SLIP` — bypassing the `case '200404'` mapping. Fixed in
  `src/lib/payment/slip2go.ts` (`VERDICT_CODES` is decided before
  `verifySuccess`), regression-tested in `tests/slip2go-receiver.test.ts`.
- Side effect of the same bug: `scheduleSlipRecheck` keys off `SLIP_DELAYED`, so
  no re-check was ever queued — the slip sat in the manual queue and the order
  expired ฿67 in (real money, in the store's BBL account).
- **Decision (23 พ.ย. 2569, user): leave NK-2026-000237 `expired`; no refund,
  no re-issue, no money moves.** The order stays as the worked example for the
  diagnostics endpoint and the 1.2.6 offline re-check.
- No provider credit was spent here: the console log is free, which is why this
  is the first probe in this file that cost nothing.

## 2026-11-23 customer-side delayed-slip retry (branch, ships with 1.2.6)

The guard fix alone left the customer facing the same dead end: live 1.2.5's
`SlipUploadPanel` renders the verdict box *instead of* the picker, so a
`SLIP_DELAYED` slip could not be re-checked without a page reload and a second
upload — inside the 2–3 minute window the bank needs. Ported from
`db/mariadb-port` (`ff58e65`) onto `release/1.2.6-slip-recheck`:

- `result.retry` is set only when the route answers `error: 'SLIP_DELAYED'`, and
  the panel then shows **ตรวจสลิปอีกครั้ง**, which re-submits the file already
  in state against the same order (same paid provider call, same stored slip).
- `showPicker = !result || (!result.ok && !result.retry)`: every other rejection
  (wrong amount, receiver mismatch, duplicate) keeps the picker, so a corrected
  slip can go against the same order instead of a reload.

Guarded by `tests/SlipUploadPanel.test.tsx` (retry offered for `SLIP_DELAYED`
and never for `AMOUNT_MISMATCH`; picker kept after a rejection and the second
submit reaches `/slip-verify`). The server-side sweep (`src/lib/slipRecheck.ts`)
still covers the customer who closes the tab, and both paths CAS on
`updatedAt`, so timer + tap cannot both pay.

## 2026-11-24 fail closed on unknown success codes

`verifySlip2Go` used to send any `200xxx` with a usable `data` object down the
success path. That is how a `200404` for NK-2026-000237 was read as
`INVALID_SLIP`, and it also meant an undocumented condition code that happened
to echo amount/transRef could CONFIRM an order and deliver codes.

Now only `SUCCESS_CODES` (`200000` documented, `200200` observed live on 30 ต.ค.
and 1 พ.ย. 2569) may confirm; every other code is a verdict. The payload is no
longer evidence on its own — the provider echoes `data` beside condition codes.

Accepted cost: an undocumented *success* code now answers `INVALID_SLIP` +
`providerCode` on the order (the slip is stored, the admin can confirm by hand)
instead of confirming silently. A false reject is recoverable; a false confirm
is not. Before widening the list, prove the code live first.
