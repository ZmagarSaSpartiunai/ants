-- Match history only. The live match never touches this database: a room
-- changes twenty times a second and belongs in memory.

CREATE TABLE IF NOT EXISTS matches (
    id          BIGSERIAL PRIMARY KEY,
    code        TEXT        NOT NULL,
    seed        BIGINT      NOT NULL,
    slots       SMALLINT    NOT NULL,
    bots        SMALLINT    NOT NULL,
    winner_slot SMALLINT    NOT NULL,
    ticks       INTEGER     NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_players (
    id         BIGSERIAL PRIMARY KEY,
    match_id   BIGINT    NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    slot       SMALLINT  NOT NULL,
    name       TEXT      NOT NULL,
    is_bot     BOOLEAN   NOT NULL,
    nodes_held SMALLINT  NOT NULL,
    won        BOOLEAN   NOT NULL
);

CREATE INDEX IF NOT EXISTS match_players_match_idx ON match_players (match_id);
CREATE INDEX IF NOT EXISTS matches_finished_idx ON matches (finished_at DESC);
