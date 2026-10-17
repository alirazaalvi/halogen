/**
 * Real DeSO population from SCB PxWeb (table BE/BE0101/BE0101Y/FolkmDesoAldKon).
 *
 * The table's variables (verified in scb-mcp/data/scb-catalog.json) are
 * Region, Alder (eliminable), Kon (eliminable), ContentsCode and Tid. Omitting the
 * eliminable variables returns totals. The latest published period comes from table
 * metadata, never from the calendar (DR-25).
 */
import { ensurePxwebUrl, PXWEB_DESO_TABLE_PATH } from "../../../../scb-mcp/src/pxweb.js";

export type JsonFetcher = (
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs?: number,
) => Promise<unknown>;

export type DesoPopulation = {
  /** Population in the latest period, or null if SCB reports no value. */
  population: number | null;
  /** Population in the period before, or null. */
  previous: number | null;
};

export type DesoPopulationResult = {
  year: number;
  previousYear: number | null;
  sourceUrl: string;
  byDeso: Map<string, DesoPopulation>;
};

type PxVariable = { code?: string; values?: unknown[] };

export function pickLatestPeriods(values: readonly string[], count = 2): string[] {
  return values
    .filter((value) => /^\d{4}$/.test(value))
    .sort((a, b) => Number(a) - Number(b))
    .slice(-count);
}

/** Population growth in percent between two periods, or null when either is missing. */
export function growthPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function categoryOrder(category: unknown): string[] {
  const index = (category as { index?: unknown } | undefined)?.index;
  if (Array.isArray(index)) return index.map(String);
  if (index && typeof index === "object") {
    return Object.entries(index as Record<string, number>)
      .sort((a, b) => a[1] - b[1])
      .map(([code]) => code);
  }
  return [];
}

/**
 * Parses a JSON-stat 2 response into `region -> period -> value`.
 * Throws if the payload does not have the expected shape, so callers can record a failure.
 */
export function parseJsonStat2ByRegionAndPeriod(
  payload: unknown,
  regionDim = "Region",
  timeDim = "Tid",
): Map<string, Map<string, number | null>> {
  const root = payload as {
    id?: string[];
    size?: number[];
    dimension?: Record<string, { category?: unknown }>;
    value?: Array<number | null>;
  } | null;

  if (!root || !Array.isArray(root.id) || !Array.isArray(root.size) || !Array.isArray(root.value)) {
    throw new Error("Unexpected JSON-stat response shape");
  }
  const ids = root.id;
  const sizes = root.size;
  const regionPos = ids.indexOf(regionDim);
  const timePos = ids.indexOf(timeDim);
  if (regionPos < 0 || timePos < 0) {
    throw new Error(`JSON-stat response lacks ${regionDim}/${timeDim} dimensions`);
  }

  const orders = ids.map((id) => categoryOrder(root.dimension?.[id]?.category));
  const strides = new Array<number>(ids.length).fill(1);
  for (let i = ids.length - 2; i >= 0; i -= 1) strides[i] = strides[i + 1] * sizes[i + 1];

  const result = new Map<string, Map<string, number | null>>();
  // Every other dimension must have a single category (ContentsCode) or be absent.
  for (let r = 0; r < sizes[regionPos]; r += 1) {
    for (let t = 0; t < sizes[timePos]; t += 1) {
      const flat = r * strides[regionPos] + t * strides[timePos];
      const raw = root.value[flat];
      const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      const region = orders[regionPos][r];
      const period = orders[timePos][t];
      if (!region || !period) continue;
      if (!result.has(region)) result.set(region, new Map());
      result.get(region)?.set(period, value);
    }
  }
  return result;
}

export async function fetchDesoPopulation(
  fetchJson: JsonFetcher,
  desoIds: readonly string[],
  options?: { endpoint?: string; chunkSize?: number; delayMs?: number },
): Promise<DesoPopulationResult> {
  const endpoint = options?.endpoint ?? ensurePxwebUrl(PXWEB_DESO_TABLE_PATH);
  const chunkSize = options?.chunkSize ?? 400;
  const delayMs = options?.delayMs ?? 1100; // SCB: 10 requests / 10 s

  const metadata = (await fetchJson(endpoint, { method: "GET" }, "SCB DeSO metadata", 30000)) as {
    variables?: PxVariable[];
  };
  const variables = metadata?.variables ?? [];
  const tid = variables.find((v) => v.code === "Tid");
  const contents = variables.find((v) => v.code === "ContentsCode");
  const region = variables.find((v) => v.code === "Region");
  if (!tid || !contents || !region) {
    throw new Error("SCB DeSO table metadata lacks Region/ContentsCode/Tid");
  }

  const periods = pickLatestPeriods((tid.values ?? []).map(String));
  if (periods.length === 0) throw new Error("SCB DeSO table lists no yearly periods");
  const contentsCode = String(contents.values?.[0] ?? "");
  if (!contentsCode) throw new Error("SCB DeSO table lists no ContentsCode");

  const known = new Set((region.values ?? []).map(String));
  const requested = [...new Set(desoIds)].filter((id) => known.has(id));
  const latest = periods[periods.length - 1];
  const previous = periods.length > 1 ? periods[0] : null;

  const byDeso = new Map<string, DesoPopulation>();
  for (let i = 0; i < requested.length; i += chunkSize) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const chunk = requested.slice(i, i + chunkSize);
    const payload = await fetchJson(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: [
            { code: "Region", selection: { filter: "item", values: chunk } },
            { code: "ContentsCode", selection: { filter: "item", values: [contentsCode] } },
            { code: "Tid", selection: { filter: "item", values: periods } },
          ],
          response: { format: "json-stat2" },
        }),
      },
      "SCB DeSO population",
      60000,
    );

    for (const [code, perPeriod] of parseJsonStat2ByRegionAndPeriod(payload)) {
      byDeso.set(code, {
        population: perPeriod.get(latest) ?? null,
        previous: previous ? (perPeriod.get(previous) ?? null) : null,
      });
    }
  }

  return {
    year: Number(latest),
    previousYear: previous ? Number(previous) : null,
    sourceUrl: endpoint,
    byDeso,
  };
}
