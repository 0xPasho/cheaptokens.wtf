import KeyRoundIcon from "kubai-icons-react/icons/key-round";

import { ModelLogo } from "@/components/catalog/provider-logo";
import { t } from "@/lib/i18n/dictionaries";

import { HowScroll } from "./how-scroll";

type Step = { title: string; body: string };
type Row = { label: string; value: string; note?: string };

/** Ancho de cada ruta frente a la más cara. Ilustrativo: lo dice el pie. La 2 es la elegida. */
const ROUTES = [0.86, 0.58, 1];
const CHOSEN_ROUTE = 1;

/** Un ✓ en trazo, del color del texto. */
function Check() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5 6.5 11.5 12.5 5" /></svg>;
}

/**
 * Los dibujos en código de los seis pasos de un request (como los cuadros de /pricing). `HowScroll` los muestra uno
 * a uno mientras se hace scroll por la lista de pasos.
 */
export function HowBento({ label, steps, stops, stopLabel, stopAmount, rows, total, modelId, completionTokens, locale, text }: {
  /** «Request de ejemplo»: el nombre de la tarjeta con los dibujos. */
  label: string;
  steps: Step[];
  stops: (string | null)[];
  stopLabel: string;
  stopAmount: string;
  /** Key, reservado, ruta, intentos y tokens: una fila por paso, del 1 al 5. */
  rows: Row[];
  total: { label: string; value: string; official: string; savings: string };
  modelId: string;
  completionTokens: number;
  locale: string;
  text: { route: string; cheapest: string; written: string; example: string; attempt: string };
}) {
  const count = (value: number) => new Intl.NumberFormat(locale).format(value);
  const visuals = [
    // 1 · La key: se revisa de un barrido y queda el ✓.
    <div key="key" className="nr-hv-key">
      <span className="nr-hv-key-pill"><KeyRoundIcon aria-hidden /><code>{rows[0]?.value}</code><i className="nr-hv-check"><Check /></i></span>
      {rows[0]?.note ? <span className="nr-bv-pill nr-hv-key-note">{rows[0].note}</span> : null}
    </div>,
    // 2 · Lo que queda en la ventana, con la reserva de este request encima.
    <div key="hold" className="nr-hv-hold">
      <div className="nr-hv-hold-track"><i className="nr-hv-hold-used" /><i className="nr-hv-hold-chunk" /></div>
      <p><b>{rows[1]?.label}</b><span>{rows[1]?.value}</span></p>
    </div>,
    // 3 · Las rutas del mismo modelo: gana la más barata.
    <ul key="routes" className="nr-hv-routes">
      {ROUTES.map((width, index) => (
        <li key={index} data-chosen={index === CHOSEN_ROUTE || undefined}>
          <span>{t(text.route, { n: String(index + 1) })}</span>
          <span className="nr-hv-route-track"><i style={{ "--w": `${width * 100}%`, "--d": `${index * 140}ms` } as React.CSSProperties} /></span>
          <b>{index === CHOSEN_ROUTE ? text.cheapest : ""}</b>
        </li>
      ))}
    </ul>,
    // 4 · Un intento falla antes del primer token y el siguiente responde.
    <div key="retry" className="nr-hv-retry">
      <span className="nr-hv-attempt" data-failed><span>{t(text.attempt, { n: "1" })}</span><code>502</code></span>
      <svg className="nr-hv-retry-arrow" viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12h30M28 6l6 6-6 6" /></svg>
      <span className="nr-hv-attempt" data-ok><span>{t(text.attempt, { n: "2" })}</span><code>200</code><i className="nr-hv-check"><Check /></i></span>
    </div>,
    // 5 · El modelo escribe y la respuesta llega a tu app.
    <div key="stream" className="nr-hv-stream">
      <span className="nr-hv-stream-model"><ModelLogo modelId={modelId} /></span>
      <div className="nr-hv-bubble">{[100, 88, 94, 56].map((width, index) => <i key={index} style={{ "--w": `${width}%`, "--d": `${index * 420}ms` } as React.CSSProperties} />)}</div>
      <span className="nr-hv-stream-count">{t(text.written, { count: count(completionTokens) })}</span>
    </div>,
    // 6 · El cobro: lo que costó, el oficial tachado y el ahorro.
    <div key="charge" className="nr-hv-charge">
      <span className="nr-hv-charge-label">{total.label}</span>
      <b>{total.value}</b>
      <span className="nr-hv-charge-note"><s>{total.official}</s><span>{total.savings}</span></span>
    </div>,
  ];

  return <HowScroll label={label} steps={steps} stops={stops} stopLabel={stopLabel} stopAmount={stopAmount} visuals={visuals} foot={text.example} />;
}
