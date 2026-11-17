-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Milestone 3: the moderator queue.
-- queued_at: when the request entered the queue (posted, or pulled back or flagged by reports).
-- escalated_by: the moderator who asked for a second opinion, if any.
ALTER TABLE requests ADD COLUMN queued_at INTEGER;
ALTER TABLE requests ADD COLUMN escalated_by TEXT;
UPDATE requests SET queued_at = created_at WHERE status = 'held';
DROP INDEX idx_queue;
-- The queue: everything held, plus published requests flagged by reports (priority 1).
CREATE INDEX idx_queue ON requests (priority DESC, queued_at) WHERE queued_at IS NOT NULL;
CREATE INDEX idx_same_day ON requests (poster_hash);
CREATE INDEX idx_mod_log_time ON mod_log (created_at);
