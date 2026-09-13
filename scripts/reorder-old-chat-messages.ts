/**
 * One-shot backfill: reorder messages in historical chat sessions so that the
 * "requirements" row appears before its sibling "results" / "BOM" rows in
 * every AI-response turn.
 *
 * Sessions saved before task #343 may have a requirements row with a HIGHER
 * primary key than its sibling results/BOM rows (because of an old race in
 * the save path), or even an AI response row whose id sits BEFORE the user
 * prompt that elicited it. Since the history loader orders strictly by
 * `id ASC`, that puts the requirements table below the results — or the AI
 * response above its own user prompt — when reopening an old chat.
 *
 * This script walks every chat session, reconstructs the conversation as
 * user-prompt-led "turns" using created_at (treating any AI rows that
 * landed before the first user prompt as race-condition victims of that
 * first prompt), and reassigns the existing primary keys within the session
 * so the messages line up in the desired display order:
 *
 *     user prompt → requirements → BOM → results → (any other AI rows)
 *
 * Idempotent: re-running it on already-correct sessions is a no-op.
 *
 * Run: npx tsx scripts/reorder-old-chat-messages.ts [--dry-run]
 */
import { pool } from '../server/db';

type Row = {
  id: number;
  session_id: number;
  is_user: boolean;
  created_at: Date;
  search_results: any;
};

type GroupKind = 'requirements' | 'bom' | 'results' | 'other';

function classify(row: Row): GroupKind {
  const sr = row.search_results || {};
  if (Array.isArray(sr.requirements) && sr.requirements.length > 0) return 'requirements';
  if (Array.isArray(sr.bomTable) && sr.bomTable.length > 0) return 'bom';
  if (
    (Array.isArray(sr.products) && sr.products.length > 0) ||
    (Array.isArray(sr.productCards) && sr.productCards.length > 0)
  ) {
    return 'results';
  }
  return 'other';
}

const ORDER: Record<GroupKind, number> = {
  requirements: 0,
  bom: 1,
  results: 2,
  other: 3,
};

/** Build the desired full-session ordering. */
function buildDesiredOrder(rows: Row[]): Row[] {
  // Sort by created_at to recover the actual chronological flow. created_at
  // is more reliable than id because the legacy bug let AI rows land with
  // ids before/around the user prompt they belong to.
  const chronological = [...rows].sort((a, b) => {
    const ta = a.created_at.getTime();
    const tb = b.created_at.getTime();
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });

  // Split into turns. A turn = one user message + every AI message that
  // follows it until the next user message. AI messages that appear
  // before the first user message are race-condition victims and belong
  // to the first turn.
  type Turn = { user: Row | null; ai: Row[] };
  const turns: Turn[] = [];
  const preFirstAi: Row[] = [];
  let cur: Turn | null = null;

  for (const r of chronological) {
    if (r.is_user) {
      if (cur) turns.push(cur);
      cur = { user: r, ai: [] };
    } else if (cur) {
      cur.ai.push(r);
    } else {
      preFirstAi.push(r);
    }
  }
  if (cur) turns.push(cur);

  if (turns.length > 0 && preFirstAi.length > 0) {
    turns[0].ai = preFirstAi.concat(turns[0].ai);
  } else if (turns.length === 0 && preFirstAi.length > 0) {
    // Orphan session with no user message at all — keep AI rows together.
    turns.push({ user: null, ai: preFirstAi });
  }

  // Within each turn: user first, then AI rows ordered by kind.
  // Stable sort ties by created_at then id to keep deterministic output.
  const desired: Row[] = [];
  for (const turn of turns) {
    if (turn.user) desired.push(turn.user);
    const sortedAi = [...turn.ai]
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const ka = ORDER[classify(a.r)];
        const kb = ORDER[classify(b.r)];
        if (ka !== kb) return ka - kb;
        const ta = a.r.created_at.getTime();
        const tb = b.r.created_at.getTime();
        if (ta !== tb) return ta - tb;
        return a.r.id - b.r.id;
      })
      .map((x) => x.r);
    desired.push(...sortedAi);
  }

  return desired;
}

