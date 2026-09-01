import pg from 'pg';

/**
 * The live match never touches the database. A room changes twenty times a
 * second; writing that would kill both the database and the game. One row is
 * written when a match ends, and that is the whole story.
 */
export interface MatchRecord {
  code: string;
  seed: number;
  slots: number;
  bots: number;
  winner: number;
  ticks: number;
  players: { slot: number; name: string; bot: boolean; nodes: number }[];
}

let pool: pg.Pool | null = null;

export function initDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Running without a database is a supported mode: matches simply are not
    // recorded. Solo play never needed it either.
    console.log('[db] DATABASE_URL not set - match history disabled');

    return;
  }
  pool = new pg.Pool({ connectionString: url, max: 4, idleTimeoutMillis: 30000 });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));
  console.log('[db] connected');
}

export async function recordMatch(m: MatchRecord): Promise<void> {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query<{ id: number }>(
      `INSERT INTO matches (code, seed, slots, bots, winner_slot, ticks)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [m.code, m.seed, m.slots, m.bots, m.winner, m.ticks],
    );
    const id = res.rows[0].id;
    for (const p of m.players) {
      await client.query(
        `INSERT INTO match_players (match_id, slot, name, is_bot, nodes_held, won)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, p.slot, p.name, p.bot, p.nodes, p.slot === m.winner],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // A failed write must never take the game down with it.
    console.error('[db] failed to record match', (err as Error).message);
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
