// LOCAL TEST ONLY: records emails the app would send through Resend.
import http from "node:http";
import fs from "node:fs";
const out = process.env.FAKE_RESEND_LOG ?? "/tmp/botly-fake-resend.jsonl";
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    fs.appendFileSync(out, JSON.stringify({ at: new Date().toISOString(), auth: Boolean(req.headers.authorization), body: JSON.parse(body || "{}") }) + "\n");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "fake_" + Date.now() }));
  });
}).listen(Number(process.env.FAKE_RESEND_PORT ?? 54340), () => console.log("fake resend up"));
