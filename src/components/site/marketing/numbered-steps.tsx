import { RichText } from "@/components/docs/rich-text";
import { formatCount } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";

/** Pasos numerados 01 · 02 · 03 en tarjetas. El cuerpo admite `código` entre backticks. */
export function NumberedSteps({ steps, locale, label }: { steps: { title: string; body: string }[]; locale: Locale; label?: string }) {
  return (
    <ol className="nr-mk-steps" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.title} className="nr-mk-step">
          <span className="nr-mk-step-number" aria-hidden>{formatCount(index + 1, locale).padStart(2, "0")}</span>
          <h3>{step.title}</h3>
          <p><RichText text={step.body} /></p>
        </li>
      ))}
    </ol>
  );
}
