// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Child, FC } from "hono/jsx";
import { LANGS, type Lang, type T } from "../lib/i18n";

type Props = { lang: Lang; t: T; sourceUrl: string; children?: Child };

export const Layout: FC<Props> = ({ lang, t, sourceUrl, children }) => (
  <html lang={lang.code} dir={lang.dir}>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      <meta name="description" content={t("meta_description")} />
      <title>{t("app_name")}</title>
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body>
      <a class="skip" href="#main">
        {t("skip_to_requests")}
      </a>
      <header class="top">
        <h1>
          <a href={`/${lang.code}`}>{t("app_name")}</a>
        </h1>
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
