import type { CatalogEntry, QueryStyle } from "./catalog.js";
import { SCB_PXWEB_API_ROOT, fetchJson } from "./catalog.js";

export type PxwebNode = {
  id: string;
  type: "l" | "t";
  text: string;
  updated?: string;
};

export type PxwebVariable = {
  code?: string;
  text?: string;
  values?: string[];
  valueTexts?: string[];
  elimination?: boolean;
  time?: boolean;
};

export type PxwebTableMetadata = {
  title?: string;
  updated?: string;
  variables?: PxwebVariable[];
};

export type PxwebVariableSummary = {
  code: string;
  text: string;
  values_count: number;
  time: boolean;
  elimination: boolean;
};

export type DesoListItem = {
  level: "country" | "county" | "municipality" | "deso" | "other";
  source_code: string;
  code: string;
  label: string;
  county_code: string | null;
  municipality_code: string | null;
  version: "2025" | "legacy" | "other";
};

const PXWEB_DEEP_DISCOVERY_PATHS = ["", "BE", "BE/BE0101", "BE/BE0101/BE0101Y"];
export const PXWEB_DESO_TABLE_PATH = "BE/BE0101/BE0101Y/FolkmDesoAldKon";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function ensurePxwebUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const normalized = pathOrUrl.replace(/^\/+/, "");
  return normalized.length === 0
    ? SCB_PXWEB_API_ROOT
    : `${SCB_PXWEB_API_ROOT.replace(/\/$/, "")}/${normalized}`;
}

export function pxwebPathFromUrl(pathOrUrl: string): string {
  if (!/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl.replace(/^\/+/, "");
  }

  return pathOrUrl
    .replace(/^https?:\/\/api\.scb\.se\/OV0104\/v1\/doris\/en\/ssd\/START\/?/i, "")
    .replace(/^\/+/, "");
}

function toNodeList(payload: unknown): PxwebNode[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const nodes = payload
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : null;
      const type = record.type === "l" || record.type === "t" ? record.type : null;
      const text = typeof record.text === "string" ? normalizeWhitespace(record.text) : null;
      const updated = typeof record.updated === "string" ? record.updated : undefined;

      if (!id || !type || !text) {
        return null;
      }

      return { id, type, text, updated } satisfies PxwebNode;
    })
    .filter((item) => item !== null);

  return nodes;
}

function toTableMetadata(payload: unknown): PxwebTableMetadata {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const variables = Array.isArray(record.variables)
    ? record.variables
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const variable = item as Record<string, unknown>;
          return {
            code: typeof variable.code === "string" ? variable.code : undefined,
            text: typeof variable.text === "string" ? variable.text : undefined,
            values: Array.isArray(variable.values) ? variable.values.map((value) => String(value)) : undefined,
            valueTexts: Array.isArray(variable.valueTexts)
              ? variable.valueTexts.map((value) => String(value))
              : undefined,
            elimination: variable.elimination === true,
            time: variable.time === true,
          } satisfies PxwebVariable;
        })
        .filter((item) => item !== null)
    : undefined;

  return {
    title: typeof record.title === "string" ? normalizeWhitespace(record.title) : undefined,
    updated: typeof record.updated === "string" ? record.updated : undefined,
    variables,
  };
}

export async function fetchPxwebNodes(pathOrUrl: string): Promise<PxwebNode[]> {
  const payload = await fetchJson(ensurePxwebUrl(pathOrUrl));
  return toNodeList(payload);
}

export async function fetchPxwebTableMetadata(pathOrUrl: string): Promise<PxwebTableMetadata> {
  const payload = await fetchJson(ensurePxwebUrl(pathOrUrl));
  return toTableMetadata(payload);
}

export function summarizePxwebTableMetadata(metadata: PxwebTableMetadata): {
  title: string | null;
  updated: string | null;
  variables: PxwebVariableSummary[];
} {
  return {
    title: metadata.title ?? null,
    updated: metadata.updated ?? null,
    variables: (metadata.variables ?? []).map((variable) => ({
      code: variable.code ?? "",
      text: variable.text ?? "",
      values_count: variable.values?.length ?? 0,
      time: variable.time === true,
      elimination: variable.elimination === true,
    })),
  };
}

function pxwebNotesForPath(path: string, item: PxwebNode): string {
  if (path === "BE/BE0101/BE0101Y") {
    return `Discovered from the PxWeb lower-than-municipality population branch for DeSO/RegSO: ${item.text}.`;
  }

  return `Discovered from the SCB PxWeb tree at ${path || "START"}: ${item.text}.`;
}

function pxwebBestFor(path: string, item: PxwebNode): string[] {
  const text = `${path} ${item.id} ${item.text}`.toLowerCase();
  const tags: string[] = ["pxweb-discovery"];

  if (text.includes("deso")) {
    tags.push("deso-list", "deso-statistics");
  }
  if (text.includes("regso")) {
    tags.push("regso-list", "regso-statistics");
  }
  if (text.includes("population")) {
    tags.push("population-statistics");
  }
  if (item.type === "t") {
    tags.push("table-metadata");
  } else {
    tags.push("tree-browse");
  }

  return unique(tags);
}

function pxwebQueryStyle(item: PxwebNode): QueryStyle {
  return item.type === "t" ? "pxweb-query" : "pxweb-metadata";
}

