/**
 * Markdown-lite for model output: paragraphs, line breaks, **bold**, bullet and
 * numbered lists, [links](https://…) and bare URLs. Everything else is text.
 *
 * Output is a small tree rendered with createElement/textContent — never innerHTML —
 * so model output can't inject markup. Links are limited to http(s), mailto and tel.
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "a"; href: string; c: Inline[] }
  | { t: "br" };
export type Block = { t: "p"; c: Inline[] } | { t: "ul"; items: Inline[][] } | { t: "ol"; items: Inline[][] };

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href) && !/[\s"'<>`]/.test(href)) return href;
  return null;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;

export function parseMarkdownLite(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      const c: Inline[] = [];
      para.forEach((l, i) => {
        if (i) c.push({ t: "br" });
        c.push(...parseInline(l));
      });
      blocks.push({ t: "p", c });
      para = [];
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.replace(/^#{1,6}\s+(.*)$/, "**$1**"); // headings → bold line
    const b = BULLET.exec(line);
    const n = b ? null : NUMBERED.exec(line);
    if (b || n) {
      flush();
      const kind = b ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      const item = parseInline((b ?? n)![1]!);
      if (last && last.t === kind) last.items.push(item);
      else blocks.push({ t: kind, items: [item] } as Block);
    } else if (line.trim() === "") {
      flush();
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let text = "";
  const pushText = () => {
    if (text) out.push(...autolink(text));
    text = "";
  };
  while (i < s.length) {
    if ((s.startsWith("**", i) || s.startsWith("__", i)) && s.length > i + 2) {
      const marker = s.slice(i, i + 2);
      const end = s.indexOf(marker, i + 2);
      if (end > i + 2) {
        pushText();
        out.push({ t: "b", c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (s[i] === "[") {
      const close = s.indexOf("](", i);
      const endParen = close >= 0 ? matchParen(s, close + 1) : -1;
      if (close > i && endParen > close) {
        const href = safeHref(s.slice(close + 2, endParen));
        const label = s.slice(i + 1, close);
        pushText();
        if (href) out.push({ t: "a", href, c: parseInline(label) });
        else out.push({ t: "text", v: label });
        i = endParen + 1;
        continue;
      }
    }
    if (s[i] === "`") {
      // inline code → plain text without the backticks
      const end = s.indexOf("`", i + 1);
      if (end > i) {
        text += s.slice(i + 1, end);
        i = end + 1;
        continue;
      }
    }
    text += s[i];
    i++;
  }
  pushText();
  return out;
}

/** Index of the ")" closing the "(" at `open`, allowing nested parentheses. */
function matchParen(s: string, open: number): number {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === "(") depth++;
    else if (s[j] === ")" && --depth === 0) return j;
  }
  return -1;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]]/g;

function autolink(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ t: "text", v: s.slice(last, idx) });
    const href = safeHref(m[0]);
    out.push(href ? { t: "a", href, c: [{ t: "text", v: m[0] }] } : { t: "text", v: m[0] });
    last = idx + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

/** Render to DOM nodes (textContent only). */
export function renderBlocks(blocks: Block[], doc: Document): DocumentFragment {
  const frag = doc.createDocumentFragment();
  const inl = (parent: Node, items: Inline[]) => {
    for (const it of items) {
      if (it.t === "text") parent.appendChild(doc.createTextNode(it.v));
      else if (it.t === "br") parent.appendChild(doc.createElement("br"));
      else if (it.t === "b") {
        const el = doc.createElement("strong");
        inl(el, it.c);
        parent.appendChild(el);
      } else {
        const a = doc.createElement("a");
        a.href = it.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer nofollow";
        inl(a, it.c);
        parent.appendChild(a);
      }
    }
  };
  for (const b of blocks) {
    if (b.t === "p") {
      const p = doc.createElement("p");
      inl(p, b.c);
      frag.appendChild(p);
    } else {
      const list = doc.createElement(b.t);
      for (const item of b.items) {
        const li = doc.createElement("li");
        inl(li, item);
        list.appendChild(li);
      }
      frag.appendChild(list);
    }
  }
  return frag;
}

/** Serialise the tree to escaped HTML (tests and server-side previews only). */
export function toSafeHtml(blocks: Block[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const inl = (items: Inline[]): string =>
    items
      .map((it) =>
        it.t === "text"
          ? esc(it.v)
          : it.t === "br"
            ? "<br>"
            : it.t === "b"
              ? `<strong>${inl(it.c)}</strong>`
              : `<a href="${esc(it.href)}" target="_blank" rel="noopener noreferrer nofollow">${inl(it.c)}</a>`,
      )
      .join("");
  return blocks
    .map((b) =>
      b.t === "p" ? `<p>${inl(b.c)}</p>` : `<${b.t}>${b.items.map((i) => `<li>${inl(i)}</li>`).join("")}</${b.t}>`,
    )
    .join("");
}
