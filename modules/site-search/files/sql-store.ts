// SPDX-License-Identifier: Apache-2.0
// SearchStore on PostgreSQL full-text search through any `query(text, params)` executor that uses $1 placeholders
// and returns { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite).
// Apply schema.sql first.
//
// - Indexing builds tsv as setweight(to_tsvector(config, field), 'A'..'D') per declared field, concatenated. Field
//   text is accent-folded (NFKD, marks removed) in JavaScript first, so café and cafe match without the unaccent
//   extension, and "<" is replaced by a private-use stand-in so markup-like text (<script>...</script>) is indexed
//   as words instead of being skipped as tags. The original text is kept in `fields`.
// - Queries are built from parsed terms only: each lexeme is quoted and escaped, prefix terms get :*, phrases use
//   <->, exclusions use !, and the whole tsquery string is one bound parameter to to_tsquery. Attribute filters
//   use jsonb containment (@>) and numeric comparisons with bound parameters. Nothing from the request is
//   concatenated into SQL; table names are validated at construction.
// - Ranking uses ts_rank_cd; highlights use ts_headline over the folded text; facets are grouped counts over the
//   filtered set; paging is a keyset on (score, id) or (attribute value, id).
import { MARK_END, MARK_START, foldText } from "./core.js";
import type { AttrFilter, FacetValue, QueryTerm, SearchSchema, SearchStore, StoreHit, StoreQuery, StoreResult } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Optional; not required by this store. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlSearchStoreOptions {
  /** Table name (default search_documents). Letters, digits and underscores only. */
  readonly table?: string;
  /** PostgreSQL text search configuration: english (stemming, stop words) or simple (no stemming). */
  readonly config: "english" | "simple";
  /** ts_headline options for fragment size. Default "MaxWords=30, MinWords=12, ShortWord=2". */
  readonly headline?: { readonly maxWords?: number; readonly minWords?: number };
}

