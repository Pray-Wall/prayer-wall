-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Milestone 5: automatic moderation and the crisis flow.

-- Marked as a crisis by the classifier or by a moderator. Kept after the decision, so the
-- private page can show the support panel and the right words.
ALTER TABLE requests ADD COLUMN crisis INTEGER NOT NULL DEFAULT 0;

-- mod_log gains the 'mark_crisis' action and the classifier's result at the time of the decision,
-- so shadow results can be compared with moderators' decisions after the request is gone.
CREATE TABLE mod_log_new (
  id         INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('publish','remove','restore','escalate','mark_crisis')),
  moderator  TEXT NOT NULL,
  note       TEXT,
  shadow     TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO mod_log_new (id, request_id, action, moderator, note, created_at)
  SELECT id, request_id, action, moderator, note, created_at FROM mod_log;
DROP TABLE mod_log;
ALTER TABLE mod_log_new RENAME TO mod_log;
CREATE INDEX idx_mod_log_time ON mod_log (created_at);

-- Operating events: breakers tripping, mode changes, self-test results. No request text.
CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL,
  actor      TEXT NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_time ON events (created_at);
