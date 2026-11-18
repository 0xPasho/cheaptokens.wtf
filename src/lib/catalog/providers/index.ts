import { inferhubProvider } from "./inferhub";
import type { CatalogProvider } from "./types";

/** Los proveedores de los que sale el catálogo. El orden desempata rutas con el mismo costo. */
export const CATALOG_PROVIDERS: readonly CatalogProvider[] = [inferhubProvider];
