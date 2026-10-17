/**
 * Config-driven SCB PxWeb indicators for DeSO-level demographics (DR-32).
 *
 * An indicator is a share (numerator / denominator * 100) or a plain value read from one
 * table. Variable and value codes are NOT guessed: every code in a spec is validated against
 * the live table metadata before a query is sent, and a mismatch fails the step with no
 * writes. Use `run.ts scb-describe <table path>` to list the real codes, then add a spec to
 * `STOCKHOLM_SCB_INDICATORS`.
 */
import type { JsonFetcher } from "./scb-population";
import { pickLatestPeriods } from "./scb-population";

export type DemographicColumn =
  | "median_income"
  | "higher_edu_pct"
  | "foreign_born_pct"
  | "families_with_kids_pct";

export type PxIndicatorSpec = {
  id: string;
  /** PxWeb table URL, e.g. https://api.scb.se/OV0104/v1/doris/en/ssd/START/... */
  tableUrl: string;
  column: DemographicColumn;
  /** Variable code -> value codes summed into the numerator (or the value). */
  numerator: Record<string, string[]>;
  /** Variable code -> value codes summed into the denominator. Omit for a plain value. */
  denominator?: Record<string, string[]>;
  /** Stored value is multiplied by this (100 for shares). Default 100 with denominator, else 1. */
  scale?: number;
};

type PxVariable = { code?: string; values?: unknown[]; elimination?: boolean };
type PxMetadata = { variables?: PxVariable[] };

export type IndicatorValue = { value: number; year: number };

/** Verified indicators for Stockholm. Empty until codes are confirmed with `scb-describe`. */
export const STOCKHOLM_SCB_INDICATORS: PxIndicatorSpec[] = [];

export function validateSpec(spec: PxIndicatorSpec, metadata: PxMetadata): void {
  const variables = new Map((metadata.variables ?? []).map((v) => [String(v.code), v]));
  for (const required of ["Region", "Tid"]) {
    if (!variables.has(required)) {
      throw new Error(`${spec.id}: table has no ${required} variable`);
    }
  }

  const check = (selection: Record<string, string[]>, part: string) => {
    for (const [code, values] of Object.entries(selection)) {
      const variable = variables.get(code);
      if (!variable) throw new Error(`${spec.id}: ${part} uses unknown variable ${code}`);
      if (code === "Region" || code === "Tid") {
        throw new Error(`${spec.id}: ${part} must not select ${code}`);
      }
      const known = new Set((variable.values ?? []).map(String));
      for (const value of values) {
        if (!known.has(value)) {
          throw new Error(`${spec.id}: ${part} value ${code}=${value} is not in the table`);
        }
      }
    }
  };
  check(spec.numerator, "numerator");
  if (spec.denominator) check(spec.denominator, "denominator");

  // Every variable that is neither selected nor eliminable would make the query ambiguous.
  const selectedCodes = new Set([
    ...Object.keys(spec.numerator),
    ...Object.keys(spec.denominator ?? {}),
  ]);
  for (const [code, variable] of variables) {
    if (["Region", "Tid"].includes(code) || selectedCodes.has(code)) continue;
    if (variable.elimination !== true) {
      throw new Error(`${spec.id}: variable ${code} is required but not selected in the spec`);
    }
  }
}

/**
 * Sums a JSON-stat 2 response over every dimension except region and time.
 * Returns region -> period -> sum; a region/period with any missing cell is null.
 */
