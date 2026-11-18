/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Progressive enhancement only: every page works without this file, except the bot check on posting. */
(function () {
  "use strict";
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var today = new Date().toISOString().slice(0, 10);

  // A random device id, kept in this browser only. The server stores just a daily hash of it.
  var device = store.get("pw_device", "");
  if (!device && window.crypto && crypto.getRandomValues) {
    device = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
    store.set("pw_device", device);
  }
  $$("[data-device]").forEach(function (f) { f.value = device; });

  // Live character counter.
  var area = $("[data-count]"), counter = $("[data-counter]");
  if (area && counter) {
    var show = function () { counter.textContent = Array.from(area.value).length + " / " + area.maxLength; };
    area.addEventListener("input", show);
    show();
  }

  // Remember the private link and the posted id on this device, or forget the link after a delete.
  var tokens = store.get("pw_mine", []), remember = $("[data-remember]"), forget = $("[data-forget]");
  if (remember) {
    var tok = remember.getAttribute("data-remember");
    if (tokens.indexOf(tok) < 0) { tokens.unshift(tok); store.set("pw_mine", tokens.slice(0, 20)); }
    var posted = remember.getAttribute("data-posted");
    if (posted) {
      var mineIds = store.get("pw_posted", []);
      if (mineIds.indexOf(posted) < 0) { mineIds.unshift(posted); store.set("pw_posted", mineIds.slice(0, 20)); }
    }
  }
  if (forget) {
    tokens = tokens.filter(function (x) { return x !== forget.getAttribute("data-forget"); });
    store.set("pw_mine", tokens);
  }
  var mine = $("[data-mine]");
  if (mine && tokens.length) { mine.href += "#" + tokens[0]; mine.hidden = false; }

  // Copy and share buttons.
  $$("[data-copy], [data-share]").forEach(function (b) {
    var input = document.getElementById(b.getAttribute("data-copy") || b.getAttribute("data-share"));
    var sharing = b.hasAttribute("data-share") && navigator.share;
    if (!sharing && !navigator.clipboard) return;
    b.hidden = false;
    b.addEventListener("click", function () {
      if (sharing) { navigator.share({ url: input.value }).catch(function () {}); return; }
      navigator.clipboard.writeText(input.value).then(function () { b.textContent = b.getAttribute("data-copied"); });
    });
  });

  // "I prayed": sent in the background; the count updates at once. Ids are kept on this device only.
  var prayed = store.get("pw_prayed", {});
  var countText = function (el, n) {
    var f = JSON.parse(el.getAttribute("data-forms"));
    el.textContent = n === 0 ? f.none : n === 1 ? f.one : f.other.replace("{n}", n.toLocaleString());
  };
  var markPrayed = function (form) {
    var b = form.querySelector("button");
    b.setAttribute("aria-pressed", "true");
    b.disabled = true;
  };
  $$("[data-pray]").forEach(function (form) {
    var id = form.getAttribute("data-pray");
    if (prayed[id] === today) markPrayed(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (prayed[id] === today) return;
      markPrayed(form);
      fetch("/api/r/" + id + "/prayed", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Prayer-Wall": "1" },
        body: JSON.stringify({ device: device })
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (d && typeof d.count === "number") countText(form.querySelector(".count"), d.count);
      }).catch(function () {});
      prayed[id] = today;
      var ids = Object.keys(prayed);
      if (ids.length > 100) delete prayed[ids[0]];
      store.set("pw_prayed", prayed);
    });
  });

  // "Your prayers": one quiet line at the top of the wall, only when there is something new.
  var line = $("[data-status]");
  var posted = store.get("pw_posted", []), prayedIds = Object.keys(prayed);
  if (line && (posted.length || prayedIds.length)) {
    fetch("/api/status?ids=" + posted.concat(prayedIds).slice(0, 100).join(","))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var seen = store.get("pw_seen", { counts: {}, answered: [] }), out = [];
        d.requests.forEach(function (r) {
          if (posted.indexOf(r.id) >= 0 && r.prayed > (seen.counts[r.id] || 0)) {
            out[0] = r.prayed === 1 ? line.getAttribute("data-one") : line.getAttribute("data-many").replace("{n}", r.prayed);
            seen.counts[r.id] = r.prayed;
          }
          if (prayed[r.id] && r.answered && seen.answered.indexOf(r.id) < 0) {
            out[1] = line.getAttribute("data-answered");
            seen.answered.push(r.id);
          }
        });
        seen.answered = seen.answered.slice(-100);
        store.set("pw_seen", seen);
        out = out.filter(Boolean);
        if (out.length) { line.textContent = out.join(" "); line.hidden = false; }
      }).catch(function () {});
  }

  // Private page: the token travels after "#", which is never sent to a server.
  // Put it in the form and send it in the body of a POST; then drop it from the address bar.
  var form = $("[data-mine-form]");
  if (form && location.hash.length > 1) {
    form.elements.token.value = location.hash.slice(1);
    history.replaceState(null, "", location.pathname);
    form.submit();
  }
})();
