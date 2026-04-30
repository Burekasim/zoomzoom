// These get filled in by the deploy script after `terraform apply`.
// Locally, copy .env.example to .env.local and set the VITE_ vars.
export const config = {
  apiUrl: import.meta.env.VITE_API_URL as string,
  cognitoDomain: import.meta.env.VITE_COGNITO_DOMAIN as string,
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID as string,
  redirectUri:
    typeof window !== "undefined"
      ? `${window.location.origin}/callback`
      : "",
};
