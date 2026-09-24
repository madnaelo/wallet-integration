export function frontendDomainEnvironment(siteUrl, retainedOrigins = "") {
  function origin(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.origin !== value || url.username || url.password || url.port) {
      throw new Error("Production frontend URLs must be explicit HTTPS origins without paths or credentials.");
    }
    return url;
  }

  const site = origin(siteUrl);
  const allowed = [...new Set([site.origin, ...retainedOrigins.split(",").filter(Boolean).map((value) => origin(value).origin)])];
  return {
    APP_URL: site.origin,
    FRONTEND_URL: site.origin,
    AUTH_SIGNING_DOMAIN: site.hostname,
    AUTH_SIGNING_URI: site.origin,
    CORS_ALLOWED_ORIGINS: allowed.join(","),
    FRONTEND_ORIGINS: allowed.join(","),
  };
}
