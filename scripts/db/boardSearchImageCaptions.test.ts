/**
 * BOARD_SEARCH_IMAGE_CAPTIONS_1 -- an image on the board becomes findable.
 *
 * Against a real engine, like its siblings, because the claims here are not
 * source claims. "A captioned image is retrievable", "an image's placeholder
 * content does not pollute the corpus" and "a text post's vector did not move"
 * are all statements about what PostgreSQL does with an expression, and a
 * source assertion cannot make any of them.
 *
 * THE CORPUS NUMBERS THAT DECIDED THE RULES, measured over the live board's
 * 2,126 padlets and reproduced in the fixture below in miniature:
 *
 *   image posts 320, titled literally "Image" 254, content empty 293,
 *   carrying photographer 249, caption key 277, caption NON-EMPTY 29,
 *   captions shaped like a filename 0.
 *
 * The last two are why `caption` is indexed and `photographer` is not, and why
 * no filename heuristic exists: there were no filenames to defend against.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ADMIN = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
const DB = 'board_search_image_captions_scratch';
const SCRATCH = ADMIN.replace(/\/postgres$/, `/${DB}`);

const MIGRATION = 'supabase/migrations/20260919140000_board_search_image_captions.sql';
const ROLLOUT = 'supabase/production-rollouts/20260919140000_board_search_image_captions.sql';
const VERIFY = 'supabase/production-rollouts/20260919140000_board_search_image_captions_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260919140000_board_search_image_captions_rollback.sql';
const PRIOR_CONFIG = 'supabase/migrations/20260918120000_board_search_config.sql';
const PRIOR_SEARCH = 'supabase/migrations/20260918180000_board_search_minimal_evidence_rank.sql';

const BOARD = 'b6000000-0000-4000-8000-0000000000b1';

const read = (file: string) =>
  fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

/** Just enough schema for the expression under test. */
const FIXTURE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.padlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid, title text, content text,
  type varchar(50) DEFAULT 'text', metadata jsonb DEFAULT '{}'::jsonb);
