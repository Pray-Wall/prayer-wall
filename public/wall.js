/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Progressive enhancement only: every page works without this file, except the bot check on posting. */
(function () {
  "use strict";
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var $ = function (s) { return document.querySelector(s); };
  var tokens = function () { try { return JSON.parse(store.get("pw_mine") || "[]"); } catch (e) { return []; } };

  // A random device id, kept in this browser only. The server stores just a daily hash of it.
  var deviceField = $("[data-device]");
  if (deviceField) {
    var id = store.get("pw_device");
    if (!id && window.crypto && crypto.getRandomValues) {
      id = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (b) {
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
      store.set("pw_device", id);
    }
    deviceField.value = id || "";
  }

  // Live character counter.
  var area = $("[data-count]"), counter = $("[data-counter]");
  if (area && counter) {
    var show = function () { counter.textContent = Array.from(area.value).length + " / " + area.maxLength; };
    area.addEventListener("input", show);
    show();
  }

  // Remember the private link on this device, or forget it after a delete.
  var remember = $("[data-remember]"), forget = $("[data-forget]"), list = tokens();
  if (remember) {
    var t = remember.getAttribute("data-remember");
    if (list.indexOf(t) < 0) { list.unshift(t); store.set("pw_mine", JSON.stringify(list.slice(0, 20))); }
  }
  if (forget) {
    list = list.filter(function (x) { return x !== forget.getAttribute("data-forget"); });
    store.set("pw_mine", JSON.stringify(list));
  }

  // Header link to the most recent request posted from this device.
  var mine = $("[data-mine]");
  if (mine && list.length) { mine.href += "#" + list[0]; mine.hidden = false; }

  // Copy button on the confirmation page.
  var copy = $("[data-copy]");
  if (copy && navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener("click", function () {
      navigator.clipboard.writeText(document.getElementById(copy.getAttribute("data-copy")).value).then(function () {
        copy.textContent = copy.getAttribute("data-copied");
      });
    });
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
