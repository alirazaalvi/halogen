import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPxwebCatalogEntries } from "./pxweb.js";

export type SourceFamily =
  | "open_data_root"
  | "pxweb"
  | "open_geodata"
  | "myndighetsregistret"
  | "branschnyckeltal"
  | "vardefulla_datamangder";

export type QueryStyle =
  | "landing-page"
  | "pxweb-metadata"
  | "pxweb-query"
  | "metadata-only"
  | "wfs-download"
  | "wms-wfs";

export type CatalogEntry = {
  id: string;
  title: string;
  source_family: SourceFamily;
  surface: string;
  canonical_url: string;
  query_style: QueryStyle;
  formats: string[];
  best_for: string[];
  priority: "high" | "medium" | "low";
  notes: string;
  capabilities_url?: string;
  download_urls?: string[];
  coverage?: string;
  version_hint?: string;
  language?: string;
  metadata?: Record<string, unknown>;
  rate_limit_notes?: string;
};

export type CatalogFile = {
  generated_at: string;
  source_urls: string[];
  entries: CatalogEntry[];
};

type Anchor = {
  href: string;
  label: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = path.resolve(__dirname, "../data/scb-catalog.json");

export const SCB_OPEN_DATA_ROOT = "https://www.scb.se/vara-tjanster/oppna-data/";
export const SCB_PXWEB_PAGE = "https://www.scb.se/vara-tjanster/oppna-data/pxwebapi/";
export const SCB_PXWEB_API_ROOT = "https://api.scb.se/OV0104/v1/doris/en/ssd/START";
export const SCB_STATISTICAL_DATABASE = "https://www.statistikdatabasen.scb.se/pxweb/en/ssd/";
export const SCB_OPEN_GEODATA_ROOT = "https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/";
export const SCB_GEOSERVER_WFS =
  "https://geodata.scb.se/geoserver/stat/wfs?service=wfs&version=1.1.0&request=GetCapabilities";
export const SCB_GEOSERVER_WMS =
  "https://geodata.scb.se/geoserver/stat/wms?service=wms&version=1.3.0&request=GetCapabilities";

const REQUEST_TIMEOUT_MS = 20_000;
const SCB_RATE_LIMIT_NOTE =
  "SCB states a limit of 10 requests per 10 seconds from one IP and a maximum of 100,000 values per table.";

function baseEntries(): CatalogEntry[] {
  return [
    {
      id: "scb-open-data-root",
      title: "SCB Open Data Root",
      source_family: "open_data_root",
      surface: "Open data",
      canonical_url: SCB_OPEN_DATA_ROOT,
      query_style: "landing-page",
      formats: ["html"],
      best_for: ["catalog-root", "surface-discovery"],
      priority: "high",
      notes: "Top-level discovery page for all official SCB open-data surfaces.",
      language: "sv",
      rate_limit_notes: SCB_RATE_LIMIT_NOTE,
    },
    {
      id: "scb-pxweb-api",
      title: "SCB PxWeb API",
      source_family: "pxweb",
      surface: "Statistical database",
      canonical_url: SCB_PXWEB_PAGE,
      query_style: "pxweb-query",
      formats: ["html", "json"],
      best_for: ["official-statistics", "tabular-statistics", "metadata-discovery"],
      priority: "high",
      notes: "Preferred official SCB surface for structured tabular statistics and variable-driven queries.",
      language: "en",
      metadata: {
        api_root: SCB_PXWEB_API_ROOT,
        database_root: SCB_STATISTICAL_DATABASE,
      },
      rate_limit_notes: SCB_RATE_LIMIT_NOTE,
    },
    {
      id: "scb-open-geodata-root",
      title: "SCB Open Geodata",
      source_family: "open_geodata",
      surface: "Open geodata",
      canonical_url: SCB_OPEN_GEODATA_ROOT,
      query_style: "wms-wfs",
      formats: ["html", "wfs", "wms", "geopackage"],
      best_for: ["geometry", "spatial-layers", "wfs", "wms", "download-discovery"],
      priority: "high",
      notes: "Preferred official SCB surface for DeSO, RegSO, grids, localities, and other spatial datasets.",
      capabilities_url: SCB_GEOSERVER_WFS,
      metadata: {
        wfs_capabilities_url: SCB_GEOSERVER_WFS,
        wms_capabilities_url: SCB_GEOSERVER_WMS,
      },
      language: "en",
      rate_limit_notes: SCB_RATE_LIMIT_NOTE,
    },
    {
      id: "scb-open-geodata-deso",
      title: "DeSO - Demographic Statistical Areas",
      source_family: "open_geodata",
      surface: "DeSO",
      canonical_url:
        "https://www.scb.se/en/services/open-data-api/open-geodata/open-data-for-deso--demographic-statistical-areas/",
      query_style: "wfs-download",
      formats: ["html", "wfs", "wms", "geopackage"],
      best_for: ["deso-boundaries", "polygon-lookup", "spatial-joins"],
      priority: "high",
      notes: "Preferred source for official DeSO geometry and versioned downloadable datasets.",
      capabilities_url: SCB_GEOSERVER_WFS,
      coverage: "Sweden",
      version_hint: "2025",
      rate_limit_notes: SCB_RATE_LIMIT_NOTE,
    },
    {
      id: "scb-open-geodata-regso",
      title: "RegSO - Regional Statistical Areas",
      source_family: "open_geodata",
      surface: "RegSO",
      canonical_url:
        "https://www.scb.se/en/services/open-data-api/open-geodata/open-data-for-regso--regional-statistical-areas/",
      query_style: "wfs-download",
      formats: ["html", "wfs", "wms", "geopackage"],
      best_for: ["regso-boundaries", "regional-polygons", "spatial-joins"],
      priority: "high",
      notes: "Official source for RegSO spatial datasets and related geometry discovery.",
      capabilities_url: SCB_GEOSERVER_WFS,
      coverage: "Sweden",
      rate_limit_notes: SCB_RATE_LIMIT_NOTE,
    },
    {
      id: "scb-grid-statistics",
      title: "Grid Statistics",
      source_family: "open_geodata",
      surface: "Grid statistics",
      canonical_url: "https://www.scb.se/en/services/open-data-api/open-geodata/grid-statistics/",
      query_style: "wfs-download",
      formats: ["html", "wfs", "wms", "geopackage"],
      best_for: ["grid-population", "spatial-statistics", "map-analysis"],
      priority: "medium",
      notes: "Official source for gridded population and related spatial statistics.",
      capabilities_url: SCB_GEOSERVER_WFS,
      coverage: "Sweden",
      rate_limit_notes: SCB_RATE_LIMIT_NOTE,
    },
    {
      id: "scb-localities",
      title: "Localities",
      source_family: "open_geodata",
      surface: "Localities",
      canonical_url: "https://www.scb.se/en/services/open-data-api/open-geodata/localities/",
      query_style: "wfs-download",
      formats: ["html", "wfs", "wms", "geopackage"],
      best_for: ["localities", "built-up-areas", "boundary-discovery"],
      priority: "medium",
      notes: "Official source for locality polygons and related metadata.",
      capabilities_url: SCB_GEOSERVER_WFS,
      coverage: "Sweden",
      rate_limit_notes: SCB_RATE_LIMIT_NOTE,
    },
    {
      id: "scb-myndighetsregistret",
      title: "Myndighetsregistret",
      source_family: "myndighetsregistret",
      surface: "Government agencies register",
      canonical_url: "https://www.scb.se/vara-tjanster/oppna-data/myndighetsregistret/",
      query_style: "metadata-only",
      formats: ["html"],
      best_for: ["agency-register", "authority-discovery"],
      priority: "medium",
      notes: "Official SCB government agencies register surface.",
      language: "sv",
      rate_limit_notes: SCB_RATE_LIMIT_NOTE,
    },
    {
      id: "scb-branschnyckeltal",
      title: "Branschnyckeltal",
      source_family: "branschnyckeltal",
      surface: "Industry ratios",
      canonical_url: "https://www.scb.se/vara-tjanster/oppna-data/branschnyckeltal/",
      query_style: "metadata-only",
      formats: ["html"],
      best_for: ["industry-ratios", "company-benchmarks"],
      priority: "medium",
      notes: "Official SCB industry ratio surface for company and sector comparisons.",
      language: "sv",
      rate_limit_notes: SCB_RATE_LIMIT_NOTE,
    },
    {
      id: "scb-vardefulla-datamangder",
      title: "Vardefulla datamangder",
      source_family: "vardefulla_datamangder",
      surface: "High-value datasets",
      canonical_url: "https://www.scb.se/vara-tjanster/oppna-data/vardefulla-datamangder-hvd/",
      query_style: "metadata-only",
      formats: ["html"],
      best_for: ["high-value-datasets", "eu-hvd-discovery"],
      priority: "medium",
      notes: "Official SCB high-value dataset landing page for EU-classified open-data sets.",
      language: "sv",
      rate_limit_notes: SCB_RATE_LIMIT_NOTE,
    },
  ];
}

export function defaultCatalogPath(): string {
  return DEFAULT_CATALOG_PATH;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeWhitespace(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
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

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "try-sweden-ai-scb-mcp/0.1.0",
        accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "user-agent": "try-sweden-ai-scb-mcp/0.1.0",
        accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractAnchors(html: string, baseUrl: string): Anchor[] {
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  return anchors
    .map((match) => {
      try {
        const href = new URL(match[1], baseUrl).toString();
        const label = normalizeWhitespace(match[2]);
        return { href, label };
      } catch {
        return null;
      }
    })
    .filter((anchor): anchor is Anchor => Boolean(anchor && anchor.href && anchor.label));
}

function extractUrls(html: string): string[] {
  return unique(
    [...html.matchAll(/https?:\/\/[^\s"'<>)]*/gi)]
      .map((match) => decodeHtmlEntities(match[0].replace(/[),.;]+$/g, "")))
      .filter(Boolean),
  );
}

function inferBestFor(title: string): string[] {
  const lower = title.toLowerCase();

  if (lower.includes("deso")) {
    return ["deso-boundaries", "polygon-lookup", "spatial-joins"];
  }

  if (lower.includes("regso")) {
    return ["regso-boundaries", "regional-polygons", "spatial-joins"];
  }

  if (lower.includes("grid")) {
    return ["grid-statistics", "spatial-analysis"];
  }

  if (lower.includes("localities")) {
    return ["localities", "built-up-areas", "boundary-discovery"];
  }

  return ["spatial-dataset-discovery"];
}

function inferPriority(title: string): "high" | "medium" | "low" {
  const lower = title.toLowerCase();
  if (lower.includes("deso") || lower.includes("regso") || lower.includes("grid")) {
    return "high";
  }
  return "medium";
}

function mergeEntry(target: CatalogEntry, update: Partial<CatalogEntry>): CatalogEntry {
  return {
    ...target,
    ...update,
    formats: update.formats ? unique([...target.formats, ...update.formats]) : target.formats,
    best_for: update.best_for ? unique([...target.best_for, ...update.best_for]) : target.best_for,
    download_urls: unique([...(target.download_urls ?? []), ...(update.download_urls ?? [])]),
  };
}

function summarizePageMetadata(urls: string[]): Partial<CatalogEntry> {
  const downloadUrls = urls.filter((url) => /GetFeature/i.test(url) || /outputFormat=geopackage/i.test(url));
  const capabilitiesUrl = urls.find((url) => /GetCapabilities/i.test(url));
  const formats = unique([
    capabilitiesUrl?.includes("/wfs") ? "wfs" : "",
    capabilitiesUrl?.includes("/wms") ? "wms" : "",
    downloadUrls.some((url) => /geopackage/i.test(url)) ? "geopackage" : "",
  ]).filter(Boolean);

  return {
    capabilities_url: capabilitiesUrl,
    download_urls: downloadUrls,
    formats,
  };
}

async function enrichEntry(entry: CatalogEntry): Promise<CatalogEntry> {
  if (entry.source_family === "pxweb") {
    return entry;
  }

  try {
    const html = await fetchText(entry.canonical_url);
    const urls = extractUrls(html);
    const metadata = summarizePageMetadata(urls);
    const versionHint = urls
      .flatMap((url) => [...url.matchAll(/(?:_|-)(20\d{2})(?:\b|[_-])/g)].map((match) => match[1]))
      .at(0);

    return mergeEntry(entry, {
      ...metadata,
      version_hint: entry.version_hint ?? versionHint,
    });
  } catch (error) {
    return mergeEntry(entry, {
      metadata: {
        ...(entry.metadata ?? {}),
        enrichment_error: error instanceof Error ? error.message : "unknown_error",
      },
    });
  }
}

async function discoverOpenGeodataEntries(existingEntries: CatalogEntry[]): Promise<CatalogEntry[]> {
  try {
    const html = await fetchText(SCB_OPEN_GEODATA_ROOT);
    const anchors = extractAnchors(html, SCB_OPEN_GEODATA_ROOT).filter((anchor) =>
      anchor.href.includes("/open-geodata/"),
    );

    const seen = new Set(existingEntries.map((entry) => entry.canonical_url));
    const additions: CatalogEntry[] = [];

    for (const anchor of anchors) {
      if (
        seen.has(anchor.href) ||
        !anchor.label ||
        anchor.label.toLowerCase() === "in english" ||
        anchor.href === SCB_OPEN_GEODATA_ROOT
      ) {
        continue;
      }

      additions.push({
        id: `scb-open-geodata-${slugify(anchor.label)}`,
        title: anchor.label,
        source_family: "open_geodata",
        surface: anchor.label,
        canonical_url: anchor.href,
        query_style: "wfs-download",
        formats: ["html"],
        best_for: inferBestFor(anchor.label),
        priority: inferPriority(anchor.label),
        notes: `Discovered from the official SCB open-geodata page: ${anchor.label}.`,
        capabilities_url: SCB_GEOSERVER_WFS,
        coverage: "Sweden",
        rate_limit_notes: SCB_RATE_LIMIT_NOTE,
      });
      seen.add(anchor.href);
    }

    return additions;
  } catch {
    return [];
  }
}

export async function buildCatalog(): Promise<CatalogFile> {
  const entries = baseEntries();
  const discovered = await discoverOpenGeodataEntries(entries);
  const pxwebDiscovered = await discoverPxwebCatalogEntries();
  const combined = [...entries, ...discovered, ...pxwebDiscovered];
  const enriched = await Promise.all(combined.map((entry) => enrichEntry(entry)));
  const sorted = enriched.sort((left, right) => left.title.localeCompare(right.title, "en"));

  return {
    generated_at: new Date().toISOString(),
    source_urls: unique([
      SCB_OPEN_DATA_ROOT,
      SCB_PXWEB_PAGE,
      SCB_STATISTICAL_DATABASE,
      SCB_OPEN_GEODATA_ROOT,
      ...sorted.map((entry) => entry.canonical_url),
    ]),
    entries: sorted,
  };
}

export async function writeCatalog(catalog: CatalogFile, filePath = defaultCatalogPath()): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

export async function readCatalog(filePath = defaultCatalogPath()): Promise<CatalogFile> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as CatalogFile;
}

export async function ensureCatalog(filePath = defaultCatalogPath()): Promise<CatalogFile> {
  try {
    return await readCatalog(filePath);
  } catch {
    const catalog = await buildCatalog();
    await writeCatalog(catalog, filePath);
    return catalog;
  }
}

export function searchCatalog(
  catalog: CatalogFile,
  query: string,
  options?: { sourceFamily?: SourceFamily; bestFor?: string },
): CatalogEntry[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  return catalog.entries
    .filter((entry) => (options?.sourceFamily ? entry.source_family === options.sourceFamily : true))
    .filter((entry) =>
      options?.bestFor
        ? entry.best_for.some((tag) => tag.toLowerCase().includes(options.bestFor!.toLowerCase()))
        : true,
    )
    .map((entry) => {
      const haystack = [
        entry.title,
        entry.surface,
        entry.notes,
        entry.source_family,
        entry.best_for.join(" "),
        entry.formats.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      let score = terms.length === 0 ? 1 : terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);

      const request = query.toLowerCase();
      const wantsStats = /(population|income|education|statistics|table|tabular|employment|json)/.test(request);
      const wantsGeodata = /(deso|regso|polygon|boundary|geometry|spatial|wfs|wms|map|localities|grid)/.test(request);
      const wantsListLike = /(list|catalog|browse|metadata|codes|code)/.test(request);
      const wantsAreaCodes = /(deso|regso)/.test(request) && wantsListLike;

      if (wantsStats && entry.source_family === "pxweb") {
        score += 4;
      }

      if (wantsGeodata && entry.source_family === "open_geodata") {
        score += 4;
      }

      if (wantsAreaCodes && entry.source_family === "pxweb") {
        score += 5;
      }

      if (wantsAreaCodes && entry.best_for.some((tag) => tag.includes("deso-list") || tag.includes("regso-list"))) {
        score += 4;
      }

      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title, "en"))
    .map(({ entry }) => entry);
}
