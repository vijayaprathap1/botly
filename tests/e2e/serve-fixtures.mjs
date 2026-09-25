// Serves tests/e2e/fixtures on the given port, replacing {{APP}} with the app URL.
//   /hostile.html, /sticky.html, /plain.html  → widget embed pages
//   /site/…                                     → a tiny store site for the onboarding crawler
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2] ?? 4173);
const app = process.argv[3] ?? "http://localhost:3000";
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
const TYPES = { ".html": "text/html; charset=utf-8", ".txt": "text/plain", ".xml": "application/xml" };
http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/hostile.html";
    if (p.includes("..")) return void res.writeHead(400).end();
    let file = path.join(root, p);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
    if (!fs.existsSync(file)) return void res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(fs.readFileSync(file, "utf8").replaceAll("{{APP}}", app));
  })
  .listen(port, () => console.log(`fixtures on http://localhost:${port}`));
