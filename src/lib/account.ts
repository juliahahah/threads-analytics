/**
 * Account input normalisation.
 *
 * Kept out of the route file because Next route modules may only export HTTP
 * handlers — and keeping it here makes it unit-testable (see tests/).
 */

/** Accepts "@name", "name", or any threads.net/.com profile or post URL. */
export function parseAccount(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  const urlMatch = raw.match(/threads\.(?:net|com)\/@?([A-Za-z0-9._]+)/i);
  const candidate = urlMatch ? urlMatch[1] : raw.replace(/^@/, '');

  // Threads usernames: letters, digits, underscore, period; max 30 chars.
  return /^[A-Za-z0-9._]{1,30}$/.test(candidate) ? candidate.toLowerCase() : null;
}
