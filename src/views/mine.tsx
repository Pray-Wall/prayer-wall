// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FC } from "hono/jsx";
import type { Lang, T } from "../lib/i18n";
import type { MineResult } from "../lib/mine";

/** The page before a token is known. wall.js fills the field from the part after "#" and submits. */
export const MineEnter: FC<{ lang: Lang; t: T; message?: string }> = ({ lang, t, message }) => (
  <>
    <h1>{t("my_request")}</h1>
    {message ? (
      <p class="notice error" role="alert">
        {t(message)}
      </p>
    ) : null}
    <form method="post" action={`/${lang.code}/mine`} class="stack" data-mine-form>
      <div>
        <label for="token">{t("mine_paste")}</label>
        <input id="token" name="token" required autocomplete="off" dir="ltr" aria-describedby="token-help" />
        <p class="help" id="token-help">
          {t("mine_paste_help")}
        </p>
      </div>
      <p>
        <button class="btn-primary" type="submit">
          {t("mine_open")}
        </button>
      </p>
    </form>
  </>
);

const Action: FC<{ lang: Lang; token: string; action: string; label: string; cls?: string }> = ({ lang, token, action, label, cls }) => (
  <form method="post" action={`/${lang.code}/mine`}>
    <input type="hidden" name="token" value={token} />
    <input type="hidden" name="action" value={action} />
    <button class={cls ?? "btn"} type="submit">
      {label}
    </button>
  </form>
);

type Found = Extract<MineResult, { state: "found" | "confirm_delete" | "deleted" }>;

export const MinePage: FC<{ lang: Lang; t: T; result: Found }> = ({ lang, t, result }) => {
  if (result.state === "deleted") {
    return (
      <>
        <h1>{t("deleted_title")}</h1>
        <p data-forget={result.token}>
          <a href={`/${lang.code}`}>{t("back_to_wall")}</a>
        </p>
      </>
    );
  }
  const { request: r, token } = result;
  const text = (
    <p class="text card" lang={r.lang} dir="auto">
      {r.body}
    </p>
  );
  if (result.state === "confirm_delete") {
    return (
      <>
        <h1>{t("delete_title")}</h1>
        {text}
        <p>{t("delete_body")}</p>
        <div class="buttons">
          <Action lang={lang} token={token} action="delete_confirm" label={t("delete_yes")} cls="btn danger" />
          <Action lang={lang} token={token} action="view" label={t("delete_no")} />
        </div>
      </>
    );
  }
  const live = result.status === "held" || result.status === "published";
  return (
    <>
      <h1>{t("my_request")}</h1>
      {result.done ? (
        <p class="notice" role="status">
          {t(`${result.done}_done`)}
        </p>
      ) : null}
      <p class="notice" data-remember={token}>
        <strong>{t(`status_${result.status}`)}</strong>
      </p>
      {text}
      <p class="who">
        {t.count("prayed", r.prayedCount)}
        {r.answeredAt && result.done !== "answered" ? ` · ${t("answered_done")}` : null}
      </p>
      <div class="buttons">
        {live && !r.answeredAt ? <Action lang={lang} token={token} action="answered" label={t("act_answered")} /> : null}
        {result.status === "published" && !r.extended ? <Action lang={lang} token={token} action="extend" label={t("act_extend")} /> : null}
        <Action lang={lang} token={token} action="delete" label={t("act_delete")} cls="btn danger" />
      </div>
      <p>
        <a href={`/${lang.code}`}>{t("back_to_wall")}</a>
      </p>
    </>
  );
};
