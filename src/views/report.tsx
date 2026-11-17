// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FC } from "hono/jsx";
import type { Lang, T } from "../lib/i18n";
import { REPORT_REASONS } from "../lib/reports";

export const ReportForm: FC<{ lang: Lang; t: T; id: string }> = ({ lang, t, id }) => (
  <>
    <h1>{t("report_title")}</h1>
    <form method="post" action={`/${lang.code}/r/${id}/report`} class="stack">
      <fieldset>
        <legend>{t("report_why")}</legend>
        {REPORT_REASONS.map((reason) => (
          <label class="choice">
            <input type="radio" name="reason" value={reason} required /> {t(`report_${reason}`)}
          </label>
        ))}
      </fieldset>
      <input type="hidden" name="device" value="" data-device />
      <p class="buttons">
        <button class="btn-primary" type="submit">
          {t("report_send")}
        </button>
        <a class="btn" href={`/${lang.code}`}>
          {t("back_to_wall")}
        </a>
      </p>
    </form>
  </>
);

export const ReportNote: FC<{ lang: Lang; t: T; message: string }> = ({ lang, t, message }) => (
  <>
    <h1>{t("report_title")}</h1>
    <p class="notice" role="status">
      {t(message)}
    </p>
    <p>
      <a href={`/${lang.code}`}>{t("back_to_wall")}</a>
    </p>
  </>
);
