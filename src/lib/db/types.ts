import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "./schema";

/**
 * La base, sin importar el driver: node-postgres en desarrollo, previews y producción;
 * PGlite en las pruebas (ADR-0032). Ningún módulo depende de cuál se usa.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
