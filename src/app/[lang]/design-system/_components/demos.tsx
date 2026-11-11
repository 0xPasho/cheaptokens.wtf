"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { formatUsd } from "@/lib/format";

/**
 * Confirmación de una acción destructiva. En la app, "Revocar" envía el form
 * de revocación; aquí solo cierra el diálogo.
 */
export function RevokeKeyDemo() {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        Revocar
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Revocar la key “producción”?</AlertDialogTitle>
          <AlertDialogDescription>
            Los requests que usen esta key van a fallar de inmediato. No se puede
            deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => setOpen(false)}
          >
            Revocar key
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Umbral del aviso de saldo bajo (docs/02 › Dashboard). El valor visible se
 * actualiza al mover el slider y siempre pasa por `formatUsd`.
 */
export function LowBalanceThresholdDemo({ locale }: { locale: string }) {
  const [dollars, setDollars] = useState(2);

  return (
    <div className="flex max-w-md flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <Label id="ds-threshold-label">Avisarme cuando el saldo baje de</Label>
        <span className="text-sm font-medium tabular-nums">
          {formatUsd(dollars * 1_000_000, locale, "whole")}
        </span>
      </div>
      <Slider
        aria-labelledby="ds-threshold-label"
        min={1}
        max={20}
        step={1}
        value={[dollars]}
        onValueChange={(value) => {
          const next = Array.isArray(value) ? value[0] : value;
          if (typeof next === "number") setDollars(next);
        }}
      />
    </div>
  );
}
