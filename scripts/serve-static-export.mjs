import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const port = Number(process.env.PORT || 3000);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function resolveRequest(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const relative = decoded.replace(/^\/+/, "");
  const base = path.resolve(root, relative);
  if (!base.startsWith(root)) return null;

  const candidates = [];
  if (decoded.endsWith("/")) candidates.push(path.join(base, "index.html"));
  else {
    candidates.push(base);
    candidates.push(path.join(base, "index.html"));
    candidates.push(`${base}.html`);
  }
  if (decoded === "/") candidates.unshift(path.join(root, "index.html"));
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

if (!fs.existsSync(root)) {
  console.error(`Static export not found at ${root}. Run npm run build first.`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const file = resolveRequest(req.url || "/");
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "content-type": types[ext] || "application/octet-stream",
    "cache-control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving static export from ${root} at http://127.0.0.1:${port}`);
});