function pxwebEntryId(path: string, item: PxwebNode): string {
  return `scb-pxweb-${item.type === "t" ? "table" : "node"}-${slugify(path ? `${path}-${item.id}` : item.id)}`;
}

function pathSegments(path: string, item?: PxwebNode): string[] {
  const base = path.split("/").filter(Boolean);
  return item ? [...base, item.id] : base;
}

export async function discoverPxwebCatalogEntries(): Promise<CatalogEntry[]> {
  const results: CatalogEntry[] = [];

  for (const path of PXWEB_DEEP_DISCOVERY_PATHS) {
    const nodes = await fetchPxwebNodes(path);

    for (const node of nodes) {
      const nodePath = pathSegments(path, node).join("/");
      const entry: CatalogEntry = {
        id: pxwebEntryId(path, node),
        title: node.text,
        source_family: "pxweb",
        surface: node.id,
        canonical_url: ensurePxwebUrl(nodePath),
        query_style: pxwebQueryStyle(node),
        formats: ["json"],
        best_for: pxwebBestFor(path, node),
        priority: path === "BE/BE0101/BE0101Y" || nodePath === "BE/BE0101" ? "high" : "medium",
        notes: pxwebNotesForPath(path || "START", node),
        metadata: {
          node_kind: node.type === "t" ? "table" : "folder",
          pxweb_path: nodePath,
          path_segments: pathSegments(path, node),
          updated: node.updated ?? null,
        },
        rate_limit_notes:
          "SCB states a limit of 10 requests per 10 seconds from one IP and a maximum of 100,000 values per table.",
      };

      if (node.type === "t") {
        const metadata = await fetchPxwebTableMetadata(nodePath);
        entry.metadata = {
          ...(entry.metadata ?? {}),
          table_id: node.id,
          updated: metadata.updated ?? node.updated ?? null,
          variables_summary: summarizePxwebTableMetadata(metadata).variables,
        };
      }

      results.push(entry);
    }
  }

  return results;
}

export function parsePxwebRegionVariable(variable: PxwebVariable): DesoListItem[] {
  const values = variable.values ?? [];
  const texts = variable.valueTexts ?? [];

  return values.map((sourceCode, index) => {
    const label = texts[index] ?? sourceCode;

    if (sourceCode === "00") {
      return {
        level: "country",
        source_code: sourceCode,
        code: sourceCode,
        label,
        county_code: null,
        municipality_code: null,
        version: "other",
      };
    }

    if (/^\d{2}$/.test(sourceCode)) {
      return {
        level: "county",
        source_code: sourceCode,
        code: sourceCode,
        label,
        county_code: sourceCode,
        municipality_code: null,
        version: "other",
      };
    }

    if (/^\d{4}$/.test(sourceCode)) {
      return {
        level: "municipality",
        source_code: sourceCode,
        code: sourceCode,
        label,
        county_code: sourceCode.slice(0, 2),
        municipality_code: sourceCode,
        version: "other",
      };
    }

    const versionedMatch = sourceCode.match(/^([0-9A-Z]+)_DeSO(20\d{2})$/i);
    if (versionedMatch) {
      const code = versionedMatch[1];
      return {
        level: "deso",
        source_code: sourceCode,
        code,
        label,
        county_code: code.slice(0, 2),
        municipality_code: code.slice(0, 4),
        version: versionedMatch[2] === "2025" ? "2025" : "other",
      };
    }

    if (/^[0-9A-Z]{9}$/.test(sourceCode)) {
      return {
        level: "deso",
        source_code: sourceCode,
        code: sourceCode,
        label,
        county_code: sourceCode.slice(0, 2),
        municipality_code: sourceCode.slice(0, 4),
        version: "legacy",
      };
    }

    return {
      level: "other",
      source_code: sourceCode,
      code: sourceCode,
      label,
      county_code: null,
      municipality_code: null,
      version: "other",
    };
  });
}

export async function fetchDesoList(options?: {
  countyCode?: string;
  municipalityCode?: string;
  version?: "2025" | "legacy" | "both";
  limit?: number;
}): Promise<{
  table_path: string;
  table_title: string | null;
  total_regions: number;
  filtered_regions: number;
  items: DesoListItem[];
}> {
  const metadata = await fetchPxwebTableMetadata(PXWEB_DESO_TABLE_PATH);
  const regionVariable = (metadata.variables ?? []).find((variable) => variable.code === "Region");

  if (!regionVariable) {
    throw new Error("PxWeb table does not expose a Region variable.");
  }

  const requestedVersion = options?.version ?? "2025";
  let items = parsePxwebRegionVariable(regionVariable).filter((item) => item.level === "deso");

  if (options?.countyCode) {
    items = items.filter((item) => item.county_code === options.countyCode);
  }

  if (options?.municipalityCode) {
    items = items.filter((item) => item.municipality_code === options.municipalityCode);
  }

  if (requestedVersion !== "both") {
    items = items.filter((item) => item.version === requestedVersion);
  }

  const limit = options?.limit ?? 200;

  return {
    table_path: PXWEB_DESO_TABLE_PATH,
    table_title: metadata.title ?? null,
    total_regions: regionVariable.values?.length ?? 0,
    filtered_regions: items.length,
    items: items.slice(0, limit),
  };
}
