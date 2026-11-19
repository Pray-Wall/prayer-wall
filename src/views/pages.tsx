// SPDX-License-Identifier: AGPL-3.0-or-later
// The rules, privacy and about pages. Their text is long and legal in places, so it lives here
// rather than in the locale file; when a second interface language arrives, these move to one
// file per language, written or checked by a person (never machine-translated).
import type { FC } from "hono/jsx";
import type { Lang } from "../lib/i18n";
import { HELPLINE_URL } from "./support";

export const MIN_AGE = 16;

type P = { lang: Lang; contact: string; sourceUrl: string };
const Mail: FC<{ to: string }> = ({ to }) => <a href={`mailto:${to}`}>{to}</a>;

export const RulesPage: FC<P> = ({ lang, contact }) => (
  <article class="page">
    <h1>Rules</h1>
    <p>This wall is a quiet place to ask for prayer and to pray for others. Every request is read against these rules, never against anyone's beliefs.</p>
    <ol>
      <li>This wall is for prayer to God. Ask, give thanks, or pray for others.</li>
      <li>No contact details, links, usernames or addresses.</li>
      <li>No requests for money, gifts or business.</li>
      <li>When praying for someone else, use a first name only and nothing that identifies them.</li>
      <li>No preaching, arguing, or speaking against any person, group or faith.</li>
      <li>No prayers for harm to anyone.</li>
      <li>Keep it suitable for all ages.</li>
    </ol>
    <p>The wall supports English only at the moment. You must be {MIN_AGE} or older to post. No age is asked or checked.</p>

    <h2 id="moderation">How requests are checked</h2>
    <ul>
      <li>A few fixed checks run as you post, for example for email addresses, phone numbers and links. If one matches, you are told why and can change your words.</li>
      <li>An automatic check (an AI model run by Cloudflare) reads each request. It can only let a request through or hold it for a person. It never removes anything.</li>
      <li>Volunteer moderators read every held or reported request. Only a person can remove a request, and the author sees the reason on their private page.</li>
      <li>Anyone can report a request with the "Report" link on it. Three reports hide it until a moderator has looked.</li>
    </ul>

    <h2 id="limits">What this wall is not</h2>
    <p>This wall is not an emergency or counselling service. Moderators cannot reply to authors, and nobody can contact you through it. If you or someone near you is in danger, call your local emergency number. <a href={HELPLINE_URL} rel="noopener">Find a helpline in your country</a>.</p>

    <h2 id="your-words">Your words</h2>
    <p>What you write stays yours. By posting, you let the site show it on the wall until it expires: 30 days from publishing, or 60 if you extend it once. You can delete it at any time from your private link.</p>

    <h2 id="notices">Notices and second looks</h2>
    <p>To report illegal content in detail, or to ask for a second look at a removed request, write to <Mail to={contact} /> and include the request's ID. We accept messages in English. Each notice is acknowledged, decided and recorded.</p>
    <p><a href={`/${lang.code}`}>Back to the wall</a></p>
  </article>
);

