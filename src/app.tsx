// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono, type Context } from "hono";
import type { Child } from "hono/jsx";
import type { Database } from "./lib/database";
import { DEVICE_ID_PATTERN, dailyHasher } from "./lib/hashes";
import { DEFAULT_LANG, getLang, pickLang, translator, type Lang, type T } from "./lib/i18n";
import { openMine, parseAction } from "./lib/mine";
import { submitRequest, type Mode, type Thresholds } from "./lib/posting";
import { breakerOverride, clearOverride, setStrictForced, effectiveMode, strictForced } from "./lib/operating";
import type { ClassifierDeps } from "./lib/classifier";
import type { Alerter, BotCheck, ModeratorAuth, RateLimiter } from "./lib/services";
import type { ModAction } from "./lib/database";
import { QUEUE_PAGE, decide, isUnattended } from "./lib/moderation";
import { breakerActive, fileReport, isReportReason } from "./lib/reports";
import { PRAYER_LIMITS, parseIds, pray } from "./lib/prayers";
import { loadWall, parsePage, parseShuffle, parseView, someNeedy } from "./lib/wall";
import { Confirmation, PostForm, PostingClosed, emptyForm, type FormValues } from "./views/form";
import { Layout } from "./views/layout";
import { MineEnter, MinePage } from "./views/mine";
import { ModQueue, ModRemoved, ModShadow } from "./views/mod";
import { ReportForm, ReportNote } from "./views/report";
import { SupportPage } from "./views/support";
import { selfTestHealthy } from "./lib/self-test";
import { RequestPage } from "./views/request";
import { Wall } from "./views/wall";

