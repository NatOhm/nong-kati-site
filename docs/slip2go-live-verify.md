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
3. Expect `200000` on amount+receiver match. Log **provider code only**
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
- If the provider rejects digits-only account numbers (docs show dashed
  examples but mandate no-symbols), the fix is in `normalizeAccountDigits`
  (`src/lib/payment/slip2go.ts`) — one place, both enforcement layers.
