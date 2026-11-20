"use client";

import MonitorIcon from "kubai-icons-react/icons/monitor";
import MoonIcon from "kubai-icons-react/icons/moon";
import SunIcon from "kubai-icons-react/icons/sun";

import { Button } from "@/components/ui/button";
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
