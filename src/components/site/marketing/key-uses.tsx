import MonitorIcon from "kubai-icons-react/icons/monitor";
import ScrollIcon from "kubai-icons-react/icons/scroll";
import ServerIcon from "kubai-icons-react/icons/server";
import Link from "next/link";

import { formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

import { ArrowLabel, MarketingSection } from "./section";

type Source = keyof Dictionary["dashboard"]["sources"];

/** El ajuste de key de cada caso: fuente de cobro (05 · API keys), límite de gasto de ejemplo y modelos. */
const USES: { source: Source; limitMicroUsd: number | null; model: string | null; Icon: typeof MonitorIcon }[] = [
  { source: "plan_then_prepaid", limitMicroUsd: null, model: null, Icon: MonitorIcon },
  { source: "prepaid_only", limitMicroUsd: 50_000_000, model: null, Icon: ServerIcon },
  { source: "plan_only", limitMicroUsd: 5_000_000, model: "deepseek/deepseek-v4.1-flash", Icon: ScrollIcon },
];

/** 06 · Una key para cada uso: las formas de funcionar según cómo cobra cada API key. ADR-0060. El link lleva a los docs de keys (ADR-0071). */
export function KeyUses({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const d = dict.home.uses;
  return (
    <MarketingSection
      id="ways"
      eyebrow={d.eyebrow}
      title={d.title}
      description={d.description}
      action={<Link className="nr-mk-text-link" href={`/${locale}/docs#keys`}><ArrowLabel>{d.moreLink}</ArrowLabel></Link>}
    >
      <div className="nr-mk-uses">
        {d.items.map((item, index) => {
          const use = USES[index];
          return (
            <article key={item.title} className="nr-mk-use">
              <div className="nr-mk-use-top">
                <p className="nr-mk-flow-label">{item.who}</p>
                <span className="nr-mk-icon" aria-hidden><use.Icon /></span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <dl className="nr-mk-keybox">
                <div><dt>{d.source}</dt><dd>{dict.dashboard.sources[use.source]}</dd></div>
                <div><dt>{d.limit}</dt><dd>{use.limitMicroUsd === null ? d.none : formatUsd(use.limitMicroUsd, locale, "whole")}</dd></div>
                <div><dt>{d.models}</dt><dd>{use.model ? <code>{use.model}</code> : d.all}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
    </MarketingSection>
  );
}
