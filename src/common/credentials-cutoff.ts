/**
 * Truncates a revocation cutoff to whole seconds.
 *
 * A JWT `iat` claim is expressed in whole seconds, so storing sub-second
 * precision would reject the token issued by the very request that changed the
 * credentials: a change at t=1000.4s issues a token at t=1000.5s whose `iat` is
 * 1000, and 1000000 < 1000400 rejects it on the next request. Truncating keeps
 * that token valid and still rejects every token issued in an earlier second.
 *
 * The accepted cost is a sub-second window: a token issued in the same second
 * as the change survives. That is not reachable on purpose, and the alternative
 * trades it for a guaranteed logout on every password change.
 */
export function credentialsCutoff(now: Date = new Date()): Date {
  return new Date(Math.floor(now.getTime() / 1000) * 1000);
}
