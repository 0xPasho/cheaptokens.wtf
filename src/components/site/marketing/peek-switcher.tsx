"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PeekMode } from "@/lib/marketing";

export type PeekPanel = {
  mode: PeekMode;
  key: string;
  label: string;
  icon: ReactNode;
  count: string;
  blurb: string;
  href: string;
  viewLabel: string;
  showing: string;
  cards: ReactNode;
};

/** Elige el modo (capacidad o autor) y el grupo del vistazo al catálogo. Todo lo demás llega armado. */
export function PeekSwitcher({ panels, viewAll, labels }: {
  panels: PeekPanel[];
  viewAll: { href: string; label: string };
  labels: { groupBy: string; byTag: string; byAuthor: string; groups: string };
}) {
  const first = (mode: PeekMode) => panels.find((panel) => panel.mode === mode)?.key ?? "";
  const [mode, setMode] = useState<PeekMode>("tag");
  const [selected, setSelected] = useState<Record<PeekMode, string>>({ tag: first("tag"), author: first("author") });
  const visible = panels.filter((panel) => panel.mode === mode);
  const current = visible.find((panel) => panel.key === selected[mode]) ?? visible[0];
  if (!current) return null;

  return (
    <div className="nr-mk-peek">
      <ToggleGroup
        className="nr-mk-switch"
        aria-label={labels.groupBy}
        value={[mode]}
        onValueChange={(value) => value[0] && setMode(value[0] as PeekMode)}
      >
        <ToggleGroupItem value="tag">{labels.byTag}</ToggleGroupItem>
        <ToggleGroupItem value="author">{labels.byAuthor}</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup
        className="nr-mk-chips"
        aria-label={labels.groups}
        value={[current.key]}
        onValueChange={(value) => value[0] && setSelected((previous) => ({ ...previous, [mode]: value[0] }))}
      >
        {visible.map((panel) => (
          <ToggleGroupItem key={panel.key} value={panel.key}>
            {panel.icon}{panel.label}<span className="nr-mk-chip-count">{panel.count}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="nr-mk-peek-blurb" aria-live="polite">{current.blurb}</p>
      <div className="nr-grid nr-mk-peek-grid">{current.cards}</div>
      <div className="nr-mk-peek-foot">
        <p>{current.showing}</p>
        <div>
          <Link href={current.href} className={buttonVariants({ className: "nr-mk-button" })}>
            <span>{current.viewLabel}</span><span className="nr-mk-arrow" aria-hidden>→</span>
          </Link>
          <Link href={viewAll.href} className={buttonVariants({ variant: "secondary", className: "nr-mk-button" })}>{viewAll.label}</Link>
        </div>
      </div>
    </div>
  );
}
