"use client";
import Link from "next/link";
import ArrowLeftIcon from "kubai-icons-react/icons/arrow-left";
import ExternalLinkIcon from "kubai-icons-react/icons/external-link";
import { useId, useState } from "react";
import { CatalogSidebar } from "@/components/catalog/catalog-sidebar";
import { ModelQuickstart, ModelApiDetails } from "@/components/catalog/model-quickstart";
import { ModelDetailPanel } from "@/components/catalog/model-detail-panel";
import { ModelLogo, ProviderLogo, providerName } from "@/components/catalog/provider-logo";
import { CopyButton } from "@/components/copy-button";
import { Price, PriceComparison } from "@/components/price";
import { Button } from "@/components/ui/button";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import { requestCost, similarModels } from "@/lib/catalog/queries";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatDate, formatDiscount, formatTokens } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";

export function ModelDetail({ model, models, locale, dict }: { model: CatalogModel; models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const id = useId();
  const sidebarId = `${id}-sidebar`;
  const apiId = `${id}-api`;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const filters = useCatalogFilters();
  const back = `/${locale}/models${filters.search}`;
  const officialCost = requestCost(model.officialInput, model.officialOutput, 2000, 500);
  const discountedCost = requestCost(model.discountedInput, model.discountedOutput, 2000, 500);
  const similar = similarModels(model, models);
  return <div className="nr-model-page">
    <Button variant="secondary" className="nr-model-sidebar-toggle nr-detail-button" aria-expanded={sidebarOpen} aria-controls={sidebarId} onClick={() => setSidebarOpen(!sidebarOpen)}>{dict.detail.modelFilters}</Button>
    <div className="nr-layout nr-model-shell">
      <CatalogSidebar models={models} locale={locale} dict={dict} detail open={sidebarOpen} sidebarId={sidebarId} />
      <div id={`${id}-content`} className="nr-model-content">
        <Link href={back} className="nr-breadcrumb"><ArrowLeftIcon size={14} aria-hidden />{dict.catalog.allModels}</Link>
        <ModelDetailPanel className="nr-detail-overview" aria-label={model.name} footer={
          <div className="nr-model-meta"><b className="nr-model-author"><ProviderLogo author={model.author} />{providerName(model.author)}</b><span className="nr-task">{dict.catalog.textGeneration}</span></div>
        }>
          <div className="nr-model-heading"><ModelLogo modelId={model.id} /><h1>{model.name}</h1></div>
          <div className="nr-model-slug"><code>{model.id}</code><CopyButton value={model.id} copyLabel={dict.copy.copy} copiedLabel={dict.copy.copied} className="nr-detail-button" /><span className="nr-task">{formatDiscount(model.discountBps, locale)}</span></div>
          <p className="nr-detail-description">{model.description[locale] ?? model.description.en}</p>
        </ModelDetailPanel>
        <div className="nr-detail-layout">
          <div className="nr-detail-primary">
            <ModelQuickstart model={model.id} locale={locale} dict={dict} />
            <ModelApiDetails model={model.id} dict={dict} id={apiId} />
          </div>
          <aside className="nr-detail-aside" aria-label={dict.detail.specs}>
            <ModelDetailPanel aria-label={dict.detail.pricing} footer={
              <p className="nr-source-note">{model.officialPriceVerifiedAt ? t(dict.detail.verifiedOn, { date: formatDate(model.officialPriceVerifiedAt, locale) }) : dict.detail.unverified}</p>
            }>
              <div className="nr-panel-heading"><h2>{dict.detail.pricing}</h2><small>{dict.detail.perMillion}</small></div>
              <dl className="nr-detail-pricing">
                {[{ label: dict.detail.input, official: model.officialInput, discounted: model.discountedInput }, { label: dict.detail.output, official: model.officialOutput, discounted: model.discountedOutput }].map((row) => <div key={row.label}>
                  <dt>{row.label}</dt><dd><PriceComparison official={row.official} discounted={row.discounted} locale={locale} labels={{ official: dict.catalog.official, discounted: dict.catalog.discounted }} /></dd>
                </div>)}
              </dl>
            </ModelDetailPanel>
            <ModelDetailPanel aria-label={dict.detail.specs}>
              <dl className="nr-detail-facts">
                <div><dt>{dict.detail.context}</dt><dd>{formatTokens(model.contextLength, locale)}</dd></div>
                <div><dt>{dict.detail.status}</dt><dd>{model.status === "deprecated" && model.retiresOn ? t(dict.detail.statusDeprecated, { date: formatDate(model.retiresOn, locale) }) : dict.detail.statusActive}</dd></div>
              </dl>
            </ModelDetailPanel>
            <ModelDetailPanel aria-label={dict.detail.modelInfo}>
              <div className="nr-panel-heading"><h2>{dict.detail.modelInfo}</h2></div>
              <dl className="nr-model-info">
                <div><dt>{dict.detail.author}</dt><dd className="nr-model-author"><ProviderLogo author={model.author} />{providerName(model.author)}</dd></div>
                <div><dt>{dict.catalog.columns.discount}</dt><dd>{formatDiscount(model.discountBps, locale)}</dd></div>
                <div className="nr-full"><dt>{dict.detail.capabilities}</dt><dd className="flex flex-wrap gap-2">{model.allTags.map((tag) => <span className="nr-task" key={tag}>{dict.tags[tag]}</span>)}</dd></div>
              </dl>
            </ModelDetailPanel>
            <ModelDetailPanel aria-label={dict.detail.costTitle}>
              <div className="nr-panel-heading"><h2>{dict.detail.costTitle}</h2></div>
              <div className="nr-cost"><p>{t(dict.detail.costBody, { input: formatCount(2000, locale), output: formatCount(500, locale) })}</p>
                <dl><div><dt>{dict.detail.discountedCost}</dt><dd><Price micros={discountedCost} kind="cost" locale={locale} /></dd></div>
                  <div><dt>{dict.detail.officialCost}</dt><dd><Price micros={officialCost} kind="cost" locale={locale} /></dd></div>
                  <div><dt>{dict.detail.savings}</dt><dd className="text-success"><Price micros={officialCost - discountedCost} kind="cost" locale={locale} /></dd></div>
                </dl>
              </div>
            </ModelDetailPanel>
            <ModelDetailPanel aria-label={dict.detail.resources}>
              <div className="nr-panel-heading"><h2>{dict.detail.resources}</h2></div>
              <div className="nr-resource-links"><Link href={`/${locale}/docs`}>{dict.nav.docs} <ExternalLinkIcon size={14} aria-hidden /></Link><a href={model.officialPriceSourceUrl} target="_blank" rel="noreferrer">{dict.detail.source} <ExternalLinkIcon size={14} aria-hidden /></a><a href={`#${apiId}`}>{dict.detail.schema} <ExternalLinkIcon size={14} aria-hidden /></a><Link href={back}>{dict.catalog.allModels} <ExternalLinkIcon size={14} aria-hidden /></Link></div>
            </ModelDetailPanel>
          </aside>
        </div>
        {similar.length ? <ModelDetailPanel className="nr-upstream-section" aria-label={dict.detail.similar}>
          <div className="nr-panel-heading"><h2>{dict.detail.similar}</h2></div>
          {similar.map((item) => <div className="nr-route-rates" key={item.id}><Link className="nr-related-model" href={`/${locale}/models/${item.author}/${item.slug}${filters.search}`}><span>{item.name}</span><code>{item.id}</code><span>{formatDiscount(item.discountBps, locale)}</span></Link></div>)}
        </ModelDetailPanel> : null}
      </div>
    </div>
  </div>;
}
