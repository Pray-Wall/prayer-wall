// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FC } from "hono/jsx";
import type { Lang, T } from "../lib/i18n";

/** A maintained international directory, partnered with the International Association for Suicide Prevention. */
export const HELPLINE_URL = "https://findahelpline.com";

/**
 * The support panel. It never says that a request was flagged, detected or held because of its content.
 * `unattended`: while no moderator is active it must not promise that a person will read the request soon.
 */
export const SupportPanel: FC<{ t: T; unattended?: boolean }> = ({ t, unattended }) => (
  <section class="notice support" aria-labelledby="support-title">
    <h2 id="support-title">{t("support_title")}</h2>
    <p>{t(unattended ? "support_body_unattended" : "support_body")}</p>
    <p>
      {t("support_help")}{" "}
      <a href={HELPLINE_URL} rel="noopener">
        {t("support_find")}
      </a>
      .
    </p>
    <p>{t("support_emergency")}</p>
  </section>
);

export const SupportPage: FC<{ lang: Lang; t: T }> = ({ lang, t }) => (
  <>
    <h1>{t("support_title")}</h1>
    <p>{t("support_page_intro")}</p>
    <p>
      <a class="btn-primary" href={HELPLINE_URL} rel="noopener">
        {t("support_find")}
      </a>
    </p>
    <p>{t("support_emergency")}</p>
    <p>
      <a href={`/${lang.code}`}>{t("back_to_wall")}</a>
    </p>
  </>
);

/** The quiet link on every confirmation page. */
export const SupportLink: FC<{ lang: Lang; t: T }> = ({ lang, t }) => (
  <p class="who">
    <a href={`/${lang.code}/support`}>{t("support_link")}</a>
  </p>
);
