import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export function HighlightedCode({ code, highlight }: { code: string; highlight?: readonly string[] }) {
  // Con `highlight`, cada línea va en su bloque y las que contienen alguno de esos textos se resaltan.
  if (highlight?.length) {
    return <code>{code.split("\n").map((line, index) => (
      <span key={index} className={cn("nr-code-line", highlight.some((text) => line.includes(text)) && "nr-code-line-highlight")}>
        {line ? <Tokens code={line} /> : " "}
      </span>
    ))}</code>;
  }
  return <code><Tokens code={code} /></code>;
}

function Tokens({ code }: { code: string }) {
  const tokens = code.split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:from|import|const|let|await|new|return|true|false|null|True|False|None|print)\b|\b\d+(?:\.\d+)?\b|\/\/[^\n]*|#[^\n]*|[A-Za-z_$][\w$]*)/g);
  return <>{tokens.map((token, index) => {
    const next = tokens[index + 1]?.trimStart() ?? "";
    let kind = "punctuation";
    if (/^["']/.test(token)) kind = "string";
    else if (/^(\/\/|#)/.test(token)) kind = "comment";
    else if (/^\d/.test(token)) kind = "number";
    else if (/^(from|import|const|let|await|new|return|true|false|null|True|False|None)$/.test(token)) kind = "keyword";
    else if (token === "print" || /^[A-Za-z_$]/.test(token) && next.startsWith("(")) kind = "function";
    else if (token === "OpenAI") kind = "class-name";
    // `https://` no es una propiedad: los dos puntos de una URL no cuentan.
    else if (/^[A-Za-z_$]/.test(token) && next.startsWith(":") && !next.startsWith("://")) kind = "property";
    return <span key={index} className={`nr-token nr-${kind}`}>{token}</span>;
  })}</>;
}

type CodeBlockProps = React.ComponentProps<"div"> & {
  code: string;
  /** Nombre del archivo o entorno, con la acción de copiar en su propia fila. */
  label?: string;
  copyLabel?: string;
  copiedLabel?: string;
  /** Resalta las líneas que contienen alguno de estos textos, como las dos que cambian en el snippet. */
  highlight?: readonly string[];
};
export function CodeBlock({ code, label, copyLabel, copiedLabel, highlight, className, ...props }: CodeBlockProps) {
  const copy = <CopyButton value={code} copyLabel={copyLabel} copiedLabel={copiedLabel} />;
  return <div className={cn("nr-code-block", label && "nr-code-block-labeled", className)} {...props}>
    {label ? <div className="nr-code-block-heading"><span>{label}</span>{copy}</div> : null}
    <pre tabIndex={0} className="nr-code-box font-mono overflow-x-auto"><HighlightedCode code={code} highlight={highlight} /></pre>
    {label ? null : copy}
  </div>;
}
