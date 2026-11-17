// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The app talks to storage only through this interface, so a self-hoster
 * can swap the Cloudflare adapter for another one (blueprint: "Rules for the code").
 * It grows one method at a time as milestones need them.
 */
export interface Database {
  /** Resolves true when the database answers a trivial query. */
  ping(): Promise<boolean>;
}
