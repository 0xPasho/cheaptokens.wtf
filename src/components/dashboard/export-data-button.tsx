"use client";

import DownloadIcon from "kubai-icons-react/icons/download";
import { useState, useTransition } from "react";

import { exportDataAction } from "@/app/[lang]/(site)/dashboard/actions";
import { Button } from "@/components/ui/button";

/** Descarga un JSON con los datos del workspace (sin secretos). */
export function ExportDataButton({ label, errorLabel }: { label: string; errorLabel: string }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const download = () => startTransition(async () => {
    setFailed(false);
    let json: string;
    try {
      json = await exportDataAction();
    } catch {
      // Sesión vencida o un fallo del servidor: se avisa en vez de romper la página.
      setFailed(true);
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "cheapllm-data.json" });
    link.click();
    URL.revokeObjectURL(url);
  });
  return (
    <div className="flex flex-col items-start gap-3">
      <Button variant="outline" onClick={download} disabled={pending}>
        <DownloadIcon data-icon="inline-start" aria-hidden />
        {label}
      </Button>
      {failed ? <p role="alert" className="text-sm text-destructive">{errorLabel}</p> : null}
    </div>
  );
}
