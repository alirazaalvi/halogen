import { buildCatalog, defaultCatalogPath, writeCatalog } from "./catalog.js";

async function main(): Promise<void> {
  const catalog = await buildCatalog();
  const outputPath = defaultCatalogPath();
  await writeCatalog(catalog, outputPath);
  process.stderr.write(`Catalog refreshed at ${outputPath}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
