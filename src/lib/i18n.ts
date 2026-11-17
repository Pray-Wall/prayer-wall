// SPDX-License-Identifier: AGPL-3.0-or-later
import ar from "../../locales/ar.json";
import en from "../../locales/en.json";

type Catalog = Record<string, { message: string } | undefined>;

export type Lang = { code: string; name: string; dir: "ltr" | "rtl" };

/** Interface languages, each named in its own language. English is the source and the fallback. */
export const LANGS: readonly Lang[] = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
];
export const DEFAULT_LANG = "en";

// ISO 3166-1 alpha-2, plus XK. The author may choose one; it is never derived from the network address.
const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");
const COUNTRY_SET = new Set(COUNTRY_CODES);
export const isCountry = (code: string) => COUNTRY_SET.has(code);

const regionNames = new Map<string, Intl.DisplayNames>();
/** The country's name in the interface language, or null for an unknown code. */
export function countryName(lang: string, code: string | null): string | null {
  if (!code || !isCountry(code)) return null;
  let names = regionNames.get(lang);
  if (!names) regionNames.set(lang, (names = new Intl.DisplayNames([lang], { type: "region" })));
  return names.of(code) ?? code;
}

const catalogs: Record<string, Catalog> = { en, ar };

export function getLang(code: string): Lang | undefined {
  return LANGS.find((l) => l.code === code);
}

export type T = {
  (key: string): string;
  /** Picks the plural form for n: `${key}_none` at zero if defined, else the language's plural category. */
  count(key: string, n: number): string;
  number(n: number): string;
  /** "3 hours ago" in the interface language. */
  ago(thenSeconds: number, nowSeconds: number): string;
};

export function translator(code: string): T {
  const cat = catalogs[code] ?? {};
  const look = (key: string) => cat[key]?.message ?? (en as Catalog)[key]?.message;
  const nf = new Intl.NumberFormat(code);
  const pr = new Intl.PluralRules(code);
  const rtf = new Intl.RelativeTimeFormat(code, { numeric: "always" });

  const t = ((key: string) => look(key) ?? key) as T;
  t.number = (n) => nf.format(n);
  t.count = (key, n) => {
    const form =
      (n === 0 ? look(`${key}_none`) : undefined) ??
      cat[`${key}_${pr.select(n)}`]?.message ??
      look(`${key}_other`) ??
      key;
    return form.replace("{n}", nf.format(n));
  };
  t.ago = (then, now) => {
    const s = Math.max(0, now - then);
    if (s < 3600) return rtf.format(-Math.max(1, Math.floor(s / 60)), "minute");
    if (s < 86400) return rtf.format(-Math.floor(s / 3600), "hour");
    return rtf.format(-Math.floor(s / 86400), "day");
  };
  return t;
}

/** Chooses an interface language from an Accept-Language header. */
export function pickLang(acceptLanguage: string | null | undefined): string {
  if (!acceptLanguage) return DEFAULT_LANG;
  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.toLowerCase(), weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((x) => x.tag && x.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  for (const { tag } of wanted) {
    const base = tag.split("-")[0];
    if (base && getLang(base)) return base;
  }
  return DEFAULT_LANG;
}
