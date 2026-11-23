"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type FeatureRow = { icon: React.ReactNode; title: string; body: React.ReactNode };

/**
 * El diálogo de la referencia del dueño: título centrado en una cabecera más clara, filas con su casilla de icono,
 * una nota centrada, el botón grande a todo el ancho y «Ahora no» como texto. Lo abre su propio botón (`trigger`).
 */
export function FeatureDialog({ trigger, title, description, rows, note, primary, later, closeLabel }: {
  /** El botón que lo abre: el contenido; el estilo lo pone `triggerClassName` en quien lo usa. */
  trigger: { label: React.ReactNode; className?: string };
  title: string;
  description?: string;
  rows: FeatureRow[];
  note?: React.ReactNode;
  primary: { label: string; href: string };
  later: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={trigger.className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {trigger.label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="nr-fd sm:max-w-[400px]" closeLabel={closeLabel} showCloseButton={false}>
          <div className="nr-fd-head">
            <DialogTitle className="nr-fd-title">{title}</DialogTitle>
            {description ? <DialogDescription className="nr-fd-desc">{description}</DialogDescription> : null}
          </div>
          <div className="nr-fd-body">
            <ul className="nr-fd-rows">
              {rows.map((row) => (
                <li key={row.title}>
                  <span className="nr-pr-tile" aria-hidden>{row.icon}</span>
                  <span><b>{row.title}</b><span>{row.body}</span></span>
                </li>
              ))}
            </ul>
            {note ? <p className="nr-fd-note">{note}</p> : null}
            <div className="nr-fd-actions">
              <Link href={primary.href} className={cn(buttonVariants({ size: "xl" }), "w-full")}>{primary.label}</Link>
              <DialogClose render={<Button variant="ghost" className="h-10 w-full text-[15px] font-semibold" />}>{later}</DialogClose>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
