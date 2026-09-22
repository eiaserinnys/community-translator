import { mkdir, readFile, writeFile } from "node:fs/promises";

import openapiTS, { astToString } from "openapi-typescript";

const schemaUrl = new URL("../openapi.yaml", import.meta.url);
const outputUrl = new URL("../src/generated.ts", import.meta.url);
const checkOnly = process.argv.includes("--check");
const ast = await openapiTS(schemaUrl);
const generated = `// Generated from openapi.yaml. Do not edit.\n${astToString(ast)}`;

if (checkOnly) {
  let committed;
  try {
    committed = await readFile(outputUrl, "utf8");
  } catch {
    throw new Error("Generated TypeScript contract is missing. Run pnpm contracts:generate.");
  }

  if (committed !== generated) {
    throw new Error("Generated TypeScript contract is stale. Run pnpm contracts:generate.");
  }
} else {
  await mkdir(new URL("../src/", import.meta.url), { recursive: true });
  await writeFile(outputUrl, generated, "utf8");
}
