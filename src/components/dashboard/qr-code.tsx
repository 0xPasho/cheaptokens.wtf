"use client";

import QRCode from "qrcode";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

/** QR en SVG, nítido a cualquier tamaño. Tinta y papel fijos (`--qr`): muchos lectores no leen el QR invertido. */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    let d = "";
    // `get(fila, columna)`: la fila es la `y`. Al revés sale un QR en espejo, que no todos los lectores leen.
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    }
    return { size: modules.size, path: d };
  }, [value]);
  return (
    <svg viewBox={`-3 -3 ${size + 6} ${size + 6}`} role="img" aria-label={label} className={cn("rounded-2xl bg-qr text-qr-foreground", className)}>
      <path d={path} fill="currentColor" shapeRendering="crispEdges" />
    </svg>
  );
}
