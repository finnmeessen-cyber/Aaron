import "server-only";

let hasLoggedFatSecretEnv = false;

function logFatSecretEnvPresence() {
  if (hasLoggedFatSecretEnv) {
    return;
  }

  hasLoggedFatSecretEnv = true;
  console.log("FatSecret env loaded:", {
    hasClientId: Boolean(process.env.FATSECRET_CLIENT_ID),
    hasClientSecret: Boolean(process.env.FATSECRET_CLIENT_SECRET),
    hasLocalRedirectUri: Boolean(process.env.FATSECRET_REDIRECT_URI_LOCAL),
    hasProductionRedirectUri: Boolean(process.env.FATSECRET_REDIRECT_URI_PRODUCTION)
  });
}

function isLocalRequestHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function resolveFatSecretRedirectUri(requestUrl?: string) {
  const localRedirectUri = process.env.FATSECRET_REDIRECT_URI_LOCAL?.trim() || null;
  const productionRedirectUri =
    process.env.FATSECRET_REDIRECT_URI_PRODUCTION?.trim() || null;

  if (requestUrl) {
    const request = new URL(requestUrl);

    return isLocalRequestHost(request.hostname)
      ? localRedirectUri
      : productionRedirectUri;
  }

  return process.env.VERCEL_ENV === "production"
    ? productionRedirectUri
    : localRedirectUri;
}

function getFatSecretRedirectTargetLabel(requestUrl?: string) {
  if (requestUrl) {
    return isLocalRequestHost(new URL(requestUrl).hostname)
      ? "FATSECRET_REDIRECT_URI_LOCAL"
      : "FATSECRET_REDIRECT_URI_PRODUCTION";
  }

  return process.env.VERCEL_ENV === "production"
    ? "FATSECRET_REDIRECT_URI_PRODUCTION"
    : "FATSECRET_REDIRECT_URI_LOCAL";
}

function getFatSecretClientCredentials() {
  const clientId = process.env.FATSECRET_CLIENT_ID?.trim();
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing FatSecret environment variables. Add FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET."
    );
  }

  return {
    clientId,
    clientSecret
  };
}

export function hasFatSecretEnv(requestUrl?: string) {
  logFatSecretEnvPresence();

  return Boolean(
    process.env.FATSECRET_CLIENT_ID &&
      process.env.FATSECRET_CLIENT_SECRET &&
      resolveFatSecretRedirectUri(requestUrl)
  );
}

export function hasFatSecretOAuth2Env() {
  logFatSecretEnvPresence();

  return Boolean(
    process.env.FATSECRET_CLIENT_ID &&
      process.env.FATSECRET_CLIENT_SECRET
  );
}

export function getFatSecretEnv(requestUrl?: string) {
  logFatSecretEnvPresence();

  const { clientId, clientSecret } = getFatSecretClientCredentials();
  const redirectUri = resolveFatSecretRedirectUri(requestUrl);

  if (!redirectUri) {
    throw new Error(`Missing ${getFatSecretRedirectTargetLabel(requestUrl)} for FatSecret.`);
  }

  return {
    clientId,
    clientSecret,
    redirectUri
  };
}

export function getFatSecretClientEnv() {
  logFatSecretEnvPresence();

  return getFatSecretClientCredentials();
}

export function getFatSecretOAuth2Env() {
  logFatSecretEnvPresence();

  return getFatSecretClientCredentials();
}
