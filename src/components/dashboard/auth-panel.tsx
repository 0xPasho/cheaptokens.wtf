import { SignIn, SignUp } from "@clerk/nextjs";
import TriangleAlertIcon from "kubai-icons-react/icons/triangle-alert";

import { RichText } from "@/components/docs/rich-text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthMode } from "@/lib/auth/mode";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

import { DevSignInForm } from "./dev-sign-in-form";

/** Iniciar sesión o crear cuenta: Clerk si está configurado, el formulario de desarrollo si no (ADR-0050). */
export async function AuthPanel({ kind, locale, dict, searchParams }: {
  kind: "sign-in" | "sign-up";
  locale: Locale;
  dict: Dictionary;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = getAuthMode();
  const { auth } = dict;
  if (mode === "clerk") {
    const props = { routing: "path" as const, path: `/${locale}/${kind}` };
    return kind === "sign-in"
      ? <SignIn {...props} signUpUrl={`/${locale}/sign-up`} />
      : <SignUp {...props} signInUrl={`/${locale}/sign-in`} />;
  }
  if (mode === "none") {
    return (
      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertTitle>{auth.unavailableTitle}</AlertTitle>
        <AlertDescription>{auth.unavailableBody}</AlertDescription>
      </Alert>
    );
  }
  const params = await searchParams;
  const redirectUrl = typeof params.redirect_url === "string" ? params.redirect_url : `/${locale}/dashboard`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{auth.devTitle}</CardTitle>
        <CardDescription><RichText text={auth.devBody} /></CardDescription>
      </CardHeader>
      <CardContent>
        <DevSignInForm
          locale={locale}
          redirectUrl={redirectUrl}
          labels={{ label: auth.devLabel, placeholder: auth.devPlaceholder, submit: auth.devSubmit, invalid: auth.devInvalid, hint: auth.devInvalid }}
        />
      </CardContent>
    </Card>
  );
}
