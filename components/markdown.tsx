import { Fragment } from "react";
import { parseMarkdownLite, type Inline } from "@/widget/src/markdown";

/** Same markdown-lite as the widget, rendered as React elements (no dangerouslySetInnerHTML). */
export function MarkdownLite({ text }: { text: string }) {
  const inl = (items: Inline[]): React.ReactNode =>
    items.map((it, i) =>
      it.t === "text" ? (
        <Fragment key={i}>{it.v}</Fragment>
      ) : it.t === "br" ? (
        <br key={i} />
      ) : it.t === "b" ? (
        <strong key={i}>{inl(it.c)}</strong>
      ) : (
        <a key={i} href={it.href} target="_blank" rel="noopener noreferrer nofollow">
          {inl(it.c)}
        </a>
      ),
    );
  return (
    <div className="prose-chat">
      {parseMarkdownLite(text).map((b, i) =>
        b.t === "p" ? (
          <p key={i}>{inl(b.c)}</p>
        ) : b.t === "ul" ? (
          <ul key={i}>{b.items.map((it, j) => <li key={j}>{inl(it)}</li>)}</ul>
        ) : (
          <ol key={i}>{b.items.map((it, j) => <li key={j}>{inl(it)}</li>)}</ol>
        ),
      )}
    </div>
  );
}
