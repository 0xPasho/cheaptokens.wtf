import BrainIcon from "kubai-icons-react/icons/brain";
import CodeIcon from "kubai-icons-react/icons/code";
import CoinsIcon from "kubai-icons-react/icons/coins";
import EyeIcon from "kubai-icons-react/icons/eye";
import LockOpenIcon from "kubai-icons-react/icons/lock-open";
import ScrollTextIcon from "kubai-icons-react/icons/scroll";
import WrenchIcon from "kubai-icons-react/icons/wrench";
import ZapIcon from "kubai-icons-react/icons/gauge";
import type { KubaiIconComponent } from "kubai-icons-react";

import { Badge } from "@/components/ui/badge";
import type { ModelTag } from "@/lib/catalog/tags";

/** Un ícono por tag, para reconocerlos sin leer. Los tags no llevan color (ver docs/13). */
export const MODEL_TAG_ICONS: Record<ModelTag, KubaiIconComponent> = {
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
