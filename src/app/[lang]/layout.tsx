import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";

import { KonamiRetro } from "@/components/konami-retro";
import { ThemeSync } from "@/components/theme-sync";
import { TooltipProvider } from "@/components/ui/tooltip";
import { hasLocale, LOCALES } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { retroScript } from "@/lib/retro";
import { themeScript } from "@/lib/theme";

import "../globals.css";

const inter = localFont({ src: "../fonts/inter-variable.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });
const jetbrains = localFont({ src: "../fonts/jetbrains-mono.woff2", variable: "--font-jetbrains", weight: "400", display: "swap" });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = getDictionary(lang);
  return {
    title: { default: dict.meta.homeTitle, template: `%s · ${dict.meta.siteName}` },
    description: dict.meta.homeDescription,
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])) },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);

  return (
    <html
      lang={lang}
      className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}
      // `themeScript` agrega la clase `.dark` antes de hidratar.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        {/* El código Konami (↑↑↓↓←→←→BA Enter) alterna el modo retro; ver ADR-0048. */}
        <script dangerouslySetInnerHTML={{ __html: retroScript }} />
        <ThemeSync />
        <KonamiRetro dict={dict} />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
