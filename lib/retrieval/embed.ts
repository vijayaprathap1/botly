/**
 * Embedding provider interface. Voyage (voyage-3.5-lite, multilingual, 1024 dims)
 * when VOYAGE_API_KEY is set; otherwise retrieval uses keyword search only.
 * Docs: https://docs.voyageai.com/reference/embeddings-api
 */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dims: number;
  embed(texts: string[], inputType: "document" | "query"): Promise<number[][]>;
}

export class VoyageEmbeddings implements EmbeddingProvider {
  readonly dims = 1024;
  constructor(readonly model = process.env.VOYAGE_MODEL || "voyage-3.5-lite") {}
  async embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 64) {
      const res = await fetch(`${process.env.VOYAGE_API_URL || "https://api.voyageai.com/v1"}/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: texts.slice(i, i + 64), model: this.model, input_type: inputType, output_dimension: this.dims }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      out.push(...body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }
    return out;
  }
}

export function getEmbedder(): EmbeddingProvider | null {
  return process.env.VOYAGE_API_KEY ? new VoyageEmbeddings() : null;
}

/** pgvector literal. */
export const toVector = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}]`;
