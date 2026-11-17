// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FC } from "hono/jsx";
import { REQUEST_LANGS, countryOptions, type Lang, type T } from "../lib/i18n";
import { MAX_BODY, MAX_NAME } from "../lib/rules";

export type FormValues = { kind: string; name: string; body: string; lang: string; country: string };

export const emptyForm = (lang: Lang): FormValues => ({ kind: "self", name: "", body: "", lang: lang.code, country: "" });

type Props = { lang: Lang; t: T; values: FormValues; error?: string; siteKey: string };

export const PostForm: FC<Props> = ({ lang, t, values, error, siteKey }) => (
  <>
    <h1>{t("ask_for_prayer")}</h1>
    {error ? (
      <div class="notice error" role="alert">
        <strong>{t("err_title")}</strong>
        <p>{t(`err_${error}`)}</p>
      </div>
    ) : null}
    <form method="post" action={`/${lang.code}/new`} class="stack">
      <fieldset>
        <legend>{t("form_kind")}</legend>
        {(["self", "other", "event"] as const).map((k) => (
          <label class="choice">
            <input type="radio" name="kind" value={k} checked={values.kind === k} required /> {t(`form_kind_${k}`)}
          </label>
        ))}
      </fieldset>
      <div>
        <label for="name">{t("form_name")}</label>
        <input id="name" name="name" value={values.name} maxlength={MAX_NAME} autocomplete="off" aria-describedby="name-help" />
        <p class="help" id="name-help">
          {t("form_name_help")}
        </p>
      </div>
      <div>
        <label for="body">{t("form_body")}</label>
        <textarea id="body" name="body" rows={6} maxlength={MAX_BODY} required dir="auto" aria-describedby="body-help" data-count>
          {values.body}
        </textarea>
        <p class="help" id="body-help">
          {t("form_body_help")} <span data-counter aria-live="polite"></span>
        </p>
      </div>
      <div>
        <label for="lang">{t("form_lang")}</label>
        <select id="lang" name="lang">
          {REQUEST_LANGS.map((l) => (
            <option value={l.code} lang={l.code} selected={values.lang === l.code}>
              {l.name}
            </option>
          ))}
          <option value="und" selected={values.lang === "und"}>
            {t("form_lang_other")}
          </option>
        </select>
      </div>
      <div>
        <label for="country">{t("form_country")}</label>
        <select id="country" name="country" aria-describedby="country-help">
          <option value="">{t("form_country_none")}</option>
          {countryOptions(lang.code).map((c) => (
            <option value={c.code} selected={values.country === c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <p class="help" id="country-help">
          {t("form_country_help")}
        </p>
      </div>
      <div class="notice">
        <strong>{t("form_rules")}</strong>
        <ul class="rules">
          <li>{t("rule_contact")}</li>
          <li>{t("rule_money")}</li>
          <li>{t("rule_preach")}</li>
        </ul>
      </div>
      <input type="hidden" name="device" value="" data-device />
      <div class="cf-turnstile" data-sitekey={siteKey} data-language={lang.code}></div>
      <noscript>
        <p class="notice">{t("form_needs_js")}</p>
      </noscript>
      <p>
        <button class="btn-primary" type="submit">
          {t("form_submit")}
        </button>
      </p>
    </form>
  </>
);

export const PostingClosed: FC<{ lang: Lang; t: T }> = ({ lang, t }) => (
  <>
    <h1>{t("ask_for_prayer")}</h1>
    <p class="notice">{t("posting_closed")}</p>
    <p>
      <a href={`/${lang.code}`}>{t("back_to_wall")}</a>
    </p>
  </>
);

export const Confirmation: FC<{ lang: Lang; t: T; link: string; token: string }> = ({ lang, t, link, token }) => (
  <>
    <h1>{t("confirm_title")}</h1>
    <div class="notice stack" data-remember={token}>
      <div>
        <label for="link">{t("confirm_link")}</label>
        <input id="link" value={link} readonly dir="ltr" />
      </div>
      <p>{t("confirm_keep")}</p>
      <p class="buttons">
        <button class="btn" type="button" data-copy="link" data-copied={t("copied")} hidden>
          {t("copy_link")}
        </button>
        <a class="btn" href={link}>
          {t("open_my_request")}
        </a>
      </p>
    </div>
    <p>
      <a href={`/${lang.code}`}>{t("back_to_wall")}</a>
    </p>
  </>
);
