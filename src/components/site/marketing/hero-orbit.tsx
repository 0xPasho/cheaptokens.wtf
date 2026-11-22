"use client";

/* eslint-disable @next/next/no-img-element -- Small local SVG brand marks. */
import { useEffect, useRef } from "react";

type Tile = {
  /** Uno o dos archivos de /brand/logos: el segundo es la variante oscura. */
  logo: string | [light: string, dark: string];
  monochrome?: boolean;
  side: "left" | "right";
  /** Distancia al borde (x) y desde arriba (y), en % del hero. */
  x: number;
  y: number;
  size: number;
  rotate: number;
  /** Cuánto sigue al cursor: los grandes parecen más cerca y se mueven más. */
  depth: number;
};

const TILES: Tile[] = [
  { logo: "claude-color", side: "left", x: 4, y: 26, size: 84, rotate: -7, depth: 1 },
  { logo: ["kimi-color", "kimi-dark"], side: "left", x: 16, y: 12, size: 56, rotate: 6, depth: 0.5 },
  { logo: "deepseek-color", side: "left", x: 13, y: 48, size: 68, rotate: 5, depth: 0.75 },
  { logo: "qwen-color", side: "left", x: 3, y: 70, size: 64, rotate: -4, depth: 0.6 },
  { logo: "openai", monochrome: true, side: "right", x: 4, y: 28, size: 84, rotate: 6, depth: 1 },
  { logo: "gemini-color", side: "right", x: 16, y: 11, size: 56, rotate: -6, depth: 0.5 },
  { logo: "xai", monochrome: true, side: "right", x: 13, y: 50, size: 68, rotate: -5, depth: 0.75 },
  { logo: "mistral-color", side: "right", x: 3, y: 72, size: 64, rotate: 4, depth: 0.6 },
];

/**
 * Los logos de los laboratorios flotan alrededor del título del hero. Es decoración: aria-hidden y
 * sin foco. Entran escalonados, flotan despacio y se desplazan un poco hacia el cursor. Con movimiento
 * reducido quedan quietos, y en pantallas angostas no se muestran (no hay margen para ellos).
 */
export function HeroOrbit() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        node.style.setProperty("--orbit-x", String(event.clientX / innerWidth - 0.5));
        node.style.setProperty("--orbit-y", String(event.clientY / innerHeight - 0.5));
      });
    };
    addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div ref={ref} className="nr-mk-orbit" aria-hidden="true">
      {TILES.map((tile, index) => (
        <div
          key={index}
          className="nr-mk-orbit-slot"
          style={{
            [tile.side]: `${tile.x}%`,
            top: `${tile.y}%`,
            "--orbit-depth": tile.depth,
          } as React.CSSProperties}
        >
          <span
            className="nr-mk-orbit-tile"
            style={{
              width: tile.size,
              height: tile.size,
              "--orbit-rotate": `${tile.rotate}deg`,
              "--orbit-delay": `${150 + index * 70}ms`,
              "--orbit-duration": `${7 + (index % 4) * 1.3}s`,
              "--orbit-phase": `${-index * 1.7}s`,
            } as React.CSSProperties}
          >
            {typeof tile.logo === "string" ? (
              <img className={tile.monochrome ? "nr-brand-monochrome" : undefined} src={`/brand/logos/${tile.logo}.svg`} alt="" />
            ) : (
              <>
                <img className="dark:hidden" src={`/brand/logos/${tile.logo[0]}.svg`} alt="" />
                <img className="hidden dark:block" src={`/brand/logos/${tile.logo[1]}.svg`} alt="" />
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
