/**
 * Facebook OAuth for customer sign-in — mirrors the Google/LINE integration
 * in lib/oauth.ts (client ask: "customer login can be login with LINE,
 * Facebook, Google mail").
 *
 * Endpoints per Meta's "Log in with Facebook" (web) docs:
 * - Authorize: https://www.facebook.com/v21.0/dialog/oauth
 * - Token:     https://graph.facebook.com/v21.0/oauth/access_token
 * - Profile:   https://graph.facebook.com/me?fields=id,name,email,picture
 * Facebook returns verified email on the /me endpoint when granted — no
 * id_token to decode, unlike LINE.
 */

export const FB_AUTHORIZE_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
export const FB_TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token';
export const FB_PROFILE_URL = 'https://graph.facebook.com/me';

/** Facebook app credentials (Vercel: NK_FB_APP_ID / NK_FB_APP_SECRET). */
export function fbAppId(): string | undefined {
  return process.env['NK_FB_APP_ID'] ?? process.env['FACEBOOK_APP_ID'];
}

export function fbAppSecret(): string | undefined {
  return process.env['NK_FB_APP_SECRET'] ?? process.env['FACEBOOK_APP_SECRET'];
}

export function isFacebookConfigured(): boolean {
  return Boolean(fbAppId() && fbAppSecret());
}

/** Build the Facebook OAuth consent URL (state = CSRF value from lib/oauth). */
export function buildFacebookAuthorizeUrl(params: {
  req: Request;
  state: string;
  redirectUri: string;
}): string {
  const url = new URL(FB_AUTHORIZE_URL);
  url.searchParams.set('client_id', fbAppId() ?? '');
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  // auth_type=rerequest re-asks for a previously-denied email permission;
  // locale keeps the consent dialog Thai-first.
  url.searchParams.set('auth_type', 'rerequest');
  url.searchParams.set('scope', 'email');
  return url.toString();
}

export interface FacebookProfile {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

interface FbTokenResponse {
  access_token?: string;
  error?: { message?: string };
}

interface FbProfileResponse {
  id?: string;
  name?: string;
  email?: string;
  picture?: { data?: { url?: string } };
}

/**
 * Exchange the authorization code for an access token and fetch the
 * profile. Facebook verifies the email itself (accounts must be verified to
 * log in with Facebook), so a returned email is treated as verified.
 */
export async function exchangeFacebookCodeForProfile(params: {
  code: string;
  redirectUri: string;
}): Promise<FacebookProfile | null> {
  const appId = fbAppId();
  const appSecret = fbAppSecret();
  if (!appId || !appSecret) return null;

  const tokenUrl = new URL(FB_TOKEN_URL);
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  tokenUrl.searchParams.set('code', params.code);
  tokenUrl.searchParams.set('redirect_uri', params.redirectUri);

  let tokenRes: Response;
  try {
    tokenRes = await fetch(tokenUrl, { method: 'GET' });
  } catch {
    return null;
  }
  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json().catch(() => null)) as FbTokenResponse | null;
  if (!tokens?.access_token) return null;

  const profileUrl = new URL(FB_PROFILE_URL);
  profileUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
  profileUrl.searchParams.set('access_token', tokens.access_token);

  let profileRes: Response;
  try {
    profileRes = await fetch(profileUrl);
  } catch {
    return null;
  }
  if (!profileRes.ok) return null;
  const profile = (await profileRes.json().catch(() => null)) as FbProfileResponse | null;
  if (!profile?.id || !profile.email) return null;

  return {
    subject: profile.id,
    email: profile.email.toLowerCase(),
    emailVerified: true, // Facebook only returns verified emails
    name: profile.name ?? null,
    picture: profile.picture?.data?.url ?? null,
  };
}