export const PrivacyPage: FC<P> = ({ lang, contact, sourceUrl }) => (
  <article class="page">
    <h1>Privacy</h1>
    <p>A prayer request can reveal your faith and your health, so this site is built to know as little as possible about who you are.</p>

    <h2 id="who">Who runs this site</h2>
    <p>Prayer Wall is an open-source project run by its volunteer maintainers. Contact: <Mail to={contact} />. We answer requests about your data within 30 days.</p>

    <h2 id="not-collected">What we never collect</h2>
    <ul>
      <li>No accounts, email addresses, phone numbers or passwords.</li>
      <li>No network (IP) addresses in our database or logs.</li>
      <li>No cookies set by this site, no advertising and no third-party analytics.</li>
    </ul>

    <h2 id="collected">What we keep</h2>
    <ul>
      <li>Your request: the text, the optional first name, who it is for, and its language.</li>
      <li>Your country, as Cloudflare's network reports it, unless you tick "Hide my country". It is shown on the card.</li>
      <li>How many people prayed for it and how many reported it.</li>
      <li>A daily code made from your network address with a secret that changes every day. It cannot be turned back into the address, and it lets us stop repeated posts, prayers and reports. These short-lived rows are deleted after 48 hours.</li>
      <li>A fingerprint of your private link, never the link itself. Only the link can open your private page.</li>
      <li>A log of moderator decisions: which moderator decided, when, and why. It holds no request text.</li>
    </ul>

    <h2 id="browser">What your browser keeps</h2>
    <p>This site stores a few items in your browser's own storage (not cookies). They never leave your device except as described.</p>
    <ul>
      <li>A random device code, so one device's prayer is counted once a day. It is sent when you press "I prayed".</li>
      <li>Your private links, so "My request" works on this device.</li>
      <li>Which requests you posted or prayed for today, so the wall can tell you when your request has gained prayers.</li>
    </ul>
    <p>Clearing your browser's site data removes all of them. Keep a copy of your private link if you want to return from another device.</p>

    <h2 id="recipients">Who else sees your request</h2>
    <ul>
      <li><strong>Cloudflare</strong> hosts the site and the database. The database is stored in the European Union. Your network address passes through Cloudflare's network to deliver pages, even though this site does not store it.</li>
      <li><strong>Cloudflare Turnstile</strong> runs on the posting form only, to tell people from scripts. It reads technical signals from your browser. Cloudflare describes what it collects in its <a href="https://www.cloudflare.com/turnstile-privacy-policy/" rel="noopener">Turnstile Privacy Addendum</a>.</li>
      <li><strong>Workers AI</strong> (Cloudflare) receives the request text for the automatic check, with no identifier attached. Cloudflare states that it does not keep the text after answering and does not use it to train models. See <a href="https://developers.cloudflare.com/workers-ai/platform/data-usage/" rel="noopener">Workers AI data usage</a>.</li>
      <li><strong>Moderators</strong> are volunteers who read held and reported requests. They sign in through Cloudflare Access and cannot see who posted.</li>
    </ul>
    <p>No other service receives request text. If that ever changes, this page will be updated before the change, never after.</p>

    <h2 id="retention">How long things are kept</h2>
    <table class="facts-table">
      <thead><tr><th>Data</th><th>Kept for</th></tr></thead>
      <tbody>
        <tr><td>A published request</td><td>30 days from publishing, or 60 if you extend it once</td></tr>
        <tr><td>A held request nobody reviewed</td><td>14 days</td></tr>
        <tr><td>A removed request</td><td>30 days, so a second look is possible</td></tr>
        <tr><td>Prayer and limit rows</td><td>48 hours</td></tr>
        <tr><td>Reports</td><td>Deleted with the request</td></tr>
        <tr><td>Moderator decisions and totals</td><td>Kept; they hold no request text</td></tr>
      </tbody>
    </table>
    <p>Deleting is a real delete. The database's recovery history can still hold deleted rows for up to 30 days, after which they are gone.</p>

    <h2 id="rights">Your choices</h2>
    <ul>
      <li><strong>Delete:</strong> your private link deletes your request at once.</li>
      <li><strong>Lost your link?</strong> Write to <Mail to={contact} /> with the request's ID or the exact words, and a moderator will remove it.</li>
      <li><strong>Someone else's request names you?</strong> Write to the same address. Requests may use first names only, so we can remove anything that identifies a person.</li>
    </ul>
    <p>The code that runs this site is public: <a href={sourceUrl}>source code</a>.</p>
    <p><a href={`/${lang.code}`}>Back to the wall</a></p>
  </article>
);

export const AboutPage: FC<P> = ({ lang, contact, sourceUrl }) => (
  <article class="page">
    <h1>About</h1>
    <p>Prayer Wall is one simple page where anyone can ask for prayer and anyone can pray for them. There is no app, no account and no download.</p>
    <p>It serves anyone who prays to God. It belongs to no church and promotes no denomination or tradition. People write in the words of their own faith.</p>
    <p>Each request stays for 30 days. Requests that fewer people have reached come first, so nobody is left out. Nothing is ranked, liked or trending.</p>
    <p>The project is open source under the AGPL licence and run by volunteers. Anyone can read the <a href={sourceUrl}>source code</a>, suggest changes, or offer to help moderate.</p>
    <p>Contact: <Mail to={contact} />.</p>
    <p><a href={`/${lang.code}/rules`}>Rules</a> · <a href={`/${lang.code}/privacy`}>Privacy</a> · <a href={`/${lang.code}`}>Back to the wall</a></p>
  </article>
);