function sameOrderById(currentSortedById: Row[], desired: Row[]): boolean {
  if (currentSortedById.length !== desired.length) return false;
  for (let i = 0; i < desired.length; i++) {
    if (currentSortedById[i].id !== desired[i].id) return false;
  }
  return true;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const client = await pool.connect();
  try {
    const sessionsRes = await client.query<{ id: number }>(
      'SELECT id FROM ai_chat_sessions ORDER BY id ASC',
    );
    const sessionIds = sessionsRes.rows.map((r) => r.id);
    console.log(`📚 Scanning ${sessionIds.length} chat session(s)${dryRun ? ' (dry run)' : ''}…`);

    let sessionsTouched = 0;
    let rowsRewritten = 0;

    for (const sessionId of sessionIds) {
      const msgRes = await client.query<Row>(
        `SELECT id, session_id, is_user, created_at, search_results
           FROM ai_chat_session_messages
          WHERE session_id = $1
          ORDER BY id ASC`,
        [sessionId],
      );
      const rows = msgRes.rows;
      if (rows.length < 2) continue;

      const desired = buildDesiredOrder(rows);
      const currentByIdAsc = [...rows].sort((a, b) => a.id - b.id);
      if (sameOrderById(currentByIdAsc, desired)) continue;

      // Reuse the existing primary keys, in ascending order, and reassign
      // them to the desired sequence. Every other session's ids are
      // untouched, and there are no incoming foreign keys to this table
      // (verified in shared/schema.ts).
      const idsAsc = rows.map((r) => r.id).sort((a, b) => a - b);
      const plans: { oldId: number; newId: number }[] = [];
      for (let i = 0; i < desired.length; i++) {
        const oldId = desired[i].id;
        const newId = idsAsc[i];
        if (oldId !== newId) plans.push({ oldId, newId });
      }
      if (plans.length === 0) continue;

      sessionsTouched++;
      rowsRewritten += plans.length;

      // Remap the per-session compaction bookmark
      // (ai_chat_sessions.summarized_until_message_id) so that the same
      // *logical* messages remain classified as "already summarized" after
      // the id permutation. Compaction reads
      // `WHERE id > bookmark`, so an unmapped bookmark would either re-feed
      // already-summarized rows back into context or wrongly skip new ones.
      const sessionRowRes = await client.query<{ summarized_until_message_id: number | null }>(
        'SELECT summarized_until_message_id FROM ai_chat_sessions WHERE id = $1',
        [sessionId],
      );
      const oldBookmark = sessionRowRes.rows[0]?.summarized_until_message_id ?? null;

      let newBookmark: number | null = oldBookmark;
      if (oldBookmark != null && oldBookmark > 0) {
        // Build oldId -> newId for every row in the session.
        const idMap = new Map<number, number>();
        for (let i = 0; i < desired.length; i++) {
          idMap.set(desired[i].id, idsAsc[i]);
        }
        // The "summarized" set is the rows whose OLD id is <= oldBookmark.
        // Remap each to its new id; the new bookmark is the max of those —
        // guaranteeing every originally-summarized row still satisfies
        // `id <= newBookmark`. (Any non-summarized rows that happen to land
        // <= newBookmark in the new order will be conservatively treated as
        // summarized; they'd otherwise be re-fed into the LLM context.)
        let maxMappedSummarized = 0;
        for (const r of rows) {
          if (r.id <= oldBookmark) {
            const mapped = idMap.get(r.id) ?? r.id;
            if (mapped > maxMappedSummarized) maxMappedSummarized = mapped;
          }
        }
        if (maxMappedSummarized > 0) newBookmark = maxMappedSummarized;
      }

      const bookmarkChanged = newBookmark !== oldBookmark;

      if (dryRun) {
        const bm = bookmarkChanged ? ` [bookmark ${oldBookmark}→${newBookmark}]` : '';
        console.log(
          `  • session ${sessionId}: would rewrite ${plans.length} row id(s) ` +
            `(${plans.map((p) => `${p.oldId}→${p.newId}`).join(', ')})${bm}`,
        );
        continue;
      }

      // Apply the swap inside a transaction, using a temporary negative-id
      // staging step so we don't collide with existing primary keys.
      await client.query('BEGIN');
      try {
        for (const { oldId } of plans) {
          await client.query(
            'UPDATE ai_chat_session_messages SET id = -id WHERE id = $1',
            [oldId],
          );
        }
        for (const { oldId, newId } of plans) {
          await client.query(
            'UPDATE ai_chat_session_messages SET id = $1 WHERE id = $2',
            [newId, -oldId],
          );
        }
        if (bookmarkChanged) {
          await client.query(
            'UPDATE ai_chat_sessions SET summarized_until_message_id = $1 WHERE id = $2',
            [newBookmark, sessionId],
          );
        }
        await client.query('COMMIT');
        const bm = bookmarkChanged ? ` (bookmark ${oldBookmark}→${newBookmark})` : '';
        console.log(`  ✓ session ${sessionId}: rewrote ${plans.length} row id(s)${bm}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ session ${sessionId}: rollback —`, err);
      }
    }

    console.log(
      `\nDone. sessions_touched=${sessionsTouched} rows_rewritten=${rowsRewritten}`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
