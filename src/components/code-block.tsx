import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export function HighlightedCode({ code }: { code: string }) {
  const tokens = code.split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:from|import|const|let|await|new|return|true|false|null|True|False|None|print)\b|\b\d+(?:\.\d+)?\b|\/\/[^\n]*|#[^\n]*|[A-Za-z_$][\w$]*)/g);
  return <code>{tokens.map((token, index) => {
    const next = tokens[index + 1]?.trimStart() ?? "";
    let kind = "punctuation";
    if (/^["']/.test(token)) kind = "string";
    else if (/^(\/\/|#)/.test(token)) kind = "comment";
    else if (/^\d/.test(token)) kind = "number";
    else if (/^(from|import|const|let|await|new|return|true|false|null|True|False|None)$/.test(token)) kind = "keyword";
    else if (token === "print" || /^[A-Za-z_$]/.test(token) && next.startsWith("(")) kind = "function";
    else if (token === "OpenAI") kind = "class-name";
    else if (/^[A-Za-z_$]/.test(token) && next.startsWith(":")) kind = "property";
    return <span key={index} className={`nr-token nr-${kind}`}>{token}</span>;
  })}</code>;
}

type CodeBlockProps = React.ComponentProps<"div"> & { code: string; copyLabel?: string; copiedLabel?: string };
export function CodeBlock({ code, copyLabel, copiedLabel, className, ...props }: CodeBlockProps) {
  return <div className={cn("nr-code-block", className)} {...props}>
    <pre tabIndex={0} className="nr-code-box font-mono overflow-x-auto"><HighlightedCode code={code} /></pre>
    <CopyButton value={code} copyLabel={copyLabel} copiedLabel={copiedLabel} />
  </div>;
}
