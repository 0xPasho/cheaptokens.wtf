import Script from "next/script";

const UMAMI_HOST = "https://analytics.pasho.dev";
const UMAMI_WEBSITE_ID = "d374b5f3-970b-412b-97d1-1d5eec09e6f7";
/** Solo cuenta visitas del dominio de producción: ni local ni previews. */
const UMAMI_DOMAINS = "cheapllm.wtf";

/**
 * Umami: estadísticas (`script.js`) y grabación de sesiones (`recorder.js`).
 * La tasa de muestreo, el enmascarado y la duración de las grabaciones se
 * configuran en el panel de Umami, no aquí.
 */
export function Analytics() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <Script
        src={`${UMAMI_HOST}/script.js`}
        data-website-id={UMAMI_WEBSITE_ID}
        data-domains={UMAMI_DOMAINS}
        strategy="afterInteractive"
      />
      <Script
        src={`${UMAMI_HOST}/recorder.js`}
        data-website-id={UMAMI_WEBSITE_ID}
        data-domains={UMAMI_DOMAINS}
        strategy="afterInteractive"
      />
    </>
  );
}
