"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody } from "@/components/ui/table";
import { t } from "@/lib/i18n/dictionaries";

/**
 * Una tabla larga que empieza con sus primeras filas y se abre entera con un botón. Las filas llegan ya armadas
 * desde el servidor; aquí solo se decide cuántas se ven.
 */
export function ExpandableTable({ head, rows, initial, label, moreLabel, lessLabel }: {
  head: React.ReactNode;
  rows: React.ReactNode[];
  initial: number;
  /** Nombre de la región que se desplaza en móvil. */
  label: string;
  /** Con `{count}`: «Ver los 97 modelos». */
  moreLabel: string;
  lessLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const extra = rows.length > initial;
  return (
    <Card className="gap-0 py-0">
      <Table regionLabel={label}>
        {head}
        <TableBody>{open || !extra ? rows : rows.slice(0, initial)}</TableBody>
      </Table>
      {extra ? (
        <div className="flex justify-center px-5 pt-2 pb-4">
          <Button variant="outline" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? lessLabel : t(moreLabel, { count: String(rows.length) })}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
