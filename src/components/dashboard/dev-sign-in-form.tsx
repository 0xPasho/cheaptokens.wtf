"use client";

import { useActionState } from "react";

import { type DevSignInState, devSignInAction } from "@/app/[lang]/(site)/sign-in/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n/config";

/** Entrar sin Clerk, solo en desarrollo local (ADR-0050). */
export function DevSignInForm({ locale, redirectUrl, labels }: {
  locale: Locale;
  redirectUrl: string;
  labels: { label: string; placeholder: string; submit: string; invalid: string; hint: string };
}) {
  const [state, action, pending] = useActionState<DevSignInState, FormData>(devSignInAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="redirect_url" value={redirectUrl} />
      <FieldGroup>
        <Field data-invalid={state?.error ? true : undefined}>
          <FieldLabel htmlFor="dev-name">{labels.label}</FieldLabel>
          <Input id="dev-name" name="name" required autoComplete="username" placeholder={labels.placeholder} aria-invalid={state?.error ? true : undefined} />
          {state?.error ? <FieldError>{labels.invalid}</FieldError> : <FieldDescription>{labels.hint}</FieldDescription>}
        </Field>
        <Button type="submit" disabled={pending}>{labels.submit}</Button>
      </FieldGroup>
    </form>
  );
}