export type AppDeps = {
  db: Database;
  limiter: RateLimiter;
  /** Null when the bot check is not configured; posting is then paused. */
  botCheck: BotCheck | null;
  /** Null when the master secret is not configured; posting and the private page are then paused. */
  masterSecret: string | null;
  mode: Mode;
  /** Null when moderator sign-in is not configured; /mod then does not exist. */
  moderatorAuth: ModeratorAuth | null;
  alerter: Alerter;
  /** Null when no classifier is configured: every request is held. */
  classifier: Omit<ClassifierDeps, "limiter" | "alerter"> | null;
  thresholds: Thresholds;
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
  /** Random numbers in [0, 1); injectable for tests. */
  random?: () => number;
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
  const random = deps.random ?? Math.random;

  type PageOptions = {
    title?: string; noindex?: boolean; botCheck?: boolean; hideAsk?: boolean; status?: 200 | 403 | 404 | 422 | 429;
    preview?: { title: string; text: string };
  };
  const page = (c: Context, lang: Lang, t: T, body: Child, o: PageOptions = {}) => {
    if (o.noindex) c.header("Cache-Control", "no-store");
    const html = (
      <Layout lang={lang} t={t} sourceUrl={deps.sourceUrl} title={o.title} noindex={o.noindex} botCheck={o.botCheck} hideAsk={o.hideAsk} preview={o.preview}>
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

  const REQUEST_ID = /^[a-z2-7]{12}$/;

  // ---- Moderators ----
  // Registered before the /{lang} routes, so that "mod" is never taken for a language code.
  // Behind Cloudflare Access. The Worker checks the sign-in itself on every request.

  const moderator = async (c: Context): Promise<string | Response> => {
    if (deps.moderatorAuth === null) return c.notFound();
    const who = await deps.moderatorAuth.identify(c.req.raw);
    c.header("Cache-Control", "no-store");
    return who ?? c.text("Sign-in required.", 403);
  };
  const skipped = (value: string | undefined) => (value ?? "").split(",").filter((id) => REQUEST_ID.test(id)).slice(0, 50);
  const english = { lang: getLang(DEFAULT_LANG)!, t: translator(DEFAULT_LANG) };

  app.get("/mod", async (c) => {
    const who = await moderator(c);
    if (who instanceof Response) return who;
    const o = { title: "Moderation", noindex: true, hideAsk: true };
    if (c.req.query("view") === "shadow") {
      return page(c, english.lang, english.t, <ModShadow rows={await deps.db.shadowReport(now() - 30 * 86400)} days={30} />, o);
    }
    if (c.req.query("view") === "removed") {
      return page(c, english.lang, english.t, <ModRemoved items={await deps.db.listRemoved(50)} />, o);
    }
    const at = now();
    const skip = skipped(c.req.query("skip"));
    const [items, summary, unattended, breaker] = await Promise.all([
      deps.db.listQueue(QUEUE_PAGE, skip),
      deps.db.queueSummary(),
      isUnattended(deps.db, at),
      breakerActive(deps.db, at),
    ]);
    return page(
      c, english.lang, english.t,
      <ModQueue moderator={who} items={items} waiting={summary.waiting} now={at} skip={skip} unattended={unattended} breaker={breaker} alertSent={c.req.query("alert") === "sent"}
        mode={deps.mode} overridden={await breakerOverride(deps.db)} strict={await strictForced(deps.db)} />,
      o,
    );
  });

  // Returning from a breaker is always a manual, logged decision.
  app.post("/mod/mode/restore", async (c) => {
    const who = await moderator(c);
    if (who instanceof Response) return who;
    if (!isSameOrigin(c.req.raw)) return c.text("This form was sent from somewhere else.", 403);
    await clearOverride(deps.db, who, now());
    return c.redirect("/mod", 303);
  });

  app.post("/mod/strict/clear", async (c) => {
    const who = await moderator(c);
    if (who instanceof Response) return who;
    if (!isSameOrigin(c.req.raw)) return c.text("This form was sent from somewhere else.", 403);
    await setStrictForced(deps.db, false, who, now());
    return c.redirect("/mod", 303);
  });

  // Lets a moderator check that alerts arrive. At most once a minute.
  app.post("/mod/test-alert", async (c) => {
    const who = await moderator(c);
    if (who instanceof Response) return who;
    if (!isSameOrigin(c.req.raw)) return c.text("This form was sent from somewhere else.", 403);
    if ((await deps.limiter.hit("alert:test", 60, now())) === 1) {
      await deps.alerter.send("test", "Test alert. If you can read this, alerts reach you.");
    }
    return c.redirect("/mod?alert=sent", 303);
  });

  app.post("/mod/r/:id/:action", async (c) => {
    const who = await moderator(c);
    if (who instanceof Response) return who;
    if (!isSameOrigin(c.req.raw)) return c.text("This form was sent from somewhere else.", 403);
    const id = c.req.param("id");
    const action = c.req.param("action");
    if (!REQUEST_ID.test(id) || !["publish", "remove", "restore", "escalate", "mark_crisis"].includes(action)) return c.notFound();
    const form = await c.req.parseBody();
    await decide({ db: deps.db, limiter: deps.limiter }, { id, action: action as ModAction, moderator: who, removeReason: field(form, "reason"), now: now() });
    const skip = skipped(field(form, "skip"));
    return c.redirect(action === "restore" ? "/mod?view=removed" : `/mod${skip.length ? `?skip=${skip.join(",")}` : ""}`, 303);
  });

  // Pass or fail only (Revision 2.2, change 3).
  app.get("/healthz/ai", async (c) => {
    const ok = deps.classifier !== null && (await selfTestHealthy(deps.db, now()));
    c.header("Cache-Control", "no-store");
    return c.json({ ok }, ok ? 200 : 503);
  });

  app.get("/:lang", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    const view = parseView(c.req.query("view"));
    const at = now();
    const wall = await loadWall(
      deps.db,
      { view, after: c.req.query("after"), shuffle: parseShuffle(c.req.query("s"), random), page: parsePage(c.req.query("p")) },
      at,
    );
    // The same page for everyone, so it can be cached at the edge for 45 seconds once the project has
    // its own domain (the cache does not run on workers.dev). Browsers always ask again.
    c.header("Cloudflare-CDN-Cache-Control", "max-age=45");
    c.header("Cache-Control", "no-cache");
    const url = new URL(c.req.url);
    return page(c, l.lang, l.t, <Wall lang={l.lang} t={l.t} view={view} page={wall} now={at} self={url.pathname + url.search} />);
  });

  // ---- Ask for prayer ----

  /**
   * Posting pauses when it is closed or not configured. When nobody is moderating (`unattended`) it stays
   * open in `auto` with the stricter threshold; in `review_all` nothing could ever be published, so it pauses.
   */
  const postingState = async () => {
    const mode = await effectiveMode(deps.db, deps.mode);
    const unattended = await isUnattended(deps.db, now());
    const open = mode !== "closed" && deps.botCheck !== null && deps.masterSecret !== null && !(unattended && mode !== "auto");
    return { open, mode, unattended };
  };
  const postingOpen = async () => (await postingState()).open;

  app.get("/:lang/new", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    const o = { title: l.t("ask_for_prayer"), hideAsk: true };
    if (!(await postingOpen())) return page(c, l.lang, l.t, <PostingClosed lang={l.lang} t={l.t} />, o);
    return page(c, l.lang, l.t, <PostForm lang={l.lang} t={l.t} values={emptyForm()} country={deps.clientCountry(c.req.raw)} siteKey={deps.botCheck!.siteKey} />, { ...o, botCheck: true });
  });

  app.post("/:lang/new", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    const { lang, t } = l;
    const o = { title: t("ask_for_prayer"), hideAsk: true, noindex: true };
    const state = await postingState();
    if (!state.open) return page(c, lang, t, <PostingClosed lang={lang} t={t} />, o);

    const form = await c.req.parseBody();
    const values: FormValues = {
      kind: field(form, "kind"),
      name: field(form, "name"),
      body: field(form, "body"),
      hideCountry: field(form, "hide_country") === "1",
    };
    // A refused post comes back with everything the author typed and one plain sentence.
    const again = (extra: { error?: string; revise?: string; crisis?: boolean }, status: 200 | 403 | 422 | 429) =>
      page(
        c, lang, t,
        <PostForm lang={lang} t={t} values={values} country={deps.clientCountry(c.req.raw)} siteKey={deps.botCheck!.siteKey} {...extra} />,
        { ...o, botCheck: true, status },
      );
    const refuse = (error: string, status: 403 | 422 | 429, crisis = false) => again({ error, crisis }, status);

    if (!isSameOrigin(c.req.raw)) return refuse("origin", 403);
    const device = field(form, "device");
    const result = await submitRequest(
      {
        db: deps.db, limiter: deps.limiter, botCheck: deps.botCheck!, masterSecret: deps.masterSecret!, alerter: deps.alerter,
        classifier: deps.classifier, mode: state.mode, configuredMode: deps.mode, thresholds: deps.thresholds,
        strict: await strictForced(deps.db), unattended: state.unattended,
      },
      {
        ...values,
        // The request is taken to be written in the language of the page it was posted from.
        lang: lang.code,
        country: values.hideCountry ? "" : (deps.clientCountry(c.req.raw) ?? ""),
        deviceId: DEVICE_ID_PATTERN.test(device) ? device : null,
        botResponse: field(form, "cf-turnstile-response") || undefined,
        ip: deps.clientIp(c.req.raw),
        attempt: field(form, "as_is") === "1" ? "as_is" : field(form, "attempt") === "2" ? 2 : 1,
      },
      now(),
    );
    if (!result.ok && "revise" in result) return again({ revise: result.revise }, 200);
    if (!result.ok) return refuse(result.error, result.error === "too_many" ? 429 : 422, result.crisis);

    // The token goes after "#", so it never reaches a server log, an analytics tool or a referrer.
    const link = `${new URL(c.req.url).origin}/${lang.code}/mine#${result.token}`;
    const at = now();
    const waiting = await someNeedy(deps.db, 3, null, at, random);
    return page(
      c, lang, t,
      <Confirmation
        lang={lang} t={t} link={link} token={result.token} id={result.id} waiting={waiting} now={at}
        published={result.status === "published"} crisis={result.crisis} declined={result.declined} unattended={state.unattended}
      />,
      { title: t("confirm_title"), noindex: true },
    );
  });

  app.get("/:lang/support", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    return page(c, l.lang, l.t, <SupportPage lang={l.lang} t={l.t} />, { title: l.t("support_title") });
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
    return page(c, lang, t, <MinePage lang={lang} t={t} result={result} origin={new URL(c.req.url).origin} />, o);
  });

  // ---- Shared links and "I prayed" ----

  // The address to share has no language in it (Revision 2.2, change 6).
  app.get("/r/:id", (c) => {
    const id = c.req.param("id");
    if (!REQUEST_ID.test(id)) return c.notFound();
    return c.redirect(`/${pickLang(c.req.header("Accept-Language"))}/r/${id}`, 302);
  });

  app.get("/:lang/r/:id", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    const id = c.req.param("id");
    const at = now();
    const request = REQUEST_ID.test(id) ? await deps.db.getPublished(id, at) : null;
    const more = await someNeedy(deps.db, 3, request?.id ?? null, at, random);
    const preview = {
      title: request?.displayName ? l.t("preview_named").replace("{name}", request.displayName) : l.t("preview_plain"),
      text: l.t("preview_text"),
    };
    const url = new URL(c.req.url);
    // Kept out of search engines: a request belongs on the wall, not in search results.
    return page(c, l.lang, l.t, <RequestPage lang={l.lang} t={l.t} request={request} more={more} now={at} self={url.pathname} />, {
      title: preview.title, noindex: true, preview, status: request ? 200 : 404,
    });
  });

  const prayFrom = async (c: Context, id: string, device: string) =>
    deps.masterSecret === null || !REQUEST_ID.test(id)
      ? null
      : pray(
          { db: deps.db, limiter: deps.limiter, masterSecret: deps.masterSecret },
          { requestId: id, ip: deps.clientIp(c.req.raw), deviceId: DEVICE_ID_PATTERN.test(device) ? device : null },
          now(),
        );

  // The button's background request. A custom header plus Sec-Fetch-Site stops simple cross-site forms.
  app.post("/api/r/:id/prayed", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!isSameOrigin(c.req.raw) || c.req.header("X-Prayer-Wall") !== "1") return c.json({ error: "forbidden" }, 403);
    const body = await c.req.json<{ device?: unknown }>().catch(() => ({ device: undefined }));
    const count = await prayFrom(c, c.req.param("id"), typeof body.device === "string" ? body.device : "");
    return count === null ? c.json({ error: "not_found" }, 404) : c.json({ count });
  });

  // The same, as a plain form, for browsers without script. It returns to the page it came from.
  app.post("/:lang/r/:id/prayed", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    if (!isSameOrigin(c.req.raw)) return c.text("This form was sent from somewhere else.", 403);
    const form = await c.req.parseBody();
    await prayFrom(c, c.req.param("id"), field(form, "device"));
    const back = field(form, "back");
    const safe = back.startsWith(`/${l.lang.code}`) && !back.startsWith("//") && !back.includes("\\") ? back : `/${l.lang.code}`;
    return c.redirect(safe, 303);
  });

  // "Your prayers" (Revision 2.2, change 7): counts and answered flags for ids this device remembers.
  app.get("/api/status", async (c) => {
    c.header("Cache-Control", "no-store");
    if (deps.masterSecret === null) return c.json({ requests: [] });
    const visitor = await (await dailyHasher(deps.masterSecret, now())).visitor(deps.clientIp(c.req.raw));
    if ((await deps.limiter.hit(`status:${visitor}`, 3600, now())) > PRAYER_LIMITS.statusPerVisitorHour) {
      return c.json({ requests: [] }, 429);
    }
    return c.json({ requests: await deps.db.statusOf(parseIds(c.req.query("ids")), now()) });
  });

  // ---- Report a request ----

  app.get("/:lang/r/:id/report", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    const id = c.req.param("id");
    const o = { title: l.t("report"), noindex: true };
    if (!REQUEST_ID.test(id) || !(await deps.db.isOnWall(id, now()))) {
      return page(c, l.lang, l.t, <ReportNote lang={l.lang} t={l.t} message="report_gone" />, { ...o, status: 404 });
    }
    return page(c, l.lang, l.t, <ReportForm lang={l.lang} t={l.t} id={id} />, o);
  });

  app.post("/:lang/r/:id/report", async (c) => {
    const l = await withLang(c);
    if (l instanceof Response) return l;
    const { lang, t } = l;
    const id = c.req.param("id");
    const o = { title: t("report"), noindex: true };
    if (!isSameOrigin(c.req.raw)) return page(c, lang, t, <ReportNote lang={lang} t={t} message="err_origin" />, { ...o, status: 403 });
    const form = await c.req.parseBody();
    const reason = field(form, "reason");
    if (REQUEST_ID.test(id) && isReportReason(reason) && deps.masterSecret !== null) {
      const device = field(form, "device");
      await fileReport(
        { db: deps.db, limiter: deps.limiter, alerter: deps.alerter, masterSecret: deps.masterSecret },
        { requestId: id, reason, ip: deps.clientIp(c.req.raw), deviceId: DEVICE_ID_PATTERN.test(device) ? device : null },
        now(),
      );
    }
    // Always the same answer, so nothing reveals whether the report counted.
    return page(c, lang, t, <ReportNote lang={lang} t={t} message="report_thanks" />, o);
  });

  return app;
}
