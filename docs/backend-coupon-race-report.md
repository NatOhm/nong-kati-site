# Backend Report — Coupon per-customer race (2026-10-03)

Durable record of a backend fix and the audit behind it. Every line number below was
re-verified against the tree on 2026-10-03; they drift as code moves, so re-check before
relying on them.

**Status:** fixed in the working tree, not yet committed.
**Scope:** one correctness bug (coupon cap could be over-granted) plus the reasoning that
ruled out the first proposed fix.

---

## 1. The bug

`perCustomerLimit` is a per-coupon cap on how many times one customer may redeem a coupon.
It is enforced in `claimOrderForConfirmation` at the moment payment is confirmed, not at
order creation — orders are created before payment and may never be paid.

The check is read-then-act:

```ts
// src/api/orders.ts:544-553
const per = coupon?.perCustomerLimit ?? 1;
const mine = await db.couponRedemption.count({
  where: { couponId: order.couponId, customerId: order.customerId },
});
if (mine > per) {
  if (strict) throw new Error('COUPON_PER_CUSTOMER_LIMIT');
  console.error(
    `[orders] per-customer coupon cap exceeded at confirmation of PAID order ${orderId} — recorded (HIGH-2)`,
  );
}
```

Under `READ COMMITTED`, two wallet claims for the same coupon + customer can both read a
count under the cap, both insert a redemption row, and both commit. The cap is silently
over-granted: the customer gets a discount they were not entitled to.

Note the contrast with the **global** `usageLimit`, which is already safe — it uses a
conditional `updateMany` as an atomic guard (`src/api/orders.ts:506-511`), so the database,
not the application, decides the winner. The per-customer cap had no such guard.

---

## 2. Why the proposed fix (`@@unique([couponId, customerId])`) was rejected

The first proposal was to let the database enforce it with a unique constraint on the
redemption pair. **This does not work, for three independent reasons.** Recorded here so
nobody re-proposes it.

### 2a. A constraint cannot read a per-row column

`perCustomerLimit` is variable and admin-settable (`prisma/schema.prisma:260`):

```prisma
perCustomerLimit Int?      @default(1)
```

`1`, `3`, `null` (unlimited) are all valid. A unique constraint is a fixed cardinality — it
would cap **every** coupon at one redemption per customer, silently breaking any coupon
where an admin sets a higher limit. It enforces 1, not "the limit".

### 2b. The violation would be swallowed, so the race would get quieter, not closed

The redemption insert is wrapped in a catch that treats any unique-constraint error as an
already-recorded retry (`src/api/orders.ts:534-543`):

```ts
try {
  await db.couponRedemption.create({ data: { couponId, customerId, orderId } });
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes('Unique constraint')) throw e;
  // Row already exists for this order (retry after a later-step failure) — keep the
  // existing one, do not double-count.
}
```

A new `(couponId, customerId)` violation would land in exactly that branch. The losing
transaction would skip the insert with no error raised, `count()` would still read `1`,
`mine > per` would stay false, and the cap would pass. The failure mode changes from
"silently over-granted" to "silently over-granted, and now the database is supposed to be
protecting you but isn't".

### 2c. It would strand paid orders

The `paidExternally` mode (webhook + slip-verify) deliberately records over-limit usage
because the money has already left the customer's account — rejecting the confirmation would
strand a paid order with no reconciliation path. See the HIGH-2 rationale at
`src/api/orders.ts:479-487`. Under a unique constraint those paths could not record the
second redemption at all; it would be swallowed by the same catch. The over-limit usage that
reconciliation alerting depends on would stop existing.

---

## 3. The fix

`pay-wallet` was the only **strict** claim call site still on `READ COMMITTED`. Its
transaction now runs `Serializable` and retries on write-conflict, via a new
`runWalletPayment` wrapper (`src/app/api/v1/orders/[id]/pay-wallet/route.ts:56`) that mirrors
the existing `runStaffMutation` pattern in `src/api/adminStaff.ts:75-94`: three attempts,
`code === 'P2034'` detection, `50 * (attempt + 1)` ms backoff.