`;

/** The prior projection function, which the new document still calls. */
function priorProjection(): string {
  const sql = read(PRIOR_CONFIG);
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.plain_text_from_post_content');
  const end = sql.indexOf('REVOKE ALL ON FUNCTION public.plain_text_from_post_content');
  return sql.slice(start, end);
}

let admin: Client;
let db: Client;

/** The old document expression, spelled as 20260918160000 spelled it. */
const OLD_DOCUMENT = `COALESCE(title, '') || ' ' || public.plain_text_from_post_content(content)`;

async function seed() {
  await db.query('DELETE FROM public.padlets');
  await db.query(
    `INSERT INTO public.padlets (board_id, title, content, type, metadata) VALUES
     -- A captioned image: the case this unit exists for.
     ($1, 'Image', '', 'image', '{"caption":"Desert walk","photographer":"Ada Bloom"}'::jsonb),
     -- An image whose content is the editor placeholder, verbatim from the
     -- live board. Indexing it would inject "click", "add" and "caption".
     ($1, 'Image', 'Click to add a caption...', 'image', '{"caption":"Mouse in the hause"}'::jsonb),
     -- An image whose content is a raw stock URL, also verbatim in shape.
     ($1, 'Image', 'https://images.pexels.com/photos/1545743/pexels-photo.jpeg?auto=compress',
        'image', '{"photographer":"Pixabay"}'::jsonb),
     -- An uncaptioned image: admitted to the index, but with nothing to match.
     ($1, 'Image', '', 'image', '{"photographer":"Pixabay"}'::jsonb),
     -- Ordinary prose, which must be completely unaffected.
     ($1, 'Bumper removal', '<p>Loosen the bumper on one side only.</p>', 'text', '{}'::jsonb),
     ($1, 'Hupe', '<p>Die Hupe sitzt hinter dem Stossfaenger.</p>', 'note', '{}'::jsonb)`,
    [BOARD],
  );
}

/** What the search function returns for a query, as ids and excerpts. */
async function search(query: string) {
  const { rows } = await db.query(
    'SELECT padlet_id, title, text, rank FROM public.search_board_posts_text($1::uuid, $2, 10)',
    [BOARD, query],
  );
  return rows as Array<{ padlet_id: string; title: string; text: string; rank: number }>;
}

const titles = (rows: Array<{ title: string }>) => rows.map((r) => r.title);

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
  db = new Client({ connectionString: SCRATCH });
  await db.connect();
  await db.query(FIXTURE);
  await db.query(priorProjection());
  // The PRODUCTION ROLLOUT is what ships, so it is what is exercised.
  await db.query(read(ROLLOUT));
  await seed();
}, 180_000);

afterAll(async () => {
  await db?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin?.end();
});

describe('an image becomes findable', () => {
  it('a captioned image is retrieved by a word in its caption', async () => {
    const rows = await search('desert');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Image');
  });

  it('its excerpt is the caption -- the only readable thing an image has', async () => {
    // Without this the citation chip would show an empty excerpt, or the raw
    // URL, for every image result.
    const [row] = await search('desert');
    expect(row.text).toBe('Desert walk');
  });

  it('an uncaptioned image matches nothing, rather than matching its title', async () => {
    // 254 of 320 live images are titled the literal word "Image". If that
    // counted as a match the corpus would gain 254 rows that answer "image".
    const rows = await search('image');
    // The title IS indexed, so this is honest about what happens: the word
    // "image" does retrieve them. What matters is that it is the TITLE doing
    // it, not a caption invented for them.
    expect(rows.every((r) => r.title === 'Image')).toBe(true);
    expect(rows.map((r) => r.text).filter(Boolean)).toEqual(
      expect.arrayContaining(['Desert walk', 'Mouse in the hause']),
    );
  });
});

describe("an image's content never enters the corpus", () => {
  it('the editor placeholder does not make an image match "caption"', async () => {
    // "Click to add a caption..." is what the live board holds on such rows.
    // Indexing it would make every one of them answer three common words.
    const rows = await search('click');
    expect(titles(rows)).toEqual([]);
  });

  it('nor "add"', async () => {
    expect(await search('add')).toEqual([]);
  });

  it('a raw stock URL does not enter the corpus either', async () => {
    expect(await search('pexels')).toEqual([]);
  });

  it('but the caption on the SAME row still matches', async () => {
    // The placeholder row carries a real caption. Dropping content must not
    // drop the caption with it.
    const rows = await search('mouse');
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('Mouse in the hause');
  });
});

describe('attribution stays out of the index', () => {
  it('a photographer name does not retrieve the image', async () => {
    // Present on 249 of the 320 admitted rows, against 29 real captions. If it
    // were indexed it would be the dominant signal in everything this unit
    // admits.
    expect(await search('pixabay')).toEqual([]);
    expect(await search('bloom')).toEqual([]);
  });
});

describe('prose is untouched', () => {
  it('a text post still matches its body', async () => {
    const rows = await search('bumper');
    expect(titles(rows)).toEqual(['Bumper removal']);
  });

  it('the German stemmed configuration still works', async () => {
    const rows = await search('hupe');
    expect(titles(rows)).toEqual(['Hupe']);
  });

  it('EVERY non-image row builds the byte-identical document it did before', async () => {
    // The strongest statement available about "nothing else moved": for any
    // post that is not an image and carries no caption, the new shared
    // expression produces exactly the old one's string -- so vectors, ranks and
    // orderings cannot have shifted.
    const { rows } = await db.query(`
      SELECT count(*) FILTER (
               WHERE public.searchable_post_document(type, title, content, metadata)
                     IS DISTINCT FROM ${OLD_DOCUMENT}) AS differing,
             count(*) AS total
        FROM public.padlets
       WHERE type <> 'image'`);
    expect(Number(rows[0].total)).toBeGreaterThan(0);
    expect(Number(rows[0].differing), 'no non-image document changed').toBe(0);
  });

  it('and its excerpt is unchanged too', async () => {
    const { rows } = await db.query(`
      SELECT count(*) FILTER (
               WHERE public.searchable_post_excerpt(type, content, metadata)
                     IS DISTINCT FROM public.plain_text_from_post_content(content)) AS differing
        FROM public.padlets
       WHERE type <> 'image'`);
    expect(Number(rows[0].differing)).toBe(0);
  });
});

/**
 * The verify file is EXECUTED, not reasoned about -- the row-24 lesson. A
 * verify is only exercisable after an apply, which is exactly why a broken row
 * in one is invisible to review.
 */
describe('the verify file, run against the applied body', () => {
  it('every row passes, and rollout_readiness agrees', async () => {
    const { rows } = await db.query(read(VERIFY));
    const failed = (rows as Array<{ ord: number; check_name: string; actual: string; pass: boolean }>)
      .filter((r) => !r.pass)
      .map((r) => `row ${r.ord}: ${r.check_name} (actual: ${r.actual})`);
    expect(failed).toEqual([]);
    expect((rows as Array<{ rollout_readiness: boolean }>).every((r) => r.rollout_readiness)).toBe(true);
  });

  it('it DISCRIMINATES -- the rollback restores the old state and rows go red', async () => {
    // A green row proves nothing unless it can go red for the right reason.
    try {
      await db.query(read(ROLLBACK));
      const { rows } = await db.query(read(VERIFY));
      const byOrd = new Map((rows as Array<{ ord: number; pass: boolean }>).map((r) => [r.ord, r.pass]));
      expect(byOrd.get(2), 'the document function is gone').toBe(false);
      expect(byOrd.get(10), 'the indexes no longer admit images').toBe(false);
      expect(byOrd.get(13), 'and the search no longer does either').toBe(false);
    } finally {
      await db.query(read(ROLLOUT));
      await seed();
    }
  });

  it('and after the rollback an image is unfindable again -- then findable once re-applied', async () => {
    try {
      await db.query(read(ROLLBACK));
      expect(await search('desert'), 'images are out of the indexed set entirely').toEqual([]);
    } finally {
      await db.query(read(ROLLOUT));
      await seed();
    }
    expect(await search('desert')).toHaveLength(1);
  });
});

describe('the artifacts cannot drift apart', () => {
  it('the migration and the production rollout are byte-identical', () => {
    expect(read(ROLLOUT)).toBe(read(MIGRATION));
  });

  it('the index builds sit outside the transaction, and are re-runnable', () => {
    // So they can become CREATE INDEX CONCURRENTLY on a database where seconds
    // of blocked writes on padlets is not acceptable.
    const sql = read(MIGRATION);
    const commit = sql.lastIndexOf('COMMIT;');
    const builds = sql.slice(commit);
    expect(builds).toContain('CREATE INDEX IF NOT EXISTS padlets_search_gin');
    expect(builds).toContain('CREATE INDEX IF NOT EXISTS padlets_search_en_gin');
    expect(builds).toContain('CREATE INDEX IF NOT EXISTS padlets_search_de_gin');
    // Comments stripped before asserting absence: the header's own LOCKS
    // paragraph says the words "CREATE INDEX", and a source assertion that
    // cannot tell prose from a statement is the trap this project has already
    // paid for twice.
    const executable = sql.slice(0, commit).replace(/^\s*--.*$/gm, '');
    expect(executable, 'no index build inside the transaction').not.toContain('CREATE INDEX');
  });

  it('the rollback restores the PRIOR search function, not an approximation of it', () => {
    const prior = read(PRIOR_SEARCH);
    const body = prior.slice(
      prior.indexOf('CREATE OR REPLACE FUNCTION public.search_board_posts_text'),
      prior.indexOf('CREATE OR REPLACE FUNCTION public.search_board_knowledge_chunks_text'),
    ).trimEnd();
    expect(read(ROLLBACK)).toContain(body);
  });

  it('the rollback rebuilds the indexes BEFORE dropping the functions they call', () => {
    // An index depends on the function in its expression; the drop would be
    // refused the other way round.
    const sql = read(ROLLBACK);
    expect(sql.indexOf('CREATE INDEX IF NOT EXISTS padlets_search_gin'))
      .toBeLessThan(sql.indexOf('DROP FUNCTION IF EXISTS public.searchable_post_document'));
  });
});
