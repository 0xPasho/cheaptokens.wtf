/**
 * Texto del diccionario con `código` entre backticks. Los diccionarios son strings planos
 * (docs/10), y en /docs casi cada frase nombra un campo o un header: así el copy sigue en un
 * solo string por idioma y el código sale en mono. No se corta: `: keep-alive` partido en dos
 * ya no se lee como código, y el más largo cabe en un teléfono.
 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, index) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={index} className="rounded-md bg-muted px-1 py-0.5 font-mono text-sm whitespace-nowrap">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
