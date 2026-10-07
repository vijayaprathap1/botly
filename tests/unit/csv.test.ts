import { describe, expect, it } from "vitest";
import { parseCsv, parseProductCsv, productContent, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("parses quotes, commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
  });
  it("writes safely (formula injection)", () => {
    expect(toCsv([["=HYPERLINK(1)", "a,b", 3, "+919790011223", "-2+3"]])).toBe(`'=HYPERLINK(1),"a,b",3,+919790011223,'-2+3\r\n`);
  });
  it("maps product CSV headers", () => {
    const { rows, errors } = parseProductCsv("Product Name,Price,Size,Stock note,Link\nKanchi Silk,\"12,500\",32-44,In stock,https://a.in/p\n,1,,,\nCotton,1850,,,notaurl");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Kanchi Silk", price: "12,500", sizes: "32-44", stock: "In stock", url: "https://a.in/p" });
    expect(productContent(rows[0]!)).toBe("Price: ₹12,500\nSizes: 32-44\nStock: In stock");
    expect(errors).toHaveLength(2);
  });
  it("price lists: category, pack, MRP vs the price the customer pays", () => {
    const { rows, errors } = parseProductCsv("S.No,Category,Product Name,Content,MRP (Rs),Offer Price\n1,Sparklers,10 cm Electric Sparklers,1 Box,150,30\n2,Flower Pots,Flower Pots Big,1 Box (10 pcs),600,120");
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({ name: "10 cm Electric Sparklers", price: "30", sizes: "", stock: "", url: "", category: "Sparklers", unit: "1 Box", mrp: "150" });
    expect(productContent(rows[1]!)).toBe("Category: Flower Pots\nPrice: ₹120 per 1 Box (10 pcs)\nMRP (before discount): ₹600");
  });
  it("an MRP-only list uses MRP as the price", () => {
    const { rows } = parseProductCsv("Item,MRP\nRed Bijili,45");
    expect(rows[0]).toEqual({ name: "Red Bijili", price: "45", sizes: "", stock: "", url: "" });
    expect(productContent(rows[0]!)).toBe("Price: ₹45");
  });
});
