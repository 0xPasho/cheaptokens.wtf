import { cn } from "@/lib/utils";

/**
 * Texto del diccionario con `código` entre backticks. Los diccionarios son strings planos
 * (docs/10), y en /docs casi cada frase nombra un campo o un header: así el copy sigue en un
 * solo string por idioma y el código sale en mono. No se corta: `: keep-alive` partido en dos ya no
 * se lee como código, y un guion o una barra al final de la línea parten un header o una ruta. Solo
 * uno más largo que un teléfono angosto se parte, y solo cuando no cabe en su línea:
 * `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` desbordaba /docs.
 */
const MAX_UNBROKEN_CHARS = 30;

export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, index) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code
            key={index}
            className={cn(
              "rounded-md bg-muted px-1 py-0.5 font-mono text-sm",
              part.length - 2 > MAX_UNBROKEN_CHARS ? "break-words" : "whitespace-nowrap",
            )}
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
