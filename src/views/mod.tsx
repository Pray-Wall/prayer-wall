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
          <dt>English translation</dt>
          <dd>Translation unavailable (machine translation arrives in milestone 6)</dd>
          <dt>Classifier</dt>
          <dd>{item.category ? `${item.category}, ${Math.round((item.confidence ?? 0) * 100)}%` : "Not run (the classifier arrives in milestone 5)"}</dd>
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
          <a href={`/mod?skip=${[...skip, item.id].join(",")}`}>Skip</a>
        </div>
      </article>
    </li>
  );
};

type QueueProps = { moderator: string; items: QueueItem[]; waiting: number; now: number; skip: string[]; unattended: boolean; breaker: boolean };

export const ModQueue: FC<QueueProps> = ({ moderator, items, waiting, now, skip, unattended, breaker }) => (
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
    {unattended ? <p class="notice error">Nobody has moderated for 48 hours, so posting is paused. Any decision here reopens it.</p> : null}
    {breaker ? <p class="notice">Unusual reporting was detected. For now, reports flag requests here without hiding them from the wall.</p> : null}
    <p class="notice">
      Judge conduct against the seven rules, never belief. Never contact or reply to an author. Skip anything you find hard; someone else will take it.
    </p>
    {items.length === 0 ? (
      <p class="notice">Nothing is waiting.</p>
    ) : (
      <ul class="wall">
        {items.map((item) => (
          <Item item={item} now={now} skip={skip} />
        ))}
      </ul>
    )}
  </>
);

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
