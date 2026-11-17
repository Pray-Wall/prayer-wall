// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FC } from "hono/jsx";
import type { WallRequest } from "../lib/database";
import { countryName, type Lang, type T } from "../lib/i18n";
import type { WallPage, WallView } from "../lib/wall";

const Card: FC<{ r: WallRequest; t: T; lang: Lang; now: number }> = ({ r, t, lang, now }) => (
  <li>
    <article class="card">
      <p class="who">
        {t(`kind_${r.kind}`)}
        {r.displayName ? (
          <>
            {" · "}
            <bdi>{r.displayName}</bdi>
          </>
        ) : null}
        {r.country ? ` · ${countryName(lang.code, r.country)}` : null}
      </p>
      {/* User text is escaped by the template and shown as plain text, in its own language and direction. */}
      <p class="text" lang={r.lang} dir="auto" data-nosnippet>
        {r.body}
      </p>
      <p class="row">
        <time datetime={new Date(r.publishedAt * 1000).toISOString()}>{t.ago(r.publishedAt, now)}</time>
        <span class="count">{t.count("prayed", r.prayedCount)}</span>
      </p>
    </article>
  </li>
);

type Props = { lang: Lang; t: T; view: WallView; page: WallPage; now: number };

export const Wall: FC<Props> = ({ lang, t, view, page, now }) => {
  const href = (v: WallView, after?: string) => {
    const q = new URLSearchParams();
    if (v !== "need") q.set("view", v);
    if (after) q.set("after", after);
    const s = q.toString();
    return `/${lang.code}${s ? `?${s}` : ""}`;
  };
  return (
    <>
      <h1 class="sr">{t("app_name")}</h1>
      <nav class="tabs" aria-label={t("tabs_label")}>
        <a href={href("need")} aria-current={view === "need" ? "page" : undefined}>
          {t("tab_need")}
        </a>
        <a href={href("new")} aria-current={view === "new" ? "page" : undefined}>
          {t("tab_new")}
        </a>
      </nav>
      {page.requests.length === 0 ? (
        <p class="notice">{t("empty")}</p>
      ) : (
        <ul class="wall">
          {page.requests.map((r) => (
            <Card r={r} t={t} lang={lang} now={now} />
          ))}
        </ul>
      )}
      {page.next ? (
        <p class="more">
          <a class="btn" href={href(view, page.next)}>
            {t("more")}
          </a>
        </p>
      ) : null}
    </>
  );
};
