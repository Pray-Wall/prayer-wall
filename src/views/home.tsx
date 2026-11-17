// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FC } from "hono/jsx";

export const Home: FC<{ sourceUrl: string }> = ({ sourceUrl }) => (
  <html lang="en" dir="ltr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Prayer Wall</title>
    </head>
    <body>
      <main>
        <h1>Prayer Wall</h1>
        <p>A place to ask for prayer and to pray for others. It is being built.</p>
      </main>
      <footer>
        <a href={sourceUrl}>Source code</a>
      </footer>
    </body>
  </html>
);
