/* eslint-disable @next/next/no-img-element -- Small local SVG brand marks. */
import CodeIcon from "kubai-icons-react/icons/code";
import KeyRoundIcon from "kubai-icons-react/icons/key-round";
import WalletIcon from "kubai-icons-react/icons/wallet";
import Link from "next/link";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { API_BASE_URL } from "@/lib/site";

import { ArrowLabel, MarketingSection } from "./section";

type DiffLine = { kind: "same" | "removed" | "added"; text: string };

/** El cambio, como un diff de dos líneas. Es código: no se traduce. */
const DIFF: DiffLine[] = [
  { kind: "same", text: "from openai import OpenAI" },
  { kind: "same", text: "" },
  { kind: "same", text: "client = OpenAI(" },
  { kind: "removed", text: '    base_url="https://api.openai.com/v1",' },
  { kind: "removed", text: '    api_key="sk-...",' },
  { kind: "added", text: `    base_url="${API_BASE_URL}",` },
  { kind: "added", text: '    api_key="wtf_...",' },
  { kind: "same", text: ")" },
];

const SIGN = { same: " ", removed: "-", added: "+" } as const;

/** Los tres pasos, en orden: saldo, key y las dos líneas. La lista sigue siendo `ol`: el orden no depende del icono. */
const STEP_ICONS = [WalletIcon, KeyRoundIcon, CodeIcon];

/** Logo de marca en un chip: decorativo, el nombre ya va escrito al lado. */
function ToolLogo({ file }: { file: string }) {
  return <img className="nr-brand-monochrome" src={`/brand/logos/${file}.svg`} alt="" width={14} height={14} />;
}

/**
 * 04 · Cambiarse, en vez del diagrama de flechas: el diff exacto, los tres pasos en una línea y con qué funciona.
 * El diff usa tonos neutros, no rojo y verde: en este sistema el verde es solo dinero (docs/13 › Color).
 * «Leer los docs» es la información de más: el inicio rápido completo (ADR-0071).
 */
export function SwitchDiff({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const d = dict.home.switchTo;
  const tools = dict.home.uses.tools;
  return (
    <MarketingSection
      id="switch"
      eyebrow={d.eyebrow}
      title={d.title}
      description={d.description}
      action={<Link className="nr-mk-text-link" href={`/${locale}/docs#quickstart`}><ArrowLabel>{d.docsLink}</ArrowLabel></Link>}
    >
      <div className="nr-mk-switch-grid">
        <figure className="nr-mk-diff">
          <figcaption>{d.diffLabel}</figcaption>
          <pre tabIndex={0}><code>{DIFF.map((line, index) => (
            <span key={index} className="nr-mk-diff-line" data-kind={line.kind}>
              <span className="nr-mk-diff-sign">{SIGN[line.kind]}</span>{line.text}{"\n"}
            </span>
          ))}</code></pre>
        </figure>
        <div className="nr-mk-switch-side">
          <h3 className="nr-mk-eyebrow">{d.stepsLabel}</h3>
          <ol className="nr-mk-inline-steps">
            {d.steps.map((step, index) => {
              const Icon = STEP_ICONS[index];
              return (
                <li key={step}>
                  {Icon ? <span className="nr-mk-icon" aria-hidden><Icon /></span> : <span aria-hidden>{index + 1}</span>}
                  {step}
                </li>
              );
            })}
          </ol>
          <h3 className="nr-mk-eyebrow">{d.toolsLabel}</h3>
          <ul className="nr-mk-tool-list">
            <li><CodeIcon size={14} aria-hidden />{tools.code}</li>
            <li><ToolLogo file="langchain" />{tools.langchain}</li>
            <li><ToolLogo file="vercel" />{tools.vercel}</li>
            <li>{tools.editors}</li>
            <li data-soon>{tools.claudeCode}</li>
          </ul>
        </div>
      </div>
    </MarketingSection>
  );
}
