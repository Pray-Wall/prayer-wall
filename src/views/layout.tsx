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
  /** Link preview for a shared request. It never contains request text. */
  preview?: { title: string; text: string };
  children?: Child;
};

export const Layout: FC<Props> = ({ lang, t, sourceUrl, title, noindex, botCheck, hideAsk, preview, children }) => (
  <html lang={lang.code} dir={lang.dir}>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      {noindex ? <meta name="robots" content="noindex" /> : null}
      <meta name="description" content={preview?.text ?? t("meta_description")} />
      {preview ? (
        <>
          <meta property="og:title" content={preview.title} />
          <meta property="og:description" content={preview.text} />
          <meta property="og:type" content="website" />
          <meta name="twitter:card" content="summary" />
        </>
      ) : null}
      <title>{title ? `${title} · ${t("app_name")}` : t("app_name")}</title>
      <link rel="stylesheet" href="/style.css" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      <meta name="theme-color" content="#1f4e9c" />
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
        {/* The language list appears once there is more than one language. */}
        {LANGS.length > 1 ? (
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
        ) : null}
        <p>
          <a href={`/${lang.code}/rules`}>{t("rules_link")}</a> · <a href={`/${lang.code}/privacy`}>{t("privacy_link")}</a> ·{" "}
          <a href={`/${lang.code}/about`}>{t("about_link")}</a> · <a href={sourceUrl}>{t("source_code")}</a>
        </p>
      </footer>
    </body>
  </html>
);
