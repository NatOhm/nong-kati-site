# DNS Zone Migration — nongkatistore.com (as-run, Sep 30 / Oct 1, 2026)

Goal: stop depending on the **old server (thsv51/th101, 14.207.142.11)** for DNS.
Result: **the domain is now served entirely by thsv93's Plesk DNS (147.50.254.11)**, mail still
delivered by the old box's mail service. Registry delegation changed; old NS are no longer authoritative.

## What was changed (in order)

### 1. Mirror mail records into thsv93's zone (`thsv93 Plesk → DNS Settings`, domain id 1036)
Copied byte-identical from the old zone so mail/DKIM behavior doesn't change:

| Record | Before (thsv93 zone) | After (= old zone) | Why |
|---|---|---|---|
| `mail.nongkatistore.com. A` | 147.50.254.11 | **14.207.142.11** | Mail service still lives on old box |
| `webmail.nongkatistore.com. A` | 147.50.254.11 | **14.207.142.11** | Same |
| `ipv4.nongkatistore.com. A` | 147.50.254.11 | **14.207.142.11** | Mirror of old zone |
| `nongkatistore.com. TXT (SPF)` | `v=spf1 +a +mx +a:thsv93.hostatom.com -all` | `v=spf1 +a +mx +a:thsv51.hostatom.com -all` | Mail sends from old box |
| `default._domainkey.nongkatistore.com. TXT` | thsv93's own DKIM key | **old zone's key** (`p=MIIBIjAN…k42QyZrX…`) | Old mail service signs with this key |

Untouched: apex A (147.50.254.11), www CNAME, MX (→ mail), DMARC, SRV, `_domainkey o=-`, NS/glue rows
(`ns1`/`ns2` A → 147.50.254.11 — they now must point at the new DNS).
Applied via the **Update** button (DNS edits are staged until then); new zone serial `2026100101`.

### 2. Register vanity child hosts at the registry
WHMCS → Domain id 86320 → **ลงทะเบียน Nameservers** (`clientarea.php?action=domainregisterns`):
- `ns1.nongkatistore.com` → 147.50.254.11 ✅
- `ns2.nongkatistore.com` → 147.50.254.11 ✅

⚠️ Note: the registry form's name field takes **only the label** (`ns1`), the suffix
`.nongkatistore.com` is appended automatically. Both currently point at the same physical server
(single point of failure — see Follow-ups).

### 3. Registry delegation change
WHMCS → Domain id 86320 → **Nameservers** tab → custom nameservers →
`ns1.nongkatistore.com` / `ns2.nongkatistore.com` → "เปลี่ยน Nameservers".
First attempt failed ("An issue was encountered…") because the child hosts weren't registered yet —
step 2 fixed that. RDAP now shows `NS1/NS2.NONGKATISTORE.COM`.

## Verification (all passed)

| Check | Result |
|---|---|
| Registry NS (RDAP Verisign) | `NS1.NONGKATISTORE.COM`, `NS2.NONGKATISTORE.COM` |
| Glue via Google DoH | both → `147.50.254.11` |
| Apex A (Google + Cloudflare DoH) | `147.50.254.11` |
| www A | `147.50.254.11` (via CNAME) |
| mail / webmail A | `14.207.142.11` (unchanged) |
| MX | `10 mail.nongkatistore.com.` |
| SPF / DKIM / DMARC | `a:thsv51` / `DKIM1` present (old key) / `quarantine` |
| Site `https://nongkatistore.com/api/v1/version` | `gitSha 3e236c2f…, gitRef master` |
| `/api/v1/health` | healthy, database ok |
| Cert | valid LE (apex + www), no `-k` needed |

## Rollback (if something breaks)

1. **Web only**: WHMCS → Nameservers tab → set back `th101.hostatom.com` / `th102.hostatom.com`
   (≤ registry TTL). Old NS still run their zone copies (th101 serial 2026072701 = apex → old server;
   th102 serial 2026093001 = apex → new server — they diverged, so also do step 2 for a clean rollback).
2. **Zone content**: thsv51 Plesk (domain id 1194) → set apex A back to `14.207.142.11` → **Update**.
3. Mail records need no rollback (they already mirror the old zone exactly).

## Follow-ups

1. **Resilience (recommended)**: `ns1` and `ns2` are the same machine today. Options:
   - Enable a real secondary (e.g. Plesk Slave DNS Manager with `th102` as slave), then update the
     `ns2` child-host IP to that server via WHMCS "แก้ไข IP ของ NameServer"; or
   - Move to **Cloudflare**: add the zone, import records 1:1 (mail A, MX, SPF/DKIM/DMARC stay
     as-is), set proxy OFF for `mail`/`webmail`/`ns*`/`ipv4` and ON (or off, your choice) for
     apex/www, then change registry NS to the assigned Cloudflare NS pair. Cloudflare gives anycast
     redundancy + free DNS UI.
2. **Old-box decommission** (after stability window): the old server now serves *nothing* for this
   domain except **mail/webmail**. Keep product 74841 while mail runs there; disable its old Node.js
   app and revoke its git deploy keys when convenient.
3. **DKIM long-term**: when mail eventually moves off the old box, generate a fresh DKIM key on the
   new service and rotate `default._domainkey` (publish new key alongside old one first).
