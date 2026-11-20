import { notFound } from "next/navigation";

/** Siempre es un 404: no hay nada que validar como navegación instantánea (Cache Components). */
export const instant = false;

/** Cualquier ruta que no existe bajo `/{idioma}` muestra el 404 del sitio, con cabecera e idioma, no el de Next. */
export default function Missing(): never {
  notFound();
}
