import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "lib", "data", "types"];
const SW_PATH = path.join(ROOT, "public", "sw.js");
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".json"]);

function filesUnder(directory: string): string[] {
  const absolute = path.join(ROOT, directory);
  if (!fs.existsSync(absolute)) return [];
  const output: string[] = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(relative));
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) output.push(relative);
  }
  return output;
}

const files = SOURCE_DIRS.flatMap(filesUnder).sort();
const hash = crypto.createHash("sha256");
for (const file of files) {
  hash.update(file);
  hash.update("\0");
  hash.update(fs.readFileSync(path.join(ROOT, file)));
  hash.update("\0");
}

const version = `amd-${hash.digest("hex").slice(0, 12)}`;
const source = fs.readFileSync(SW_PATH, "utf8");
const next = source.replace(/^const VERSION = "[^"]+";/m, `const VERSION = "${version}";`);
if (source === next && !source.includes(`const VERSION = "${version}";`)) {
  throw new Error("Could not stamp service-worker VERSION");
}
fs.writeFileSync(SW_PATH, next);
process.stdout.write(`Stamped service worker cache version: ${version}\n`);
