// Tiny OAuth 2.0 Authorization Code + PKCE client for Cognito hosted UI.
// Stores id_token in localStorage. No external auth library.

import { config } from "./config";

const KEY_TOKEN = "zz_id_token";
const KEY_VERIFIER = "zz_pkce_verifier";

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const sha256 = async (s: string) =>
  b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

const randomVerifier = () => {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return b64url(a.buffer);
};

export const getToken = () => localStorage.getItem(KEY_TOKEN);
export const isExpired = (jwt: string) => {
  try {
    const [, p] = jwt.split(".");
    const { exp } = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    return Date.now() / 1000 > exp - 30;
  } catch {
    return true;
  }
};

export const login = async () => {
  const verifier = randomVerifier();
  const challenge = await sha256(verifier);
  localStorage.setItem(KEY_VERIFIER, verifier);
  const u = new URL(`${config.cognitoDomain}/oauth2/authorize`);
  u.searchParams.set("client_id", config.userPoolClientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("redirect_uri", config.redirectUri);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("code_challenge", challenge);
  // Skip Cognito's provider-chooser screen and go straight to Identity Center.
  u.searchParams.set("identity_provider", "AWSIdentityCenter");
  window.location.href = u.toString();
};

export const handleCallback = async (): Promise<boolean> => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return false;
  const verifier = localStorage.getItem(KEY_VERIFIER);
  if (!verifier) return false;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.userPoolClientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });
  const res = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return false;
  const tokens = (await res.json()) as { id_token: string };
  localStorage.setItem(KEY_TOKEN, tokens.id_token);
  localStorage.removeItem(KEY_VERIFIER);
  window.history.replaceState(null, "", window.location.pathname);
  return true;
};

export const logout = () => {
  localStorage.removeItem(KEY_TOKEN);
  const u = new URL(`${config.cognitoDomain}/logout`);
  u.searchParams.set("client_id", config.userPoolClientId);
  u.searchParams.set("logout_uri", window.location.origin);
  window.location.href = u.toString();
};

export const me = (): { email?: string } => {
  const t = getToken();
  if (!t) return {};
  try {
    const [, p] = t.split(".");
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
};
