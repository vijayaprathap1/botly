/** Minimal robots.txt: groups for "*" or our bot name, Allow/Disallow with longest match, Sitemap lines. */
export type Robots = { isAllowed(path: string): boolean; sitemaps: string[] };

export function parseRobots(text: string, agent = "botlybot"): Robots {
  type Rule = { allow: boolean; path: string };
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const field = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" || field === "disallow") {
      if (value) current.rules.push({ allow: field === "allow", path: value });
      else if (field === "disallow") current.rules.push({ allow: true, path: "/" }); // "Disallow:" = allow all
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);

  const toRegex = (p: string) => {
    const anchored = p.endsWith("$");
    const body = (anchored ? p.slice(0, -1) : p).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^" + body + (anchored ? "$" : ""));
  };
  const compiled = rules.map((r) => ({ ...r, re: toRegex(r.path), len: r.path.length }));
  return {
    sitemaps,
    isAllowed(path: string) {
      let best: { allow: boolean; len: number } | null = null;
      for (const r of compiled) {
        if (r.re.test(path) && (!best || r.len > best.len || (r.len === best.len && r.allow))) best = r;
      }
      return best ? best.allow : true;
    },
  };
}
