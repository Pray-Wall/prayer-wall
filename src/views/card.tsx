// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FC } from "hono/jsx";
import type { WallRequest } from "../lib/database";
import { countryName, type Lang, type T } from "../lib/i18n";

/**
 * One request. The "I prayed" button is a form, so it works without script; wall.js sends it in
 * the background instead and updates the count at once. `back` is where the form returns to.
 */
export const Card: FC<{ r: WallRequest; t: T; lang: Lang; now: number; back: string; menu?: boolean }> = ({ r, t, lang, now, back, menu = true }) => (
  <article class="card" data-request={r.id}>
    <p class="who">
      {r.answeredAt ? (
        <>
          <span class="tag">{t("answered")}</span>{" "}
        </>
      ) : null}
      {t(`kind_${r.kind}`)}
      {r.displayName ? (
        <>
          {" · "}
          <bdi>{r.displayName}</bdi>
        </>
      ) : null}
      {r.country ? ` · ${countryName(lang.code, r.country)}` : null}
    </p>
    {/* User text is escaped by the template and shown as plain text, in its own direction. */}
    <p class="text" lang={r.lang} dir="auto" data-nosnippet>
      {r.body}
    </p>
    <div class="row">
      <time datetime={new Date(r.publishedAt * 1000).toISOString()}>{t.ago(r.publishedAt, now)}</time>
      <form method="post" action={`/${lang.code}/r/${r.id}/prayed`} class="pray" data-pray={r.id}>
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="device" value="" data-device />
        <span class="count" aria-live="polite" data-forms={JSON.stringify({ none: t("prayed_none"), one: t("prayed_one"), other: t("prayed_other") })}>
          {t.count("prayed", r.prayedCount)}
        </span>
        <button class="prayed" type="submit" aria-pressed="false">
          {t("i_prayed")}
        </button>
      </form>
    </div>
    {menu ? (
      <details class="menu">
        <summary>{t("card_menu")}</summary>
        <a href={`/${lang.code}/r/${r.id}/report`} rel="nofollow">
          {t("report")}
        </a>
      </details>
    ) : null}
  </article>
);

/** A short list of requests, e.g. under the confirmation or on a shared-link page. */
export const CardList: FC<{ rows: WallRequest[]; t: T; lang: Lang; now: number; back: string }> = ({ rows, t, lang, now, back }) => (
  <ul class="wall">
    {rows.map((r) => (
      <li>
        <Card r={r} t={t} lang={lang} now={now} back={back} />
      </li>
    ))}
  </ul>
);