export function parseJsonStat2Sums(
  payload: unknown,
  regionDim = "Region",
  timeDim = "Tid",
): Map<string, Map<string, number | null>> {
  const root = payload as {
    id?: string[];
    size?: number[];
    dimension?: Record<string, { category?: { index?: unknown } }>;
    value?: Array<number | null>;
  } | null;
  if (!root || !Array.isArray(root.id) || !Array.isArray(root.size) || !Array.isArray(root.value)) {
    throw new Error("Unexpected JSON-stat response shape");
  }
  const { id: ids, size: sizes, value: values } = root;
  const regionPos = ids.indexOf(regionDim);
  const timePos = ids.indexOf(timeDim);
  if (regionPos < 0 || timePos < 0) throw new Error("JSON-stat response lacks Region/Tid");

  const order = (dim: string): string[] => {
    const index = root.dimension?.[dim]?.category?.index;
    if (Array.isArray(index)) return index.map(String);
    if (index && typeof index === "object") {
      return Object.entries(index as Record<string, number>)
        .sort((a, b) => a[1] - b[1])
        .map(([code]) => code);
    }
    return [];
  };
  const regions = order(ids[regionPos]);
  const periods = order(ids[timePos]);

  const strides = new Array<number>(ids.length).fill(1);
  for (let i = ids.length - 2; i >= 0; i -= 1) strides[i] = strides[i + 1] * sizes[i + 1];

  const otherDims = ids.map((_, i) => i).filter((i) => i !== regionPos && i !== timePos);
  const result = new Map<string, Map<string, number | null>>();

  for (let r = 0; r < sizes[regionPos]; r += 1) {
    for (let t = 0; t < sizes[timePos]; t += 1) {
      let sum = 0;
      let missing = false;
      const walk = (depth: number, offset: number) => {
        if (depth === otherDims.length) {
          const cell = values[offset];
          if (typeof cell === "number" && Number.isFinite(cell)) sum += cell;
          else missing = true;
          return;
        }
        const dim = otherDims[depth];
        for (let k = 0; k < sizes[dim]; k += 1) walk(depth + 1, offset + k * strides[dim]);
      };
      walk(0, r * strides[regionPos] + t * strides[timePos]);

      const region = regions[r];
      const period = periods[t];
      if (!region || !period) continue;
      if (!result.has(region)) result.set(region, new Map());
      result.get(region)?.set(period, missing ? null : sum);
    }
  }
  return result;
}

async function fetchSums(
  fetchJson: JsonFetcher,
  spec: PxIndicatorSpec,
  selection: Record<string, string[]>,
  regions: string[],
  period: string,
  chunkSize: number,
  delayMs: number,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  for (let i = 0; i < regions.length; i += chunkSize) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const chunk = regions.slice(i, i + chunkSize);
    const payload = await fetchJson(
      spec.tableUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: [
            { code: "Region", selection: { filter: "item", values: chunk } },
            ...Object.entries(selection).map(([code, values]) => ({
              code,
              selection: { filter: "item", values },
            })),
            { code: "Tid", selection: { filter: "item", values: [period] } },
          ],
          response: { format: "json-stat2" },
        }),
      },
      `SCB ${spec.id}`,
      60000,
    );
    for (const [region, perPeriod] of parseJsonStat2Sums(payload)) {
      out.set(region, perPeriod.get(period) ?? null);
    }
  }
  return out;
}

export async function fetchIndicator(
  fetchJson: JsonFetcher,
  spec: PxIndicatorSpec,
  desoIds: readonly string[],
  options?: { chunkSize?: number; delayMs?: number },
): Promise<Map<string, IndicatorValue>> {
  const chunkSize = options?.chunkSize ?? 200;
  const delayMs = options?.delayMs ?? 1100;

  const metadata = (await fetchJson(
    spec.tableUrl,
    { method: "GET" },
    `SCB ${spec.id} metadata`,
  )) as PxMetadata;
  validateSpec(spec, metadata);

  const variables = metadata.variables ?? [];
  const tid = variables.find((v) => v.code === "Tid");
  const period = pickLatestPeriods((tid?.values ?? []).map(String), 1)[0];
  if (!period) throw new Error(`${spec.id}: table lists no yearly period`);

  const known = new Set((variables.find((v) => v.code === "Region")?.values ?? []).map(String));
  const regions = [...new Set(desoIds)].filter((id) => known.has(id));

  const numerators = await fetchSums(
    fetchJson,
    spec,
    spec.numerator,
    regions,
    period,
    chunkSize,
    delayMs,
  );
  const denominators = spec.denominator
    ? await fetchSums(fetchJson, spec, spec.denominator, regions, period, chunkSize, delayMs)
    : null;
  const scale = spec.scale ?? (spec.denominator ? 100 : 1);

  const result = new Map<string, IndicatorValue>();
  for (const region of regions) {
    const num = numerators.get(region);
    if (num === null || num === undefined) continue;
    if (denominators) {
      const den = denominators.get(region);
      if (den === null || den === undefined || den <= 0) continue;
      result.set(region, {
        value: Math.round((num / den) * scale * 100) / 100,
        year: Number(period),
      });
    } else {
      result.set(region, { value: Math.round(num * scale * 100) / 100, year: Number(period) });
    }
  }
  return result;
}
