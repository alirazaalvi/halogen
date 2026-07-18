export function normalizeDisplayScore(value: unknown): number | null {
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
