import {
  BrainIcon,
  CodeIcon,
  CoinsIcon,
  EyeIcon,
  LockOpenIcon,
  ScrollTextIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ModelTag } from "@/lib/catalog/tags";

/** Un ícono por tag, para reconocerlos sin leer. Los tags no llevan color (ver docs/13). */
export const MODEL_TAG_ICONS: Record<ModelTag, LucideIcon> = {
  fast: ZapIcon,
  reasoning: BrainIcon,
  coding: CodeIcon,
  vision: EyeIcon,
  tools: WrenchIcon,
  "open-weights": LockOpenIcon,
  "long-context": ScrollTextIcon,
  cheap: CoinsIcon,
};

/** Chip de solo lectura con el tag de un modelo. `label` viene del diccionario de idioma. */
export function ModelTagBadge({
  tag,
  label,
  className,
}: {
  tag: ModelTag;
  label: string;
  className?: string;
}) {
  const Icon = MODEL_TAG_ICONS[tag];

  return (
    <Badge variant="outline" className={className}>
      <Icon data-icon="inline-start" aria-hidden />
      {label}
    </Badge>
  );
}
