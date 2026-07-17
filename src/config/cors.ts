/**
 * Resolves the `origin` option for CORS from the CORS_ORIGIN env var.
 *
 * - Non-empty value: comma-separated allowlist of origins.
 * - Empty in development/test: any origin (local tooling convenience).
 * - Empty in production: cross-origin access disabled. Joi already rejects
 *   this configuration at startup; this is defense in depth so an allow-all
 *   with credentials can never ship.
 */
export function resolveCorsOrigin(
  corsOrigin: string | undefined,
  nodeEnv: string | undefined,
): string[] | boolean {
  const origins =
    corsOrigin
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  if (origins.length > 0) return origins;
  return nodeEnv !== 'production';
}
