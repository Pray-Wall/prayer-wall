// SPDX-License-Identifier: AGPL-3.0-or-later
// The moderator queue. It is in English only and is not linked from the public site.
import type { FC } from "hono/jsx";
import type { QueueItem, RemovedItem } from "../lib/database";
import { REMOVE_REASONS, ageLevel, classOf } from "../lib/moderation";

const WHY: Record<string, string> = {
  review_all: "review_all mode: every request is reviewed",
  soft_limit: "Held by a soft posting limit",
  duplicate: "A duplicate: the same text was posted before",
  bot_check_unavailable: "The bot check could not be reached",
  bot_check_misconfigured: "The bot check is misconfigured (see the runbook)",
  reported: "Reported by visitors",
  classifier: "Held by the classifier",
  classifier_failed: "The classifier failed or was unavailable",
  crisis: "Crisis: decide within 2 hours. Publish as written unless it describes a method, a plan with a time or place, or identifies another person at risk",
  unattended: "Unattended mode: the author was told it could not be shown automatically",
};
const KIND = { self: "For the author", other: "For someone else", event: "For an event or group" } as const;
const REPORT_LABEL = { spam: "spam", money: "money", personal: "personal details", hateful: "hateful or harmful", other: "other" } as const;
const REMOVE_LABEL: Record<(typeof REMOVE_REASONS)[number], string> = {
  contact: "Contact details or a link",
  money: "Asks for money, gifts or business",
  identifies: "Identifies another person",
  preaching: "Preaching, arguing, or against others",
  harm: "A prayer for harm",
  unsuitable: "Not suitable for all ages",
  not_prayer: "Not a prayer",
  not_english: "Not in English",
  spam: "Spam or a repeat",
  other: "Other",
};

export function waited(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
}

const Decide: FC<{ id: string; action: string; label: string; cls: string; skip: string; children?: unknown }> = ({ id, action, label, cls, skip, children }) => (
  <form method="post" action={`/mod/r/${id}/${action}`}>
    <input type="hidden" name="skip" value={skip} />
    {children}
    <button class={cls} type="submit">
      {label}
    </button>
  </form>
);

