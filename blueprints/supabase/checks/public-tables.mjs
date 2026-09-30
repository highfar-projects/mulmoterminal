// The tables of the public schema as the Supabase checks need them, read from the database's own catalogue.
import { query } from "./supabase-cli.mjs";

const asList = (value) => (typeof value === "string" ? JSON.parse(value) : value);

/** Every table in public, with the columns of its primary key, the columns that name a user (a foreign key to auth.users
 * or a default of auth.uid()) and the columns Postgres fills itself, in the local database or the linked project. */
export function publicTables(where) {
  const rows = query(
    where,
    `select c.relname as "table",
      coalesce((select json_agg(a.attname order by a.attnum) from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = c.oid and i.indisprimary), '[]') as "key",
      coalesce((select json_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and (
        exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f' and k.confrelid = 'auth.users'::regclass and a.attnum = any(k.conkey))
        or exists (select 1 from pg_attrdef d where d.adrelid = c.oid and d.adnum = a.attnum and pg_get_expr(d.adbin, d.adrelid) like '%auth.uid()%'))), '[]') as "owners",
      coalesce((select json_agg(a.attname) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and (a.attgenerated <> '' or a.attidentity = 'a')), '[]') as "fixed"
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`,
  );
  return rows.map((row) => ({ table: row.table, key: asList(row.key), owners: asList(row.owners ?? "[]"), fixed: asList(row.fixed ?? "[]") }));
}
