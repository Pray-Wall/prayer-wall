// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono, type Context } from "hono";
import type { Child } from "hono/jsx";
import type { Database } from "./lib/database";
import { DEVICE_ID_PATTERN } from "./lib/hashes";
import { DEFAULT_LANG, getLang, pickLang, translator, type Lang, type T } from "./lib/i18n";
import { openMine, parseAction } from "./lib/mine";
import { submitRequest, type Mode } from "./lib/posting";
import type { BotCheck, RateLimiter } from "./lib/services";
import { loadWall, parseView } from "./lib/wall";
import { Confirmation, PostForm, PostingClosed, emptyForm, type FormValues } from "./views/form";
import { Layout } from "./views/layout";
import { MineEnter, MinePage } from "./views/mine";
import { Wall } from "./views/wall";

export type AppDeps = {
  db: Database;
  limiter: RateLimiter;
  /** Null when the bot check is not configured; posting is then paused. */
  botCheck: BotCheck | null;
  /** Null when the master secret is not configured; posting and the private page are then paused. */
  masterSecret: string | null;
  mode: Mode;
  /** Link to the exact source of the running version (AGPL requirement). */
  sourceUrl: string;
  /** The visitor's network address. Used only to compute the daily visitor hash; never stored or logged. */
  clientIp: (request: Request) => string;
  /**
   * The visitor's country as the platform reports it (two-letter code), or null. Shown on the
   * posting form and stored with the request unless the author ticks "Hide my country".
   */
  clientCountry: (request: Request) => string | null;
  /** Current time in Unix seconds; injectable for tests. */
  now?: () => number;
};

const LOOKS_LIKE_LANG = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i;