const Item: FC<{ item: QueueItem; now: number; skip: string[] }> = ({ item, now, skip }) => {
  const level = ageLevel(item, now);
  const cls = classOf(item);
  const skipList = skip.join(",");
  // Most frequent reason first.
  const reports = (Object.entries(item.reports) as [keyof typeof REPORT_LABEL, number][]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return (
    <li>
      <article class="card">
        <p class="who">
          {cls === "crisis" ? <span class="tag red">Crisis</span> : null}
          {cls === "reported" ? <span class="tag">Reported</span> : null}
          {item.isTest ? <span class="tag">Test post: cannot be published</span> : null}
          {item.escalatedBy ? <span class="tag amber">Second opinion asked by {item.escalatedBy}</span> : null}{" "}
          {KIND[item.kind]}
          {item.displayName ? (
            <>
              {" · "}
              <bdi>{item.displayName}</bdi>
            </>
          ) : null}
          {item.country ? ` · ${item.country}` : null}
          {` · written in: ${item.lang}`}
        </p>
        <p class="text" lang={item.lang} dir="auto">
          {item.body}
        </p>
        <dl class="facts">
          <dt>Classifier</dt>
          <dd>{item.category ? `${item.category}, ${Math.round((item.confidence ?? 0) * 100)}%` : "Not run, or it failed"}</dd>
          <dt>Why it is here</dt>
          <dd>
            {WHY[item.holdReason ?? ""] ?? "Held"}
            {item.status === "published" ? ". Still on the wall: reports flagged it without hiding it" : ""}
          </dd>
          <dt>Reports</dt>
          <dd>{reports.length ? reports.map(([reason, n]) => `${REPORT_LABEL[reason]}: ${n}`).join(", ") : "None"}</dd>
          <dt>Waiting</dt>
          <dd>
            <span class={level === "ok" ? "tag" : `tag ${level}`}>
              {waited(now - item.queuedAt)}
              {level === "amber" ? ", past its target" : level === "red" ? ", past its hard limit" : ""}
            </span>
          </dd>
          <dt>Same visitor today</dt>
          <dd>{item.sameDayOthers} other request(s) held or removed</dd>
        </dl>
        <div class="buttons">
          {item.isTest ? null : <Decide id={item.id} action="publish" label={item.status === "published" ? "Keep on the wall" : "Publish"} cls="btn-primary" skip={skipList} />}
          <Decide id={item.id} action="remove" label="Remove" cls="btn danger" skip={skipList}>
            <label class="sr" for={`reason-${item.id}`}>
              Reason for removing
            </label>
            <select id={`reason-${item.id}`} name="reason" required>
              <option value="">Reason…</option>
              {REMOVE_REASONS.map((r) => (
                <option value={r}>{REMOVE_LABEL[r]}</option>
              ))}
            </select>
          </Decide>
          <Decide id={item.id} action="escalate" label="Ask for a second opinion" cls="btn" skip={skipList} />
          {item.crisis ? null : <Decide id={item.id} action="mark_crisis" label="Mark as crisis" cls="btn" skip={skipList} />}
          <a href={`/mod?skip=${[...skip, item.id].join(",")}`}>Skip</a>
        </div>
      </article>
    </li>
  );
};

type QueueProps = {
  moderator: string; items: QueueItem[]; waiting: number; now: number; skip: string[]; unattended: boolean; breaker: boolean;
  alertSent?: boolean;
  /** The configured mode and whether a breaker has switched `auto` to `review_all`. */
  mode: string; overridden: boolean; strict: boolean;
};

export const ModQueue: FC<QueueProps> = ({ moderator, items, waiting, now, skip, unattended, breaker, alertSent, mode, overridden, strict }) => (
  <>
    <h1>Moderation queue</h1>
    <p class="who">
      Signed in as {moderator} · {waiting} waiting · <a href="/mod?view=removed">Removed requests</a>
      {skip.length ? (
        <>
          {" · "}
          <a href="/mod">Show the {skip.length} skipped</a>
        </>
      ) : null}
    </p>
    <p class="who">
      Mode: {overridden ? "review_all (set by the posting breaker)" : mode}
      {strict ? " · stricter threshold in force (weekly self-test)" : ""} · <a href="/mod?view=shadow">Classifier results</a>
    </p>
    {overridden ? (
      <form method="post" action="/mod/mode/restore" class="notice buttons">
        <span>A burst of posts switched the site to review_all. Return it to auto when it is safe.</span>
        <button class="btn" type="submit">
          Return to auto
        </button>
      </form>
    ) : null}
    {strict ? (
      <form method="post" action="/mod/strict/clear" class="notice buttons">
        <span>The weekly self-test found a rule-breaking example the classifier would publish. Clear this once the model or threshold is fixed.</span>
        <button class="btn" type="submit">
          Clear the stricter threshold
        </button>
      </form>
    ) : null}
    {unattended ? (
      <p class="notice error">
        Nobody has moderated for 48 hours{mode === "auto" && !overridden ? ", so only clearly fine requests are published" : ", so posting is paused"}. Any decision here ends it.
      </p>
    ) : null}
    {breaker ? <p class="notice">Unusual reporting was detected. For now, reports flag requests here without hiding them from the wall.</p> : null}
    <p class="notice">
      Judge conduct against the seven rules, never belief. Never contact or reply to an author. Skip anything you find hard; someone else will take it.
    </p>
    {alertSent ? <p class="notice" role="status">A test alert was sent. If it does not arrive, see "Alerts" in the runbook.</p> : null}
    {items.length === 0 ? (
      <p class="notice">Nothing is waiting.</p>
    ) : (
      <ul class="wall">
        {items.map((item) => (
          <Item item={item} now={now} skip={skip} />
        ))}
      </ul>
    )}
    <ModFooter />
  </>
);

export const ModFooter: FC = () => (
  <form method="post" action="/mod/test-alert" class="buttons">
    <button class="btn" type="submit">
      Send a test alert
    </button>
  </form>
);

/** Shadow running: what the classifier said beside what moderators decided. */
export const ModShadow: FC<{ rows: { shadow: string | null; action: string; n: number }[]; days: number }> = ({ rows, days }) => {
  const by = new Map<string, { publish: number; remove: number }>();
  for (const r of rows) {
    const label = r.shadow ? r.shadow.split(":").filter((p) => !/^[0-9.]+$/.test(p)).join(", ") : "not run";
    const e = by.get(label) ?? { publish: 0, remove: 0 };
    if (r.action === "publish") e.publish += r.n;
    else e.remove += r.n;
    by.set(label, e);
  }
  return (
    <>
      <h1>Classifier results</h1>
      <p class="who">
        <a href="/mod">Back to the queue</a>
      </p>
      <p>What the classifier said about each request, beside what a moderator then decided, over the last {days} days.</p>
      {by.size === 0 ? (
        <p class="notice">No decisions yet.</p>
      ) : (
        <table class="facts-table">
          <thead>
            <tr>
              <th scope="col">Classifier said</th>
              <th scope="col">Published</th>
              <th scope="col">Removed</th>
            </tr>
          </thead>
          <tbody>
            {[...by.entries()].map(([label, e]) => (
              <tr>
                <td>{label}</td>
                <td>{e.publish}</td>
                <td>{e.remove}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
};

export const ModRemoved: FC<{ items: RemovedItem[] }> = ({ items }) => (
  <>
    <h1>Removed requests</h1>
    <p class="who">
      <a href="/mod">Back to the queue</a>
    </p>
    {items.length === 0 ? (
      <p class="notice">Nothing has been removed.</p>
    ) : (
      <ul class="wall">
        {items.map((r) => (
          <li>
            <article class="card">
              <p class="who">Removed: {REMOVE_LABEL[(r.removeReason ?? "other") as keyof typeof REMOVE_LABEL] ?? "Other"}</p>
              <p class="text" lang={r.lang} dir="auto">
                {r.body}
              </p>
              <div class="buttons">
                <Decide id={r.id} action="restore" label="Restore to the wall" cls="btn" skip="" />
              </div>
            </article>
          </li>
        ))}
      </ul>
    )}
  </>
);