```ts
// src/app/api/v1/orders/[id]/pay-wallet/route.ts:56
return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
```

The losing transaction aborts, retries, re-reads the winner's redemption row, and is
correctly rejected with `COUPON_PER_CUSTOMER_LIMIT` → HTTP 409. No schema migration, no
change to any error code, no effect on the `paidExternally` paths.

### Call-site matrix (all 7 sites, verified)

| Call site                     | Isolation                               | Mode                    | Cap can over-grant? |
| ----------------------------- | --------------------------------------- | ----------------------- | ------------------- |
| `verify-payment/route.ts:135` | Serializable (`:149`)                   | `paidExternally` (soft) | No — logs only      |
| `verify-payment/route.ts:186` | Serializable (`:200`)                   | strict                  | No — Serializable   |
| `pay-wallet/route.ts:125`     | **Serializable (`:56`) — this fix**     | strict                  | No — Serializable   |
| `slip-verify/route.ts:174`    | Serializable (`:183`)                   | `paidExternally` (soft) | No — logs only      |
| `slip-verify/route.ts:223`    | **Read Committed** (`:212`, no options) | `paidExternally` (soft) | No — logs only      |
| `omise/route.ts:174`          | **Read Committed** (`:166`, no options) | `paidExternally` (soft) | No — logs only      |
| `omise/route.ts:223`          | Serializable (`:244`)                   | strict                  | No — Serializable   |

**Correction worth recording:** an earlier draft of this analysis claimed "the other five
call sites already run Serializable". That was wrong. `slip-verify:223` and `omise:174` are
on `READ COMMITTED`. It does not reopen the bug — both are `paidExternally` soft sites where
the cap only writes a `console.error` and can never throw, so no discount is over-granted.
The residual effect is that the recorded count in the audit trail can be off by one under a
race. All three **strict** sites are Serializable.

---

## 4. Verification

- `npx tsc --noEmit` — exit 0
- `npx vitest run` — 307 passed, 4 skipped, 0 failures (was 302 before this change)
- `npx eslint <changed files> --max-warnings=0` — clean
- `npx prettier --check` on the changed source and test — clean
- `tests/client-docs-consistency.test.ts` — 20/20 green

### Negative control

`tests/wallet-coupon-race.test.ts` (5 cases) was re-run against the **pre-fix** route to
confirm the tests actually gate the fix rather than passing vacuously:

| Test                                                           | Pre-fix | Post-fix |
| -------------------------------------------------------------- | ------- | -------- |
| runs the payment transaction at SERIALIZABLE                   | ✗       | ✓        |
| retries a P2034 write-conflict and returns the retried attempt | ✗       | ✓        |
| gives up after three conflicting attempts instead of looping   | ✗       | ✓        |
| does not retry a non-conflict failure                          | ✓       | ✓        |
| keeps the typed guards ahead of the coupon check               | ✓       | ✓        |

The two that pass in both directions cover unchanged behaviour (error mapping, balance
guard ordering) and are expected to stay green.

---

## 5. The gap this does NOT close — and the attempt to close it

**The suite mocks Prisma everywhere, so no committed test runs a real Postgres
`SERIALIZABLE` race.** `tests/wallet-coupon-race.test.ts` proves the _wiring_ — that the
route requests `Serializable`, that `P2034` is retried and the retried attempt's result is
the one returned, that non-conflicts are not retried, that three conflicts give up, and that
the client-facing error codes are unchanged. It does not prove the database actually
serialises under concurrency.

`tests/coupon-cap-concurrency.test.ts` was written to close exactly that gap: 8 simultaneous
wallet claims by one customer on one coupon capped at 1, over real HTTP against real
Postgres, asserting one 200 and seven 409 `COUPON_PER_CUSTOMER_LIMIT`, one redemption row,
one spend row, and one debit.

