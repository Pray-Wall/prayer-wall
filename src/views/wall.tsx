// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FC } from "hono/jsx";
import type { Lang, T } from "../lib/i18n";
import type { NeedNext, WallPage, WallView } from "../lib/wall";
import { Card } from "./card";

type Props = { lang: Lang; t: T; view: WallView; page: WallPage & { needNext?: NeedNext }; now: number; self: string };

export const Wall: FC<Props> = ({ lang, t, view, page, now, self }) => {
  const href = (v: WallView, after?: string, need?: NeedNext) => {
    const q = new URLSearchParams();
    if (v !== "need") q.set("view", v);
    if (after) q.set("after", after);
    if (need && "page" in need) {
      q.set("s", String(need.shuffle));
      q.set("p", String(need.page));
    }
    if (need && "after" in need) q.set("after", need.after);
    const s = q.toString();
    return `/${lang.code}${s ? `?${s}` : ""}`;
  };
  return (
    <>
      <h1 class="sr">{t("app_name")}</h1>
      {/* Filled by wall.js only when this device has something to report. */}
      <p class="notice" role="status" data-status hidden data-one={t("status_mine_one")} data-many={t("status_mine")} data-answered={t("status_answered")}></p>
      <nav class="tabs" aria-label={t("tabs_label")}>
        <a href={href("need")} aria-current={view === "need" ? "page" : undefined}>
          {t("tab_need")}
        </a>
        <a href={href("new")} aria-current={view === "new" ? "page" : undefined}>
          {t("tab_new")}
        </a>
      </nav>
      {page.requests.length === 0 ? (
        <p class="notice">
          {t("empty")}{" "}
          <a href={`/${lang.code}/new`}>{t("ask_for_prayer")}</a>
        </p>
      ) : (
        <ul class="wall">
          {page.requests.map((r) => (
            <li>
              <Card r={r} t={t} lang={lang} now={now} back={self} />
            </li>
          ))}
        </ul>
      )}
      {page.next || page.needNext ? (
        <p class="more">
          <a class="btn" href={href(view, page.next ?? undefined, page.needNext)}>
            {t("more")}
          </a>
        </p>
      ) : null}
    </>
  );
};
