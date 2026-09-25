// Bundles widget/src → public/widget.js and enforces the 35 KB gzip budget.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const BUDGET = 35 * 1024;
await build({
  entryPoints: ["widget/src/index.ts"],
  outfile: "public/widget.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  legalComments: "none",
  sourcemap: false,
  logLevel: "warning",
});
const js = readFileSync("public/widget.js");
const gz = gzipSync(js, { level: 9 }).length;
const line = `widget.js: ${(js.length / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzipped (budget ${BUDGET / 1024} KB)`;
console.log(line);
if (process.argv.includes("--report")) writeFileSync("public/widget-size.txt", line + "\n");
if (gz > BUDGET) {
  console.error("Widget is over the size budget.");
  process.exit(1);
}
