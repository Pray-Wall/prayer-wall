// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Child, FC } from "hono/jsx";
import { LANGS, type Lang, type T } from "../lib/i18n";

type Props = {
  lang: Lang;
  t: T;
  sourceUrl: string;
  /** Page title; the site name is added after it. */
  title?: string;
  /** Private pages are kept out of search engines. */
  noindex?: boolean;
  /** Loads the bot-check widget script (posting form only). */
  botCheck?: boolean;
  /** Hides the "Ask for prayer" button, e.g. on the form itself. */
  hideAsk?: boolean;
  children?: Child;
};

export const Layout: FC<Props> = ({ lang, t, sourceUrl, title, noindex, botCheck, hideAsk, children }) => (
  <html lang={lang.code} dir={lang.dir}>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      {noindex ? <meta name="robots" content="noindex" /> : <meta name="description" content={t("meta_description")} />}
      <title>{title ? `${title} · ${t("app_name")}` : t("app_name")}</title>
      <link rel="stylesheet" href="/style.css" />
      <script src="/wall.js" defer></script>
      {botCheck ? <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script> : null}
    </head>
    <body>
      <a class="skip" href="#main">
        {t("skip_to_requests")}
      </a>
      <header class="top">
        <p class="brand">
          <a href={`/${lang.code}`}>{t("app_name")}</a>
        </p>
        <nav class="actions">
          {/* Shown by wall.js only on a device that holds a private link. */}
          <a href={`/${lang.code}/mine`} data-mine hidden>
            {t("my_request")}
          </a>
          {hideAsk ? null : (
            <a class="btn-primary" href={`/${lang.code}/new`}>
              {t("ask_for_prayer")}
            </a>
          )}
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer class="foot">
        <nav aria-label={t("language")}>
          <ul class="langs">
            {LANGS.map((l) => (
              <li>
                <a href={`/${l.code}`} lang={l.code} hreflang={l.code} aria-current={l.code === lang.code ? "true" : undefined}>
                  {l.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p>
          <a href={sourceUrl}>{t("source_code")}</a>
        </p>
      </footer>
    </body>
  </html>
);
