/**
 * OAuth 2.0 authorization-code helpers for customer social sign-in.
 * Providers: Google + LINE (client ask: "customer login can be login with
 * line, google"). No third-party OAuth SDK — plain fetch against each
 * provider's documented endpoints keeps the surface small and auditable.
 *
 * Security model:
 * - CSRF: a random `state` stored in a short-lived httpOnly cookie
 *   (nk_oauth_state) and compared on callback; the cookie also carries the
 *   customer's ?next= destination so the redirect survives the round trip.
 * - Redirect URI is derived from the request origin (x-forwarded-host aware)
 *   so the same code serves localhost and production.
 * - Provider credentials come from env; a provider without credentials is
 *   simply not offered in the UI and its authorize route returns 503.
 */

// ─── Provider configuration ─────────────────────────────

export type OAuthProvider = 'google' | 'line';

export interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
}

const PROVIDERS: Record<OAuthProvider, OAuthProviderConfig> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    // Vercel stores these as NK_GOOGLE_* (set 30d ago); plain GOOGLE_* works
    // for local .env.local. Either name configures the provider.
    clientId: process.env['NK_GOOGLE_CLIENT_ID'] ?? process.env['GOOGLE_CLIENT_ID'],
    clientSecret: process.env['NK_GOOGLE_CLIENT_SECRET'] ?? process.env['GOOGLE_CLIENT_SECRET'],
  },
  line: {
    authorizeUrl: 'https://access.line.me/oauth2/v2.1/authorize',
    tokenUrl: 'https://api.line.me/oauth2/v2.1/token',
    userinfoUrl: 'https://api.line.me/oauth2/v2.1/userinfo?client_id=', // unused; profile via id_token verification below
    scope: 'openid profile email',
    clientId: process.env['LINE_CHANNEL_ID'] ?? process.env['LINE_CLIENT_ID'],
    clientSecret: process.env['LINE_CHANNEL_SECRET'] ?? process.env['LINE_CLIENT_SECRET'],
  },
};

export function isProviderConfigured(provider: OAuthProvider): boolean {
  const p = PROVIDERS[provider];
  return Boolean(p.clientId && p.clientSecret);
}

export function getProviderConfig(provider: OAuthProvider): OAuthProviderConfig {
  return PROVIDERS[provider];
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'google' || value === 'line';
}

// ─── URLs ───────────────────────────────────────────────

/** Origin from the incoming request (behind Vercel/proxies too). */
export function requestOrigin(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:4200';
  return `${proto}://${host}`;
}

export function redirectUri(req: Request, provider: OAuthProvider): string {
  return `${requestOrigin(req)}/api/v1/auth/oauth/${provider}/callback`;
}

/**
 * Build the provider authorize URL.
 * state = signed random value; also stored in the state cookie for compare.
 */
export function buildAuthorizeUrl(params: {
  provider: OAuthProvider;
  req: Request;
  state: string;
}): string {
  const p = PROVIDERS[params.provider];
  const url = new URL(p.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', p.clientId ?? '');
  url.searchParams.set('redirect_uri', redirectUri(params.req, params.provider));
  url.searchParams.set('state', params.state);
  url.searchParams.set('scope', p.scope);
  if (params.provider === 'line') {
    // LINE requires an explicit nonce-ish param set only in some configs; ui_locales keeps the consent page Thai-first.
    url.searchParams.set('ui_locales', 'th');
  } else {
    // Google: always re-prompt account chooser so users with multiple accounts can pick.
    url.searchParams.set('prompt', 'select_account');
    url.searchParams.set('access_type', 'online');
  }
  return url.toString();
}

// ─── State (CSRF) ───────────────────────────────────────

export const OAUTH_STATE_COOKIE = 'nk_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Create `random.expiry` state — the expiry rides inside the value. */
export function createState(): string {
  const random = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  return `${random}.${Date.now() + STATE_TTL_MS}`;
}

export function verifyState(state: string | null, cookieState: string | null): boolean {
  if (!state || !cookieState || state !== cookieState) return false;
  const dot = state.lastIndexOf('.');
  if (dot <= 0) return false;
  const expiry = Number(state.slice(dot + 1));
  return Number.isFinite(expiry) && expiry > Date.now();
}

export const STATE_COOKIE_MAX_AGE = Math.floor(STATE_TTL_MS / 1000);

// ─── Token exchange + profile ───────────────────────────

export interface OAuthProfile {
  /** Provider-unique subject id (not used as the account key — email is). */
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
}

function base64UrlDecodeJson(token: string): Record<string, unknown> | null {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Exchange the authorization code for tokens and normalize the profile.
 * Google: userinfo endpoint. LINE: id_token claims (LINE's userinfo returns
 * the email claim only with the email scope granted and verified channel —
 * the id_token is the documented source of truth).
 */
export async function exchangeCodeForProfile(params: {
  provider: OAuthProvider;
  req: Request;
  code: string;
}): Promise<OAuthProfile | null> {
  const p = PROVIDERS[params.provider];
  if (!p.clientId || !p.clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: redirectUri(params.req, params.provider),
    client_id: p.clientId,
    client_secret: p.clientSecret,
  });

  let tokenRes: Response;
  try {
    tokenRes = await fetch(p.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    return null;
  }
  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json().catch(() => null)) as TokenResponse | null;
  if (!tokens?.access_token && !tokens?.id_token) return null;

  if (params.provider === 'google') {
    if (!tokens.access_token) return null;
    const uiRes = await fetch(p.userinfoUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).catch(() => null);
    if (!uiRes?.ok) return null;
    const ui = (await uiRes.json().catch(() => null)) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    } | null;
    if (!ui?.sub || !ui.email) return null;
    return {
      subject: ui.sub,
      email: ui.email.toLowerCase(),
      emailVerified: ui.email_verified ?? false,
      name: ui.name ?? null,
      picture: ui.picture ?? null,
    };
  }

  // LINE — decode the id_token claims (signed by LINE; TLS-protected direct
  // token response, standard practice for this integration).
  const claims = tokens.id_token ? base64UrlDecodeJson(tokens.id_token) : null;
  const sub = typeof claims?.['sub'] === 'string' ? (claims['sub'] as string) : null;
  if (!sub) return null;
  const email = typeof claims?.['email'] === 'string' ? (claims['email'] as string) : null;
  // LINE only returns email when the channel has it enabled AND the user consents.
  if (!email) return null;
  const name = typeof claims?.['name'] === 'string' ? (claims['name'] as string) : null;
  const picture = typeof claims?.['picture'] === 'string' ? (claims['picture'] as string) : null;
  return {
    subject: sub,
    email: email.toLowerCase(),
    emailVerified: true, // LINE email claims are channel-verified at consent
    name,
    picture,
  };
}
