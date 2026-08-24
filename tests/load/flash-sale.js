/**
 * k6 Flash Sale Load Test — 15-testing.md §7.1-7.2.
 * Scenario: 100 orders/min for 10 min, zero unhandled 5xx.
 *
 * Run: k6 run tests/load/flash-sale.js
 * Thresholds: http_req_failed < 1%, http_req_duration p95 < 2000ms
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Custom Metrics ─────────────────────────────────────

const errorRate = new Rate('errors');
const orderDuration = new Trend('order_duration');

// ─── Configuration ──────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'constant-arrival-rate',
      rate: 100,              // 100 requests per minute
      timeUnit: '1m',         // = ~1.67 req/s
      duration: '10m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],           // <1% failure rate
    http_req_duration: ['p(95)<2000'],        // p95 < 2s
    errors: ['rate<0.01'],
  },
};

// ─── Test Scenarios ─────────────────────────────────────

export default function () {
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40% — Browse products (high volume, low cost)
    browseProducts();
  } else if (scenario < 0.7) {
    // 30% — Add to cart
    addToCart();
  } else if (scenario < 0.9) {
    // 20% — Complete checkout
    completeCheckout();
  } else {
    // 10% — Search
    searchProducts();
  }

  sleep(Math.random() * 2 + 1); // 1-3s between requests
}

// ─── Scenario Functions ─────────────────────────────────

function browseProducts() {
  const res = http.get(`${BASE_URL}/api/v1/products`);
  check(res, {
    'browse: status 200': (r) => r.status === 200,
    'browse: has products': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(res.status !== 200);
}

function addToCart() {
  const payload = JSON.stringify({
    product_slug: 'steam-wallet-100',
    variant_id: 'var-st-100',
    quantity: 1,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post(`${BASE_URL}/api/v1/cart/items`, payload, params);
  check(res, {
    'cart: status 200 or 201': (r) => r.status === 200 || r.status === 201,
  });
  errorRate.add(res.status !== 200 && res.status !== 201);
}

function completeCheckout() {
  // Step 1: Create order
  const orderPayload = JSON.stringify({
    email: `loadtest_${Date.now()}@example.com`,
    phone: '0812345678',
    items: [
      { variant_id: 'var-st-100', quantity: 1 },
    ],
    consent_terms: true,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const orderStart = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/orders`, orderPayload, params);
  const orderDurationMs = Date.now() - orderStart;

  orderDuration.add(orderDurationMs);

  check(res, {
    'order: status 200 or 201': (r) => r.status === 200 || r.status === 201,
    'order: has order_id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data?.order_id !== undefined;
      } catch {
        return false;
      }
    },
    'order: p95 < 60s': () => orderDurationMs < 60000,
  });

  errorRate.add(res.status !== 200 && res.status !== 201);
}

function searchProducts() {
  const queries = ['steam', 'netflix', 'wallet', 'game', 'card'];
  const query = queries[Math.floor(Math.random() * queries.length)];

  const res = http.get(`${BASE_URL}/api/v1/search?q=${query}`);
  check(res, {
    'search: status 200': (r) => r.status === 200,
    'search: response < 300ms': (r) => r.timings.duration < 300,
  });
  errorRate.add(res.status !== 200);
}

// ─── Summary ────────────────────────────────────────────

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'tests/load/summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options) {
  // Simplified summary output
  const lines = [];
  lines.push('═══════════════════════════════════════');
  lines.push('  Nong-Kati Flash Sale Load Test');
  lines.push('═══════════════════════════════════════');
  lines.push(`  Total requests: ${data.metrics.http_reqs?.values?.count || 0}`);
  lines.push(`  Failed: ${data.metrics.http_req_failed?.values?.rate || 0}`);
  lines.push(`  Duration p95: ${data.metrics.http_req_duration?.values?.['p(95)'] || 0}ms`);
  lines.push(`  Order duration p95: ${data.metrics.order_duration?.values?.['p(95)'] || 0}ms`);
  lines.push('═══════════════════════════════════════');
  return lines.join('\n');
}
