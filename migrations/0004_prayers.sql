-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Milestone 4: indexes for the clean-up job, which deletes these rows after 48 hours.
CREATE INDEX idx_prayers_time ON prayers (created_at);
CREATE INDEX idx_rate_limits_time ON rate_limits (window_start);
CREATE INDEX idx_reports_time ON reports (created_at);
