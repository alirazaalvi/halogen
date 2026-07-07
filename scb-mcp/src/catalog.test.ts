import test from "node:test";
import assert from "node:assert/strict";
import type { CatalogFile } from "./catalog.js";
import { searchCatalog } from "./catalog.js";
import { recommendApi } from "./ranking.js";

const fixtureCatalog: CatalogFile = {
  generated_at: "2026-06-28T00:00:00.000Z",
  source_urls: [],
  entries: [
    {
      id: "scb-pxweb-api",
      title: "SCB PxWeb API",
      source_family: "pxweb",
      surface: "Statistical database",
      canonical_url: "https://example.com/pxweb",
      query_style: "pxweb-query",
      formats: ["json"],
      best_for: ["official-statistics", "tabular-statistics"],
      priority: "high",
      notes: "Preferred source for tabular statistics.",
    },
    {
      id: "scb-open-geodata-deso",
      title: "DeSO",
      source_family: "open_geodata",
      surface: "DeSO",
      canonical_url: "https://example.com/deso",
      query_style: "wfs-download",
      formats: ["wfs", "geopackage"],
      best_for: ["deso-boundaries", "polygon-lookup"],
      priority: "high",
      notes: "Preferred source for DeSO geometry.",
    },
    {
      id: "scb-pxweb-deso-list",
      title: "Population per region by region, age, sex, observations and year",
      source_family: "pxweb",
      surface: "FolkmDesoAldKon",
      canonical_url: "https://example.com/pxweb/deso",
      query_style: "pxweb-query",
      formats: ["json"],
      best_for: ["deso-list", "deso-statistics", "table-metadata"],
      priority: "high",
      notes: "Preferred source for DeSO lists and lower-level population metadata.",
      metadata: {
        pxweb_path: "BE/BE0101/BE0101Y/FolkmDesoAldKon",
        node_kind: "table",
      },
    },
  ],
};

test("searchCatalog finds geodata entries by keyword", () => {
  const matches = searchCatalog(fixtureCatalog, "deso polygon");
  assert.equal(matches[0]?.id, "scb-open-geodata-deso");
});

test("recommendApi prefers PxWeb for table statistics requests", () => {
  const recommendation = recommendApi(fixtureCatalog, "population table statistics");
  assert.equal(recommendation.entry.source_family, "pxweb");
});

test("recommendApi prefers open geodata for DeSO boundary requests", () => {
  const recommendation = recommendApi(fixtureCatalog, "DeSO boundary polygons");
  assert.equal(recommendation.entry.id, "scb-open-geodata-deso");
});

test("searchCatalog prefers PxWeb entries for DeSO list requests", () => {
  const matches = searchCatalog(fixtureCatalog, "deso list codes");
  assert.equal(matches[0]?.id, "scb-pxweb-deso-list");
});

test("recommendApi prefers PxWeb for DeSO list requests", () => {
  const recommendation = recommendApi(fixtureCatalog, "DeSO list codes for Stockholm county");
  assert.equal(recommendation.entry.id, "scb-pxweb-deso-list");
});
