import { Container } from "@/components/container";

/**
 * Las páginas de estado (404 y error): el título grande de la ventana de acceso, una línea gris y las acciones
 * con los botones de la landing. Sin `"use client"`: la usan el 404 (servidor) y el límite de error (cliente).
 */
export function StatusPage({ code, title, description, inline = false, children }: {
  code: string;
  title: string;
  description: string;
  /** Dentro de un layout que ya pone márgenes (el dashboard): sin centrar ni el alto margen superior. */
  inline?: boolean;
  children: React.ReactNode;
}) {
  const content = (
    <div className={`nr-auth nr-status-page${inline ? " nr-status-inline" : ""}`}>
      <header>
        <p className="nr-mk-eyebrow">{code}</p>
        <h1 className="nr-auth-title">{title}</h1>
        <p className="nr-auth-desc">{description}</p>
      </header>
      <div className="nr-status-actions">{children}</div>
    </div>
  );
  return inline ? content : <Container className="nr-auth-page">{content}</Container>;
}
