// Prints anon + service-role JWTs for the local harness (same secret as PostgREST).
import crypto from "node:crypto";
const SECRET = process.env.JWT_SECRET;
const b64u = (b) => Buffer.from(b).toString("base64url");
const sign = (p) => {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const b = b64u(JSON.stringify(p));
  return `${h}.${b}.${crypto.createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url")}`;
};
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 86400;
console.log(`ANON=${sign({ role: "anon", iss: "supabase", exp })}`);
console.log(`SERVICE=${sign({ role: "service_role", iss: "supabase", exp })}`);
