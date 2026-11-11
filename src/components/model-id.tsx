import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

/** ID de modelo (`anthropic/claude-haiku-4.5`) en mono y copiable. */
export function ModelId({
  id,
  copyLabel,
  copiedLabel,
  className,
}: {
  id: string;
  copyLabel?: string;
  copiedLabel?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-0.5", className)}>
      <code className="truncate font-mono text-xs text-muted-foreground">
        {id}
      </code>
      <CopyButton
        value={id}
        size="icon-xs"
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
      />
    </span>
  );
}
