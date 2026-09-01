-- Rolled-up numbers for a future profile screen. A view rather than a table:
-- the volume is tiny and a stale counter is worse than a recomputed one.

CREATE OR REPLACE VIEW player_stats AS
SELECT
    mp.name,
    count(*)                                     AS matches,
    count(*) FILTER (WHERE mp.won)               AS wins,
    round(avg(m.ticks) / 20.0)                   AS avg_seconds,
    max(m.finished_at)                           AS last_played
FROM match_players mp
JOIN matches m ON m.id = mp.match_id
WHERE NOT mp.is_bot
GROUP BY mp.name;
