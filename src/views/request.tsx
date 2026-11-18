// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FC } from "hono/jsx";
import type { WallRequest } from "../lib/database";
import type { Lang, T } from "../lib/i18n";
import { Card, CardList } from "./card";

/** The page a shared link opens (Revision 2.2, change 6). It never shows an error. */
export const RequestPage: FC<{ lang: Lang; t: T; request: WallRequest | null; more: WallRequest[]; now: number; self: string }> = ({
  lang, t, request, more, now, self,
}) => (
  <>
    <h1 class="sr">{t("app_name")}</h1>
    {request ? (
      <>
        <p class="lead">{t("shared_intro")}</p>
        <Card r={request} t={t} lang={lang} now={now} back={self} />
      </>
    ) : (
      <p class="notice">{t("shared_ended")}</p>
    )}
    {more.length ? (
      <>
        <h2>{t("more_requests")}</h2>
        <CardList rows={more} t={t} lang={lang} now={now} back={self} />
      </>
    ) : null}
    <p class="more">
      <a class="btn-primary" href={`/${lang.code}/new`}>
        {t("ask_for_prayer")}
      </a>
    </p>
  </>
);
