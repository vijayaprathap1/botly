"use client";
import { useActionState } from "react";
import { importProducts, uploadDocument, type ActionState } from "@/app/app/actions";
import { SubmitButton } from "@/components/client";
import { btn, Card, Notice } from "@/components/ui";

export function ImportForms({ botId }: { botId: string }) {
  const [csv, csvAction] = useActionState<ActionState, FormData>(importProducts.bind(null, botId), null);
  const [doc, docAction] = useActionState<ActionState, FormData>(uploadDocument.bind(null, botId), null);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Import products (CSV)">
        <form action={csvAction} className="grid gap-2 text-sm">
          <p className="text-slate-600">Columns: name, price, sizes, stock note, URL. Existing products with the same name are updated (use this for price and stock changes).</p>
          <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" aria-label="Product CSV file" />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="approve" defaultChecked /> Approve on import
          </label>
          <div>
            <SubmitButton className={btn.secondary} pendingText="Importing…">Import CSV</SubmitButton>
          </div>
          {csv?.error ? <Notice tone="red">{csv.error}</Notice> : csv?.message ? <Notice tone="green">{csv.message}</Notice> : null}
        </form>
      </Card>
      <Card title="Upload a document">
        <form action={docAction} className="grid gap-2 text-sm">
          <p className="text-slate-600">PDF, DOCX, TXT or MD up to 4.5 MB (policies, catalogues, price lists). The text is saved as a draft.</p>
          <input type="file" name="file" accept=".pdf,.docx,.txt,.md" required className="text-sm" aria-label="Document file" />
          <div>
            <SubmitButton className={btn.secondary} pendingText="Reading…">Upload</SubmitButton>
          </div>
          {doc?.error ? <Notice tone="red">{doc.error}</Notice> : doc?.message ? <Notice tone="green">{doc.message}</Notice> : null}
        </form>
      </Card>
    </div>
  );
}
