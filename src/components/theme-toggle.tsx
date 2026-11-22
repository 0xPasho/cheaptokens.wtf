"use client";

import MonitorIcon from "kubai-icons-react/icons/monitor";
import MoonIcon from "kubai-icons-react/icons/moon";
import SunIcon from "kubai-icons-react/icons/sun";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/use-theme";
import { isTheme, type Theme } from "@/lib/theme";

type ThemeToggleLabels = Record<Theme, string> & { trigger: string };

const DEFAULT_LABELS: ThemeToggleLabels = {
  trigger: "Theme",
  light: "Light",
  dark: "Dark",
  system: "System",
};

const ICONS = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
} satisfies Record<Theme, unknown>;

/** Las tres opciones como grupo de radio de un menú: las usan este botón y el menú móvil de la cabecera. */
export function ThemeMenuOptions({ labels }: { labels?: Partial<ThemeToggleLabels> }) {
  const { theme, setTheme } = useTheme();
  const text = { ...DEFAULT_LABELS, ...labels };
  return (
    <DropdownMenuRadioGroup
      value={theme}
      onValueChange={(value) => {
        if (isTheme(value)) setTheme(value);
      }}
    >
      {(Object.keys(ICONS) as Theme[]).map((option) => {
        const Icon = ICONS[option];
        return (
          <DropdownMenuRadioItem key={option} value={option} closeOnClick>
            <Icon />
            {text[option]}
          </DropdownMenuRadioItem>
        );
      })}
    </DropdownMenuRadioGroup>
  );
}

export function ThemeToggle({
  labels,
  className,
}: {
  labels?: Partial<ThemeToggleLabels>;
  className?: string;
}) {
  const text = { ...DEFAULT_LABELS, ...labels };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className={className} aria-label={text.trigger} />}
      >
        {/* El ícono sigue a la clase `.dark`, así que no depende de la hidratación. */}
        <SunIcon className="dark:hidden" />
        <MoonIcon className="hidden dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <ThemeMenuOptions labels={labels} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * El tema como select, para el pie de página. El ícono del botón sigue a la clase `.dark` (igual que
 * `ThemeToggle`), así que se ve bien antes de hidratar aunque el valor guardado llegue después.
 */
export function ThemeSelect({
  labels,
  className,
}: {
  labels?: Partial<ThemeToggleLabels>;
  className?: string;
}) {
  const { theme, setTheme } = useTheme();
  const text = { ...DEFAULT_LABELS, ...labels };
  const items = (Object.keys(ICONS) as Theme[]).map((value) => ({ value, label: text[value] }));
  return (
    <Select
      items={items}
      value={theme}
      onValueChange={(value) => {
        if (value && isTheme(value)) setTheme(value);
      }}
    >
      <SelectTrigger size="sm" aria-label={text.trigger} className={className}>
        <SunIcon aria-hidden className="dark:hidden" />
        <MoonIcon aria-hidden className="hidden dark:block" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false} side="top">
        {items.map((item) => {
          const Icon = ICONS[item.value];
          return (
            <SelectItem key={item.value} value={item.value}>
              <Icon aria-hidden />
              {item.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