/**
 * Every POST must come from this site. `Sec-Fetch-Site` is checked first because a
 * `Referrer-Policy: no-referrer` page sends `Origin: null` on its own form posts.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("Origin");
  return origin !== null && origin === new URL(request.url).origin;
}

const field = (form: Record<string, unknown>, name: string): string => {
  const v = form[name];
  return typeof v === "string" ? v : "";
};

/** Builds the app from its dependencies; nothing here knows about Cloudflare. */
export function createApp(deps: AppDeps) {
  const app = new Hono();
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));

  type PageOptions = { title?: string; noindex?: boolean; botCheck?: boolean; hideAsk?: boolean; status?: 200 | 403 | 404 | 422 | 429 };
  const page = (c: Context, lang: Lang, t: T, body: Child, o: PageOptions = {}) => {
    if (o.noindex) c.header("Cache-Control", "no-store");
    const html = (
      <Layout lang={lang} t={t} sourceUrl={deps.sourceUrl} title={o.title} noindex={o.noindex} botCheck={o.botCheck} hideAsk={o.hideAsk}>
        {body}
      </Layout>
    );
    // Without a doctype browsers fall back to quirks mode.
    return c.html(`<!DOCTYPE html>${html}`, o.status ?? 200);
  };

  /** Resolves the interface language of a /{lang}/... route, or answers for an unknown one. */
  const withLang = async (c: Context): Promise<{ lang: Lang; t: T } | Response> => {
    const code = c.req.param("lang") ?? "";
    const lang = getLang(code);
    if (lang) return { lang, t: translator(lang.code) };
    // Unknown language codes fall back to English for the interface.
    if (!LOOKS_LIKE_LANG.test(code) || c.req.method !== "GET") return c.notFound();
    const url = new URL(c.req.url);
    return c.redirect(`/${DEFAULT_LANG}${url.pathname.slice(code.length + 1)}${url.search}`, 302);
  };

  app.get("/", (c) => {
    c.header("Vary", "Accept-Language");
    return c.redirect(`/${pickLang(c.req.header("Accept-Language"))}`, 302);
  });

  app.get("/healthz", async (c) => {
    const ok = await deps.db.ping();
    c.header("Cache-Control", "no-store");
    return c.json({ ok }, ok ? 200 : 503);
  });

  app.get("/:lang", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    const view = parseView(c.req.query("view"));
    const at = now();
    const wall = await loadWall(deps.db, view, c.req.query("after"), at);
    return page(c, l.lang, l.t, <Wall lang={l.lang} t={l.t} view={view} page={wall} now={at} />);
  });

  // ---- Ask for prayer ----

  const postingOpen = () => deps.mode !== "closed" && deps.botCheck !== null && deps.masterSecret !== null;

  app.get("/:lang/new", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    const o = { title: l.t("ask_for_prayer"), hideAsk: true };
    if (!postingOpen()) return page(c, l.lang, l.t, <PostingClosed lang={l.lang} t={l.t} />, o);
    return page(c, l.lang, l.t, <PostForm lang={l.lang} t={l.t} values={emptyForm(l.lang)} country={deps.clientCountry(c.req.raw)} siteKey={deps.botCheck!.siteKey} />, { ...o, botCheck: true });
  });

  app.post("/:lang/new", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    const { lang, t } = l;
    const o = { title: t("ask_for_prayer"), hideAsk: true, noindex: true };
    if (!postingOpen()) return page(c, lang, t, <PostingClosed lang={lang} t={t} />, o);

    const form = await c.req.parseBody();
    const values: FormValues = {
      kind: field(form, "kind"),
      name: field(form, "name"),
      body: field(form, "body"),
      lang: field(form, "lang"),
      hideCountry: field(form, "hide_country") === "1",
    };
    // A refused post comes back with everything the author typed and one plain sentence.
    const refuse = (error: string, status: 403 | 422 | 429) =>
      page(c, lang, t, <PostForm lang={lang} t={t} values={values} country={deps.clientCountry(c.req.raw)} error={error} siteKey={deps.botCheck!.siteKey} />, { ...o, botCheck: true, status });

    if (!isSameOrigin(c.req.raw)) return refuse("origin", 403);
    const device = field(form, "device");
    const result = await submitRequest(
      { db: deps.db, limiter: deps.limiter, botCheck: deps.botCheck!, masterSecret: deps.masterSecret! },
      {
        ...values,
        country: values.hideCountry ? "" : (deps.clientCountry(c.req.raw) ?? ""),
        deviceId: DEVICE_ID_PATTERN.test(device) ? device : null,
        botResponse: field(form, "cf-turnstile-response") || undefined,
        ip: deps.clientIp(c.req.raw),
      },
      now(),
    );
    if (!result.ok) return refuse(result.error, result.error === "too_many" ? 429 : 422);

    // The token goes after "#", so it never reaches a server log, an analytics tool or a referrer.
    const link = `${new URL(c.req.url).origin}/${lang.code}/mine#${result.token}`;
    return page(c, lang, t, <Confirmation lang={lang} t={t} link={link} token={result.token} />, { title: t("confirm_title"), noindex: true });
  });

  // ---- My request ----

  app.get("/:lang/mine", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    return page(c, l.lang, l.t, <MineEnter lang={l.lang} t={l.t} />, { title: l.t("my_request"), noindex: true });
  });

  app.post("/:lang/mine", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    const { lang, t } = l;
    const o = { title: t("my_request"), noindex: true };
    if (!isSameOrigin(c.req.raw)) return page(c, lang, t, <MineEnter lang={lang} t={t} message="err_origin" />, { ...o, status: 403 });
    if (deps.masterSecret === null) return page(c, lang, t, <MineEnter lang={lang} t={t} message="posting_closed" />, o);

    const form = await c.req.parseBody();
    const result = await openMine(
      { db: deps.db, limiter: deps.limiter, masterSecret: deps.masterSecret },
      field(form, "token"),
      parseAction(field(form, "action")),
      deps.clientIp(c.req.raw),
      now(),
    );
    if (result.state === "too_many") return page(c, lang, t, <MineEnter lang={lang} t={t} message="mine_too_many" />, { ...o, status: 429 });
    if (result.state === "not_found") return page(c, lang, t, <MineEnter lang={lang} t={t} message="mine_not_found" />, { ...o, status: 404 });
    return page(c, lang, t, <MinePage lang={lang} t={t} result={result} />, o);
  });

  return app;
}
