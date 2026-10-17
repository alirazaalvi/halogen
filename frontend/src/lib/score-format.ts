/** Display helpers. Missing values are shown as "-", never as 0. */

export function normalizeDisplayScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function formatDisplayScore(value: unknown): string {
  const normalized = normalizeDisplayScore(value);
  return normalized == null ? "-" : String(normalized);
}

export function roundToInt(value: number): number {
  return Math.round(value);
}

/** Formats a number, or "-" when it is missing. */
export function formatOrDash(
  value: number | null | undefined,
  format: (n: number) => string = (n) => String(Math.round(n)),
): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "-" : format(value);
}
