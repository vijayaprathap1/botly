/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anything else is refused. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
