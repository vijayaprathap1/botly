// LOCAL TEST HARNESS ONLY. A tiny stand-in for the Supabase API gateway so the
// real app can run end-to-end against a plain local Postgres + PostgREST:
//   /rest/v1/*  → PostgREST
//   /auth/v1/*  → just enough of GoTrue for magic-link (PKCE) sign-in; the
//                 "email" is written to MAGIC_LINK_LOG instead of being sent.
// For real local development use the Supabase CLI (`supabase start`).
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const REST = process.env.POSTGREST_URL ?? "http://127.0.0.1:54330";
const SECRET = process.env.JWT_SECRET;
const LOG = process.env.MAGIC_LINK_LOG ?? "/tmp/botly-magic-links.log";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const codes = new Map(); // auth code → { userId, challenge }
const refresh = new Map(); // refresh token → userId

const b64u = (b) => Buffer.from(b).toString("base64url");
export function signJwt(payload) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, b, s] = String(token).split(".");
  if (!s) return null;
  const expect = crypto.createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url");
  if (expect !== s) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  return p.exp && p.exp < Date.now() / 1000 ? null : p;
}
async function userById(id) {
  const { rows } = await pool.query("select id, email, created_at from auth.users where id = $1", [id]);
  return rows[0] ? { id: rows[0].id, aud: "authenticated", role: "authenticated", email: rows[0].email, app_metadata: { provider: "email" }, user_metadata: {}, created_at: rows[0].created_at } : null;
}
async function session(userId) {
  const user = await userById(userId);
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({ sub: userId, role: "authenticated", aud: "authenticated", email: user.email, iat: now, exp: now + 3600, session_id: crypto.randomUUID() });
  const refresh_token = crypto.randomBytes(24).toString("hex");
  refresh.set(refresh_token, userId);
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user };
}
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
const send = (res, status, obj) => { res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" });
      return res.end();
    }
    if (url.pathname.startsWith("/rest/v1")) {
      const headers = { ...req.headers };
      delete headers.host;
      if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
      const r = await fetch(REST + url.pathname.replace("/rest/v1", "") + url.search, { method: req.method, headers, body });
      const out = Buffer.from(await r.arrayBuffer());
      const h = Object.fromEntries([...r.headers].filter(([k]) => !["content-encoding", "transfer-encoding", "content-length"].includes(k)));
      res.writeHead(r.status, h);
      return res.end(out);
    }
    if (url.pathname === "/auth/v1/otp" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const email = String(body.email || "").toLowerCase();
      const { rows } = await pool.query("insert into auth.users (email) values ($1) on conflict (email) do update set email = excluded.email returning id", [email]);
      const code = crypto.randomUUID();
      codes.set(code, { userId: rows[0].id, challenge: body.code_challenge });
      const redirect = url.searchParams.get("redirect_to") ?? "http://localhost:3000/auth/callback";
      const link = `${redirect}${redirect.includes("?") ? "&" : "?"}code=${code}`;
      fs.appendFileSync(LOG, `${email} ${link}\n`);
      console.log(`[auth] magic link for ${email}: ${link}`);
      return send(res, 200, {});
    }
    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const grant = url.searchParams.get("grant_type");
      if (grant === "pkce") {
        const c = codes.get(body.auth_code);
        const ok = c && (!c.challenge || crypto.createHash("sha256").update(body.code_verifier).digest("base64url") === c.challenge);
        if (!ok) return send(res, 400, { error: "invalid_grant", error_description: "bad code" });
        codes.delete(body.auth_code);
        return send(res, 200, await session(c.userId));
      }
      if (grant === "refresh_token") {
        const uid = refresh.get(body.refresh_token);
        if (!uid) return send(res, 400, { error: "invalid_grant" });
        return send(res, 200, await session(uid));
      }
      return send(res, 400, { error: "unsupported_grant_type" });
    }
    if (url.pathname === "/auth/v1/user") {
      const p = verifyJwt((req.headers.authorization || "").replace(/^Bearer /, ""));
      if (!p?.sub) return send(res, 401, { code: 401, msg: "invalid JWT" });
      const u = await userById(p.sub);
      return u ? send(res, 200, u) : send(res, 404, { msg: "not found" });
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204);
    send(res, 404, { error: "not found in local gateway", path: url.pathname });
  } catch (e) {
    console.error("[gateway]", e);
    send(res, 500, { error: String(e) });
  }
}).listen(PORT, () => console.log(`[gateway] http://localhost:${PORT}`));