**It has never been executed.** It is typechecked — `tsc --noEmit` covers the test tree, which
validated every prisma field name against the generated client and caught two wrong ones
during writing — and its skip path is verified (1 skipped without `NK_TEST_BASE_URL`). But no
assertion in it has ever run.

The blocker is environmental, not a property of the test: this machine has no reachable
Postgres. No local `psql`/`postgres`, port 5432 closed, no `DATABASE_URL`. Docker Desktop is
installed and its `com.docker.backend` process launches, but the `docker-desktop` WSL2
distribution stays `Stopped` and the backend times out reaching its own IPC
(`context deadline exceeded` on `GET /forwards/list`), so the engine never becomes
available. That needs WSL2/virtualisation intervention or a reboot on the host — not
something a test change can work around.

It is therefore **deliberately not wired into the `concurrency-tests` CI job**, which sits in
`build`'s `needs`; an unproven test there risks a red build on its first run.

To finish it, on a machine with a working engine:

1. `docker run -d -e POSTGRES_PASSWORD=ci -e POSTGRES_USER=ci -e POSTGRES_DB=ci -p 5432:5432 postgres:16`
2. `DATABASE_URL=... npx prisma migrate deploy`, then boot `next dev` with `NK_JWT_SECRET` and
   `NK_GIFT_CODE_ENCRYPTION_KEY` set
3. `NK_TEST_BASE_URL=http://127.0.0.1:4200 npx vitest run tests/coupon-cap-concurrency.test.ts`
4. **Negative control before trusting it:** revert `isolationLevel: 'Serializable'` in
   `runWalletPayment`, re-run, and confirm it fails with more than one 200. An assertion that
   passes against the unfixed code proves nothing — the test uses 8 contenders rather than 2
   precisely because two requests can serialise naturally and pass vacuously.
5. Only then add it to `concurrency-tests`.

Also still unverified: behaviour under a real `SERIALIZABLE` retry storm, and whether the
production database surfaces `P2034` the way Prisma reports it.

## 6. Carried-forward backend findings (not re-verified in this pass)

Found during the same backend audit on 2026-10-03. Listed for continuity; each needs its own
verification before acting.

| Finding                                          | Location                              | Note                                                                                            |
| ------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Admin resend-email / refund have no server route | `src/types/auth.ts:189`               | Permission is orphaned — the UI action resolves to `mockOrders.find(...)`, not a real endpoint. |
| Zero Sentry instrumentation                      | `src/`                                | No error reporting wired up despite `.env.example` referencing it.                              |
| CSP is report-only by default                    | `middleware.ts:79`, `.env.example:58` | Headers observe rather than block.                                                              |
| Manual transfer is disabled in production        | `src/app/api/v1/orders/route.ts:78`   | `manualUsable` needs all three of `enabled`, `accountName`, `accountNumber`.                    |
| Payment channel requires live keys               | `src/api/omise.ts:55`                 | `isOpnConfigured`; without keys `POST /api/v1/orders` returns 503 `NO_PAYMENT_CHANNEL`.         |

**Retired during that audit** (previously reported, proved wrong on inspection): backup codes
_are_ consumable — `consumeBackupCode` in `adminAuth.ts` guards on `usedAt: null` and is
covered by `tests/admin-backup-codes.test.ts`.

**Resolved after that audit pass:** the `api.qrserver.com` CSP leftover is gone —
`middleware.ts:35` no longer allows it in `img-src`. Nothing ever requested it once QR
generation moved server-side, so the entry only widened the image policy.

---

## 7. Related

- `docs/pre-launch-checklist.md` — the coupon item records this fix and why the constraint
  was rejected
- `docs/quality-gates.md` — lists this work as gate `W`, and
  `tests/coupon-cap-concurrency.test.ts` as `CC` (flagged as not yet in CI). The gate
  inventory is itself enforced by `tests/quality-gates-coverage.test.ts`, which fails if any
  file under the test tree is undocumented, if the doc cites a file that no longer exists, or
  if the overview table's columns disagree.
