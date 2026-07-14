/**
 * Data layer configuration.
 *
 * USE_POSTGRES=true means hooks and services should read/write via
 * /api/* routes backed by PostgreSQL (Prisma). Firebase files are
 * kept during the gradual migration and must not be deleted yet.
 */
export const USE_POSTGRES = true;
