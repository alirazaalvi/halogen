import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard for DR-01 / DR-62: synthetic data must not return to the ingestion or API code.
 * Migrations are excluded because they document the historical clean-up.
 */
const BANNED: Array<[RegExp, string]> = [
  [
    /\bareaFactor\b|\bareaInt\b|\bareaTrend\b|\bareaAnchor\b|\bhashString\b/,
    "id-hash value generator",
  ],
  [/generated:\s*true/, "generated-data marker"],
  [/fallback:\s*true/, "fallback-data marker"],
  [/Local School|Transit Hub|Main Street 10/, "invented placeholder record"],
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "migrations" || name === "node_modules") return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe("no synthetic data", () => {
  for (const file of sourceFiles(join(import.meta.dir))) {
    test(file.replace(import.meta.dir, "src"), () => {
      const text = readFileSync(file, "utf8");
      for (const [pattern, label] of BANNED) {
        expect(pattern.test(text), `${label} found in ${file}`).toBe(false);
      }
    });
  }
});
