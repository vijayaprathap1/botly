/** Small RFC-4180 CSV parser/writer (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    // Stop spreadsheet formula injection; plain phone numbers like +919876543210 are safe as-is.
    if (/^[=+\-@\t\r]/.test(s) && !/^\+?\d[\d\s]*$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export type ProductRow = { name: string; price: string; sizes: string; stock: string; url: string };

/** Maps a product CSV with flexible headers: name/title, price, sizes/size, stock/stock note, url/link. */
export function parseProductCsv(text: string): { rows: ProductRow[]; errors: string[] } {
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], errors: ["The file needs a header row and at least one product."] };
  const header = all[0]!.map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const ix = { name: col("name", "title", "product", "productname"), price: col("price", "mrp", "amount"), sizes: col("sizes", "size", "variants"), stock: col("stock", "stocknote", "availability", "instock"), url: col("url", "link", "producturl") };
  if (ix.name < 0) return { rows: [], errors: ['Missing a "name" column.'] };
  const errors: string[] = [];
  const rows: ProductRow[] = [];
  all.slice(1).forEach((r, i) => {
    const get = (k: keyof typeof ix) => (ix[k] >= 0 ? (r[ix[k]] ?? "").trim() : "");
    const name = get("name");
    if (!name) return errors.push(`Row ${i + 2}: no name, skipped.`);
    const url = get("url");
    if (url && !/^https?:\/\//i.test(url)) errors.push(`Row ${i + 2}: URL ignored (must start with http).`);
    rows.push({ name, price: get("price"), sizes: get("sizes"), stock: get("stock"), url: /^https?:\/\//i.test(url) ? url : "" });
  });
  return { rows, errors };
}

export function productContent(p: ProductRow): string {
  const price = p.price && /^\d[\d,.]*$/.test(p.price) ? `₹${p.price}` : p.price;
  return [price && `Price: ${price}`, p.sizes && `Sizes: ${p.sizes}`, p.stock && `Stock: ${p.stock}`].filter(Boolean).join("\n");
}
