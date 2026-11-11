import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type CodeBlockProps = React.ComponentProps<"div"> & {
  code: string;
  copyLabel?: string;
  copiedLabel?: string;
};

/** Bloque de código con botón de copiar. Se desplaza en horizontal, nunca corta líneas. */
export function CodeBlock({
  code,
  copyLabel,
  copiedLabel,
  className,
  ...props
}: CodeBlockProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl glass-edge [--edge-fill:var(--muted)]",
        className,
      )}
      {...props}
    >
      {/* tabIndex: si el código no cabe, con teclado se enfoca y se desplaza con las flechas. */}
      <pre
        tabIndex={0}
        className="overflow-x-auto rounded-2xl py-3 pr-12 pl-4 font-mono text-xs leading-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm sm:leading-6"
      >
        <code>{code}</code>
      </pre>
      <CopyButton
        value={code}
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
        className="absolute top-2 right-2"
      />
    </div>
  );
}
