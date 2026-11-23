"use client";

import EyeOffIcon from "kubai-icons-react/icons/eye-off";
import { useEffect, useRef, useState } from "react";

import { ModelLogo } from "@/components/catalog/provider-logo";

type Step = { title: string; body: string };
type Row = { label: string; value: string; note?: React.ReactNode };

/**
 * Los seis pasos de un request, ya formateados en el servidor, y el recibo del mismo request de ejemplo (ADR-0071).
 * Los cuatro primeros pueden detenerlo: dicen qué error llega y que no cuesta nada (04 · API › Errores).
 * El paso que cruza el centro de la pantalla marca su fila del recibo; pasar el cursor o el foco por un paso lo fija.
 * Los pasos que faltan van en gris apagado y no con opacidad, para no bajar el contraste del texto.
 */
export function RequestLife({ steps, stops, stopLabel, stopAmount, receipt }: {
  steps: Step[];
  /** El error con el que se detiene cada paso, o `null` si el paso no detiene el request. Es código: no se traduce. */
  stops: (string | null)[];
  stopLabel: string;
  /** «$0.00», formateado con el idioma de la ruta. */
  stopAmount: string;
  receipt: { label: string; modelId: string; rows: Row[]; total: Row & { savings: string }; foot: string };
}) {
  const list = useRef<HTMLOListElement>(null);
  const [scrolled, setScrolled] = useState(1);
  const [pinned, setPinned] = useState<number | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const items = [...(list.current?.children ?? [])] as HTMLElement[];
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.55;
      let current = 1;
      items.forEach((item, index) => { if (item.getBoundingClientRect().top < line) current = index + 1; });
      setScrolled(current);
      setLive(true);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const current = pinned ?? scrolled;
  const state = (step: number) => (step === current ? "active" : step < current ? "done" : "next");
  const rows = [...receipt.rows, receipt.total];

  return (
    <div className="nr-hw-life" data-live={live || undefined}>
      <ol className="nr-hw-steps" ref={list}>
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="nr-hw-step"
            data-state={state(index + 1)}
            tabIndex={0}
            onMouseEnter={() => setPinned(index + 1)}
            onMouseLeave={() => setPinned(null)}
            onFocus={() => setPinned(index + 1)}
            onBlur={() => setPinned(null)}
          >
            <span className="nr-hw-step-number" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              {stops[index] ? (
                <p className="nr-hw-stop">{stopLabel}<code>{stops[index]}</code><b>{stopAmount}</b></p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <aside className="nr-hw-receipt" aria-label={receipt.label}>
        <div className="nr-hw-receipt-top">
          <p>{receipt.label}</p>
          <span className="nr-hw-receipt-model"><ModelLogo modelId={receipt.modelId} />{receipt.modelId.split("/")[1]}</span>
        </div>
        <dl className="nr-hw-receipt-front">
          {rows.map((row, index) => (
            <div key={row.label} className="nr-hw-row" data-state={state(index + 1)} data-total={index === rows.length - 1 || undefined}>
              <dt><span className="nr-hw-row-number" aria-hidden>{String(index + 1).padStart(2, "0")}</span>{row.label}</dt>
              <dd>{row.value}</dd>
              {row.note ? <dd className="nr-hw-row-note">{row.note}</dd> : null}
              {index === rows.length - 1 ? <dd className="nr-hw-row-note nr-hw-savings">{receipt.total.savings}</dd> : null}
            </div>
          ))}
        </dl>
        <p className="nr-hw-receipt-foot"><span className="nr-mk-icon" aria-hidden><EyeOffIcon /></span>{receipt.foot}</p>
      </aside>
    </div>
  );
}
