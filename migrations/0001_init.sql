-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Blueprint data model, including the Revision 2 and 2.1 additions.
-- No email address, account or IP address is stored anywhere. Times are Unix seconds, UTC.

CREATE TABLE requests (
  id            TEXT PRIMARY KEY,        -- 12 random base32 characters, public
  owner_hash    TEXT NOT NULL UNIQUE,    -- SHA-256 of the private link token
  kind          TEXT NOT NULL CHECK (kind IN ('self','other','event')),
  display_name  TEXT,                    -- optional, up to 30 characters
  body          TEXT NOT NULL,           -- up to 500 characters, original language
  lang          TEXT NOT NULL,           -- language code chosen by the author
  status        TEXT NOT NULL CHECK (status IN ('held','published','removed')),
  hold_reason   TEXT,                    -- why it was held, for moderators
  decided_by    TEXT,                    -- 'auto' or 'moderator'
  prayed_count  INTEGER NOT NULL DEFAULT 0,  -- the number shown on the card
  reach_count   INTEGER NOT NULL DEFAULT 0,  -- distinct visitor hashes that prayed; used for ordering
  report_count  INTEGER NOT NULL DEFAULT 0,
  priority      INTEGER NOT NULL DEFAULT 0,  -- 0 normal, 1 reported or flagged, 2 crisis
  category      TEXT,                    -- classifier category
  confidence    REAL,                    -- classifier confidence, 0 to 1
  shadow_result TEXT,                    -- classifier result recorded during review_all
  body_hash     TEXT NOT NULL,           -- keyed hash of the normalised text, for duplicates
  remove_reason TEXT,                    -- category shown to the author after a removal
  is_test       INTEGER NOT NULL DEFAULT 0,  -- seeded moderation test post; never published or counted
  answered_at   INTEGER,
  extended      INTEGER NOT NULL DEFAULT 0,
  poster_hash   TEXT NOT NULL,           -- daily visitor hash
  created_at    INTEGER NOT NULL,
  published_at  INTEGER,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX idx_wall_need ON requests (reach_count, published_at) WHERE status = 'published';
CREATE INDEX idx_wall_new  ON requests (published_at DESC)          WHERE status = 'published';
CREATE INDEX idx_expiry    ON requests (expires_at);
CREATE INDEX idx_queue     ON requests (priority DESC, created_at)  WHERE status = 'held';
CREATE INDEX idx_dupes     ON requests (body_hash, created_at);

CREATE TABLE translations (
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  lang       TEXT NOT NULL,
  body       TEXT NOT NULL,
  provider   TEXT NOT NULL,              -- which translator produced it
  created_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, lang)
);

CREATE TABLE prayers (                   -- only to stop double counting
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  who        TEXT NOT NULL,              -- daily hash of the device id, or the daily visitor hash
  vhash      TEXT NOT NULL,              -- daily visitor hash
  counted    INTEGER NOT NULL DEFAULT 1, -- 0 when a limit applied
  created_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, who)
);
CREATE INDEX idx_prayers_vhash ON prayers (request_id, vhash);

CREATE TABLE reports (
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  who        TEXT NOT NULL,              -- daily visitor hash
  device     TEXT,                       -- daily hash of the device id
  reason     TEXT NOT NULL CHECK (reason IN ('spam','money','personal','hateful','other')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, who)
);

CREATE TABLE rate_limits (
  key          TEXT NOT NULL,            -- e.g. 'post:<visitor hash>'
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE mod_log (                   -- who decided what, kept after the request is gone
  id         INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('publish','remove','restore','escalate')),
  moderator  TEXT NOT NULL,              -- from the Access sign-in
  note       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE counters (                  -- totals that survive expiry
  name  TEXT PRIMARY KEY,                -- 'requests_total', 'prayers_total'
  value INTEGER NOT NULL
);