/** Quotes one lexeme for to_tsquery: wraps it in single quotes, doubling quotes and escaping backslashes. */
export function quoteLexeme(word: string): string {
  return `'${word.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/** Builds the tsquery text for parsed terms (bound as one parameter). Returns "" when there are no terms. */
export function buildTsQuery(terms: readonly QueryTerm[]): string {
  return terms.map((term) => {
    const body = term.kind === "phrase"
      ? `(${term.words.map(quoteLexeme).join(" <-> ")})`
      : quoteLexeme(term.word) + (term.prefix ? ":*" : "");
    return term.exclude ? `!${body}` : body;
  }).join(" & ");
}

const WEIGHT = /^[ABCD]$/;
/** Stand-in for "<" so the PostgreSQL parser never reads markup as tag tokens (it skips tags and <script> bodies). */
const LT = "\uE000";

/** Accent-folded text with "<" replaced by LT, as stored in tsv and passed to ts_headline. */
function prepare(text: string): string {
  return foldText(text).replace(/\uE000/g, " ").replace(/</g, LT);
}

export function createSqlSearchStore(db: SqlExecutor, options: SqlSearchStoreOptions): SearchStore {
  const table = options.table ?? "search_documents";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) throw new RangeError("Invalid table name");
  if (options.config !== "english" && options.config !== "simple") throw new RangeError("config must be english or simple");
  const config = options.config;
  const maxWords = options.headline?.maxWords ?? 30;
  const minWords = options.headline?.minWords ?? 12;
  if (!Number.isInteger(maxWords) || !Number.isInteger(minWords) || minWords < 1 || maxWords <= minWords || maxWords > 200) {
    throw new RangeError("headline needs whole numbers with 1 <= minWords < maxWords <= 200");
  }
  const headlineOptions = `StartSel=${MARK_START}, StopSel=${MARK_END}, MaxWords=${maxWords}, MinWords=${minWords}, ShortWord=2`;

  return {
    async upsert(document, schema: SearchSchema) {
      const params: unknown[] = [document.tenantId, document.id, config];
      const pieces = Object.entries(schema.fields).map(([name, weight]) => {
        if (!WEIGHT.test(weight)) throw new RangeError("Invalid field weight");
        params.push(prepare(document.fields[name] ?? ""));
        return `setweight(to_tsvector($3::regconfig, $${params.length}::text), '${weight}')`;
      });
      params.push(JSON.stringify(document.attrs), JSON.stringify(document.fields), [...document.visibility], document.updatedAt);
      const n = params.length;
      // One statement: a stale write (older updated_at) leaves the newer row in place.
      await db.query(
        `INSERT INTO ${table} (tenant_id, id, tsv, attrs, fields, visibility, updated_at)
         VALUES ($1, $2, ${pieces.join(" || ")}, $${n - 3}::jsonb, $${n - 2}::jsonb, $${n - 1}::text[], $${n})
         ON CONFLICT (tenant_id, id) DO UPDATE SET tsv = EXCLUDED.tsv, attrs = EXCLUDED.attrs, fields = EXCLUDED.fields,
           visibility = EXCLUDED.visibility, updated_at = EXCLUDED.updated_at
         WHERE ${table}.updated_at <= EXCLUDED.updated_at`,
        params,
      );
    },

    async remove(tenantId, id) {
      const { rows } = await db.query(`DELETE FROM ${table} WHERE tenant_id = $1 AND id = $2 RETURNING id`, [tenantId, id]);
      return rows.length === 1;
    },

    async search(query: StoreQuery): Promise<StoreResult> {
      const params: unknown[] = [];
      const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
      const tsquery = buildTsQuery(query.terms);
      const hasText = tsquery !== "";
      // Bind the configuration only when used: PostgreSQL rejects parameters it cannot type.
      const q = hasText ? `to_tsquery(${bind(config)}::regconfig, ${bind(tsquery)})` : "NULL::tsquery";
      const where = [
        `d.tenant_id = ${bind(query.tenantId)}`,
        `(cardinality(d.visibility) = 0 OR d.visibility && ${bind([...query.principals])}::text[])`,
      ];
      if (hasText) where.push(`d.tsv @@ ${q}`);
      for (const filter of query.filters) where.push(filterSql(filter, bind));
      const base = `FROM ${table} d WHERE ${where.join(" AND ")}`;
      const baseParams = [...params];

      const total = Number((await db.query(`SELECT count(*)::int AS n ${base}`, baseParams)).rows[0]?.n ?? 0);

      const facets: Record<string, FacetValue[]> = {};
      for (const facet of query.facets) {
        const facetParams = [...baseParams];
        const key = `$${facetParams.push(facet)}`;
        const limit = `$${facetParams.push(query.facetLimit)}`;
        const type = query.schema.filters[facet];
        const sql = type === "boolean"
          ? `SELECT d.attrs->>${key}::text AS value, count(*)::int AS n ${base} AND d.attrs ? ${key}::text
             GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${limit}`
          : `SELECT f.value, count(*)::int AS n FROM ${table} d
               CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(d.attrs->${key}::text, '[]'::jsonb)) AS f(value)
             WHERE ${where.join(" AND ")} GROUP BY f.value ORDER BY 2 DESC, f.value COLLATE "C" LIMIT ${limit}`;
        const { rows } = await db.query(sql, facetParams);
        facets[facet] = rows.map((row) => ({
          value: type === "boolean" ? row.value === "true" : String(row.value),
          count: Number(row.n),
        }));
      }

      const score = hasText ? `ts_rank_cd(d.tsv, ${q})` : "0::real";
      const sort = query.sort;
      const sortValue = sort.by === "relevance" ? "score" : numeric(sort.attr, bind);
      let after = "TRUE";
      if (query.after) {
        const id = bind(query.after.id);
        if (sort.by === "relevance") {
          const value = bind(query.after.value);
          after = `(sv < ${value}::real OR (sv = ${value}::real AND id COLLATE "C" > ${id}))`;
        } else if (query.after.value === null) {
          after = `(sv IS NULL AND id COLLATE "C" > ${id})`;
        } else {
          const value = bind(query.after.value);
          after = `(sv ${sort.descending ? "<" : ">"} ${value}::float8 OR (sv = ${value}::float8 AND id COLLATE "C" > ${id}) OR sv IS NULL)`;
        }
      }
      const order = sort.by === "relevance" ? "sv DESC, id COLLATE \"C\"" : `sv ${sort.descending ? "DESC" : "ASC"} NULLS LAST, id COLLATE "C"`;
      const { rows } = await db.query(
        `WITH matched AS (
           SELECT d.id, d.fields, s.score, ${sort.by === "relevance" ? "s.score" : sortValue} AS sv
           FROM ${table} d CROSS JOIN LATERAL (SELECT ${score} AS score) s
           WHERE ${where.join(" AND ")}
         )
         SELECT id, fields, score, sv FROM matched WHERE ${after} ORDER BY ${order} LIMIT ${bind(query.limit)}`,
        params,
      );

      // Highlights: one ts_headline call over the folded text of every hit field.
      const positive = query.terms.filter((term) => !term.exclude);
      const highlightTexts: string[] = [];
      const slots: { hit: number; field: string }[] = [];
      const parsed = rows.map((row) => (typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields) as Record<string, string>);
      if (positive.length > 0) {
        parsed.forEach((fields, hit) => {
          for (const field of Object.keys(query.schema.fields)) {
            const text = fields[field];
            if (typeof text === "string" && text !== "") { slots.push({ hit, field }); highlightTexts.push(prepare(text)); }
          }
        });
      }
      const highlights: Record<string, string>[] = rows.map(() => ({}));
      if (highlightTexts.length > 0) {
        const { rows: lines } = await db.query(
          `SELECT u.i::int AS i, ts_headline($1::regconfig, u.t, to_tsquery($1::regconfig, $2), $3) AS h
           FROM unnest($4::text[]) WITH ORDINALITY AS u(t, i)`,
          [config, buildTsQuery(positive), headlineOptions, highlightTexts],
        );
        for (const line of lines) {
          const slot = slots[Number(line.i) - 1];
          const text = String(line.h ?? "").replace(/\uE000/g, "<");
          if (slot && text.includes(MARK_START)) highlights[slot.hit]![slot.field] = text;
        }
      }

      const hits: StoreHit[] = rows.map((row, i) => ({
        id: String(row.id),
        score: Number(row.score),
        sortValue: row.sv == null ? null : Number(row.sv),
        highlights: highlights[i]!,
      }));
      return { hits, total, facets };
    },
  };
}

function filterSql(filter: AttrFilter, bind: (value: unknown) => string): string {
  if (filter.kind === "keyword") {
    return `(${filter.values.map((value) => `d.attrs @> ${bind(JSON.stringify({ [filter.attr]: [value] }))}::jsonb`).join(" OR ")})`;
  }
  if (filter.kind === "boolean") return `d.attrs @> ${bind(JSON.stringify({ [filter.attr]: filter.value }))}::jsonb`;
  const value = numeric(filter.attr, bind);
  const parts: string[] = [];
  if (filter.gte !== undefined) parts.push(`${value} >= ${bind(filter.gte)}::float8`);
  if (filter.gt !== undefined) parts.push(`${value} > ${bind(filter.gt)}::float8`);
  if (filter.lte !== undefined) parts.push(`${value} <= ${bind(filter.lte)}::float8`);
  if (filter.lt !== undefined) parts.push(`${value} < ${bind(filter.lt)}::float8`);
  return `(${parts.join(" AND ")})`;
}

/** The attribute as float8, or NULL when it is missing or not a JSON number (never a cast error). */
function numeric(attr: string, bind: (value: unknown) => string): string {
  const key = bind(attr);
  return `(CASE WHEN jsonb_typeof(d.attrs->${key}::text) = 'number' THEN (d.attrs->>${key}::text)::float8 END)`;
}
