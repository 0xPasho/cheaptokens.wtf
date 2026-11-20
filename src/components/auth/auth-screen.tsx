import TriangleAlertIcon from "kubai-icons-react/icons/triangle-alert";

import { Container } from "@/components/container";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAuthMode } from "@/lib/auth/mode";
import type { AuthView } from "@/lib/auth/redirect";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

import { ClerkAuthWindow } from "./clerk-auth-window";
import { DevAuthWindow } from "./dev-auth-window";

/**
 * La página de acceso. `/sign-in` y `/sign-up` pintan la misma ventana: la vista sale de la URL y solo
 * cambia el texto (ADR-0063). Clerk si está configurado, el modo de desarrollo si no (ADR-0050).
 */
export async function AuthScreen({ view }: { view: AuthView }) {
  const [locale, dict] = await getLocaleAndDictionary();
  const { auth } = dict;
  const mode = getAuthMode();
  const titles = {
    "sign-in": `${auth.signInTitle} · ${dict.meta.siteName}`,
    "sign-up": `${auth.signUpTitle} · ${dict.meta.siteName}`,
  };
  return (
    <Container className="nr-auth-page">
      {mode === "clerk" ? <ClerkAuthWindow locale={locale} labels={auth} titles={titles} /> : null}
      {mode === "dev" ? <DevAuthWindow locale={locale} labels={auth} titles={titles} /> : null}
      {mode === "none" ? (
        <div className="nr-auth">
          <header className="nr-auth-head">
            <h1 className="nr-auth-title">{view === "sign-up" ? auth.signUpTitle : auth.signInTitle}</h1>
            <p className="nr-auth-desc">{view === "sign-up" ? auth.signUpDescription : auth.signInDescription}</p>
          </header>
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>{auth.unavailableTitle}</AlertTitle>
            <AlertDescription>{auth.unavailableBody}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </Container>
  );
}
