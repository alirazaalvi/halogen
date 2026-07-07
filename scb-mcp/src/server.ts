import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  SCB_PXWEB_API_ROOT,
  ensureCatalog,
  fetchJson,
  searchCatalog,
  type CatalogEntry,
  type SourceFamily,
} from "./catalog.js";
import {
  ensurePxwebUrl,
  fetchDesoList,
  fetchPxwebNodes,
  pxwebPathFromUrl,
  summarizePxwebTableMetadata,
} from "./pxweb.js";
import { recommendApi } from "./ranking.js";

function formatText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function makeToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: formatText(value),
      },
    ],
  };
}

function summarizePxwebMetadata(payload: unknown) {
  if (Array.isArray(payload)) {
    return {
      kind: "node-list",
      item_count: payload.length,
      items: payload.slice(0, 20),
    };
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    if (Array.isArray(record.variables)) {
      return {
        kind: "table-metadata",
        ...summarizePxwebTableMetadata({
          title: typeof record.title === "string" ? record.title : undefined,
          updated: typeof record.updated === "string" ? record.updated : undefined,
          variables: record.variables as never,
        }),
      };
    }
  }

  return {
    kind: "raw-json",
    payload,
  };
}

function validatePxwebPayload(query: unknown): void {
  const serialized = JSON.stringify(query);
  if (serialized.length > 25_000) {
    throw new Error("PxWeb query payload is too large for the bounded MCP tool.");
  }
}

function searchResultSummary(entries: CatalogEntry[]) {
  return entries.slice(0, 10).map((entry) => ({
    id: entry.id,
    title: entry.title,
    source_family: entry.source_family,
    canonical_url: entry.canonical_url,
    best_for: entry.best_for,
    formats: entry.formats,
    notes: entry.notes,
  }));
}

async function main(): Promise<void> {
  const catalog = await ensureCatalog();

  const server = new McpServer({
    name: "scb-mcp",
    version: "0.1.0",
  });

  server.tool(
    "scb_list_pxweb_nodes",
    {
      path: z.string().default(""),
    },
    async ({ path }) => {
      const nodes = await fetchPxwebNodes(path);
      return makeToolResult({
        path: pxwebPathFromUrl(path),
        url: ensurePxwebUrl(path),
        item_count: nodes.length,
        items: nodes,
      });
    },
  );

  server.tool(
    "scb_search_catalog",
    {
      query: z.string().min(1),
      sourceFamily: z
        .enum([
          "open_data_root",
          "pxweb",
          "open_geodata",
          "myndighetsregistret",
          "branschnyckeltal",
          "vardefulla_datamangder",
        ] satisfies [SourceFamily, ...SourceFamily[]])
        .optional(),
      bestFor: z.string().min(1).optional(),
    },
    async ({ query, sourceFamily, bestFor }) => {
      const matches = searchCatalog(catalog, query, {
        sourceFamily,
        bestFor,
      });

      return makeToolResult({
        query,
        total_matches: matches.length,
        results: searchResultSummary(matches),
      });
    },
  );

  server.tool(
    "scb_recommend_api",
    {
      task: z.string().min(1),
      preferredOutput: z.enum(["table", "geometry", "download", "metadata"]).optional(),
    },
    async ({ task, preferredOutput }) => {
      const request = preferredOutput ? `${task} ${preferredOutput}` : task;
      const recommendation = recommendApi(catalog, request);

      return makeToolResult({
        task,
        preferred_output: preferredOutput ?? null,
        recommended: {
          id: recommendation.entry.id,
          title: recommendation.entry.title,
          source_family: recommendation.entry.source_family,
          canonical_url: recommendation.entry.canonical_url,
          confidence: recommendation.confidence,
          reasons: recommendation.reasons,
          best_for: recommendation.entry.best_for,
          metadata: recommendation.entry.metadata ?? null,
        },
        alternatives: recommendation.alternatives.map((entry) => ({
          id: entry.id,
          title: entry.title,
          source_family: entry.source_family,
          canonical_url: entry.canonical_url,
        })),
      });
    },
  );

  server.tool(
    "scb_get_pxweb_metadata",
    {
      url: z.string().min(1).default(SCB_PXWEB_API_ROOT),
    },
    async ({ url }) => {
      const metadata = await fetchJson(ensurePxwebUrl(url));
      return makeToolResult({
        url: ensurePxwebUrl(url),
        summary: summarizePxwebMetadata(metadata),
      });
    },
  );

  server.tool(
    "scb_query_pxweb",
    {
      tableUrl: z.string().min(1),
      query: z.array(z.record(z.string(), z.unknown())).min(1),
      responseFormat: z.string().default("json-stat2"),
    },
    async ({ tableUrl, query, responseFormat }) => {
      validatePxwebPayload(query);
      const url = ensurePxwebUrl(tableUrl);
      const body = {
        query,
        response: {
          format: responseFormat,
        },
      };

      const payload = await fetchJson(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      return makeToolResult({
        table_url: url,
        response_format: responseFormat,
        payload,
      });
    },
  );

  server.tool(
    "scb_get_deso_list",
    {
      countyCode: z.string().length(2).default("01"),
      municipalityCode: z.string().length(4).optional(),
      version: z.enum(["2025", "legacy", "both"]).default("2025"),
      limit: z.number().int().min(1).max(1000).default(200),
    },
    async ({ countyCode, municipalityCode, version, limit }) => {
      const result = await fetchDesoList({
        countyCode,
        municipalityCode,
        version,
        limit,
      });

      return makeToolResult({
        county_code: countyCode,
        municipality_code: municipalityCode ?? null,
        version,
        ...result,
      });
    },
  );

  server.tool(
    "scb_get_geodata_catalog",
    {
      query: z.string().min(1),
      layerFamily: z.enum(["deso", "regso", "grid", "localities"]).optional(),
    },
    async ({ query, layerFamily }) => {
      const searchQuery = layerFamily ? `${query} ${layerFamily}` : query;
      const matches = searchCatalog(catalog, searchQuery, {
        sourceFamily: "open_geodata",
      });

      return makeToolResult({
        query,
        layer_family: layerFamily ?? null,
        results: searchResultSummary(matches).map((entry) => ({
          ...entry,
          capabilities_url:
            catalog.entries.find((catalogEntry) => catalogEntry.id === entry.id)?.capabilities_url ?? null,
          download_urls:
            catalog.entries.find((catalogEntry) => catalogEntry.id === entry.id)?.download_urls ?? [],
        })),
      });
    },
  );

  server.tool(
    "scb_get_dataset_downloads",
    {
      idOrUrl: z.string().min(1),
    },
    async ({ idOrUrl }) => {
      const entry =
        catalog.entries.find((item) => item.id === idOrUrl) ??
        catalog.entries.find((item) => item.canonical_url === idOrUrl);

      if (!entry) {
        throw new Error("Catalog entry not found.");
      }

      return makeToolResult({
        id: entry.id,
        title: entry.title,
        canonical_url: entry.canonical_url,
        capabilities_url: entry.capabilities_url ?? null,
        download_urls: entry.download_urls ?? [],
        formats: entry.formats,
        version_hint: entry.version_hint ?? null,
      });
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
