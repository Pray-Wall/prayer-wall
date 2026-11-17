-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Optional country chosen by the author on the posting form (ISO 3166-1 alpha-2).
-- Never derived from the network address. See docs/decisions.md, 17 November 2026.
ALTER TABLE requests ADD COLUMN country TEXT;
