"use client";

import DownloadIcon from "kubai-icons-react/icons/download";
import { useTransition } from "react";

import { exportDataAction } from "@/app/[lang]/(site)/dashboard/actions";
import { Button } from "@/components/ui/button";

/** Descarga un JSON con los datos del workspace (sin secretos). */
export function ExportDataButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();
  const download = () => startTransition(async () => {
    const json = await exportDataAction();
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "cheapllm-data.json" });
    link.click();
    URL.revokeObjectURL(url);
  });
  return (
    <Button variant="outline" onClick={download} disabled={pending}>
      <DownloadIcon data-icon="inline-start" aria-hidden />
      {label}
    </Button>
  );
}
