// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Las reglas de docs/13-sistema-de-diseno.md que se pueden revisar leyendo el código.
 * Cada falla dice el archivo y la línea.
 */
const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesIn(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const sources = filesIn(SRC).map((path) => ({
  path: relative(ROOT, path),
  lines: readFileSync(path, "utf8").split("\n"),
}));

/** Devuelve `archivo:línea  código` para cada línea que cumple el patrón. */
function offenders(pattern: RegExp, only?: (path: string) => boolean) {
  return sources
    .filter(({ path }) => !only || only(path))
    .flatMap(({ path, lines }) =>
      lines.flatMap((line, i) =>
        pattern.test(line) ? [`${path}:${i + 1}  ${line.trim()}`] : [],
      ),
    );
}

const PALETTE =
  "white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITIES =
  "bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|divide|placeholder|caret|accent";

describe("reglas de color", () => {
  it("no hay colores crudos de Tailwind: solo tokens semánticos", () => {
    const raw = new RegExp(`\\b(${UTILITIES})-(${PALETTE})(-\\d{2,3})?(\\/\\d+)?\\b`);
    expect(offenders(raw)).toEqual([]);
  });

  it("no hay colores hex ni rgb() en los componentes", () => {
    expect(offenders(/["'`\s](#[0-9a-fA-F]{3,8}|rgba?\()/)).toEqual([]);
  });
});

describe("reglas de composición", () => {
  it("ningún link usa <Button nativeButton={false}> (le pone role=button)", () => {
    expect(offenders(/nativeButton=\{false\}/)).toEqual([]);
  });
});

describe("reglas de formato", () => {
  it("nadie formatea números con toFixed()", () => {
    expect(offenders(/\.toFixed\(/)).toEqual([]);
  });

  it("nadie arma montos a mano con un signo de dólar", () => {
    // "$" + n, `$${n}` o un ">$" literal en JSX
    expect(
      offenders(/("\$"\s*\+|`\$\$\{|>\$\d|>\$\{)/, (p) => !p.includes("/lib/format")),
    ).toEqual([]);
  });

  it("los componentes que muestran dinero usan @/lib/format", () => {
    for (const file of ["price.tsx", "discount-badge.tsx"]) {
      const source = readFileSync(join(SRC, "components", file), "utf8");
      expect(source, file).toContain('from "@/lib/format"');
    }
  });
});

describe("referencia viva: /design-system", () => {
  const designSystem = filesIn(join(SRC, "app/[lang]/design-system"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  it("muestra cada átomo instalado en src/components/ui", () => {
    // Se ven dentro de un componente de producto que sí está en /design-system.
    const shownInside = new Set(["tabs"]); // QuickstartSnippet
    const atoms = readdirSync(join(SRC, "components/ui"))
      .map((f) => basename(f, ".tsx"))
      .filter((atom) => !shownInside.has(atom));
    const missing = atoms.filter(
      (atom) => !designSystem.includes(`@/components/ui/${atom}"`),
    );
    expect(missing).toEqual([]);
  });

  it("muestra cada componente de producto de src/components", () => {
    // Fuera de /design-system a propósito: theme-sync vive en el layout raíz y code-block
    // se ve dentro de QuickstartSnippet.
    const allowed = new Set(["theme-sync", "code-block"]);
    const components = readdirSync(join(SRC, "components"))
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => basename(f, ".tsx"))
      .filter((name) => !allowed.has(name));
    const missing = components.filter(
      (name) => !designSystem.includes(`@/components/${name}"`),
    );
    expect(missing).toEqual([]);
  });
});
