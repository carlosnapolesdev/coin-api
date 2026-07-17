import type { OnboardingState } from '../auth/dto/auth-response.dto';

/**
 * Coerces an arbitrary persisted value into a well-formed OnboardingState,
 * falling back to safe defaults for any missing or malformed field. Shared by
 * AuthService (profile mapping) and UsersService (profile + onboarding writes).
 */
export function normalizeOnboardingState(raw: unknown): OnboardingState {
  const value =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const coachSeen = value.coachSeen;
  const tourVersion = value.tourVersion;
  return {
    coachSeen:
      Array.isArray(coachSeen) &&
      coachSeen.every((item) => typeof item === 'string')
        ? coachSeen
        : [],
    checklistDismissed:
      typeof value.checklistDismissed === 'boolean'
        ? value.checklistDismissed
        : false,
    celebrationShown:
      typeof value.celebrationShown === 'boolean'
        ? value.celebrationShown
        : false,
    reportsVisited:
      typeof value.reportsVisited === 'boolean' ? value.reportsVisited : false,
    tourVersion:
      typeof tourVersion === 'number' &&
      Number.isInteger(tourVersion) &&
      tourVersion >= 0
        ? tourVersion
        : 0,
  };
}
