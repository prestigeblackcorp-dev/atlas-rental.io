/*! Atlas Rental.io embed v1 -- connect your own website to Atlas bookings.
 *
 * Add once, before </body>:
 *   <script src="https://atlasrental.io/atlas-embed.js" data-atlas-slug="YOUR-SLUG" defer></script>
 * (find YOUR-SLUG in Atlas: Settings > Add booking to your site.)
 *
 * That one line is usually all you need: it scans your live page and automatically wires any
 * booking/quote form it finds -- a filled form creates the booking + notifies you, right on your
 * page, no popup. Plain contact and newsletter forms are left alone. Add data-atlas-manual to the
 * script tag to turn auto-detect off and wire things explicitly instead:
 *   A) Turn any button into a booking button -- opens your Atlas booking page in a popup:
 *        <button data-atlas-book>Book now</button>
 *      (or a link:  <a href="#" data-atlas-book>Book now</a>)
 *
 *   B) Turn your OWN form into an instant booking -- a filled form creates the booking + notifies you:
 *        <form data-atlas-form>
 *          <input name="name">            <!-- required -->
 *          <input name="email" type="email"> <!-- required -->
 *          <input name="phone">
 *          <input name="asset">           <!-- the item/vehicle name, required -->
 *          <input name="start" type="date"> <!-- required -->
 *          <input name="time" type="time">
 *          <input name="periods" type="number" value="1">
 *          <input name="location"> <input name="deliveryAddr"> <input name="promo">
 *          <textarea name="notes"></textarea>
 *          <button type="submit">Request booking</button>
 *        </form>
 *      Field names above are matched automatically; you can also tag any field with
 *      data-atlas-field="email" etc. Per-form slug override: <form data-atlas-form="OTHER-SLUG">.
 *
 * Programmatic:  AtlasBooking.book({slug, name, email, asset, start, periods, ...}).then(...)
 *
 * IMPORTANT: for a form on your own domain to work, add your site's address to the allowed list in
 * Atlas (Settings > Add booking to your site). The popup button (A) works with no allow-list setup.
 *
 * No tracking, no cookies -- this script only talks to atlasrental.io to create the booking you submit.
 */
(function () {
  'use strict';
  var API = 'https://atlasrental.io';
  var FIELDS = ['name', 'email', 'phone', 'asset', 'periods', 'start', 'time', 'location', 'deliveryAddr', 'promo', 'notes', 'rateModel'];

  function _self() {
    // the <script> tag that loaded us (document.currentScript when first evaluated, else by src match)
    if (document.currentScript) return document.currentScript;
    var ss = document.getElementsByTagName('script');
    for (var i = ss.length - 1; i >= 0; i--) { if ((ss[i].src || '').indexOf('atlas-embed.js') >= 0) return ss[i]; }
    return null;
  }
  var SELF = _self();
  var DEFAULT_SLUG = SELF ? (SELF.getAttribute('data-atlas-slug') || '') : '';

  function cleanSlug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63); }
  function bookUrl(slug) { return API + '/api/book/' + cleanSlug(slug); }
  function intakeUrl(slug) { return API + '/api/embed/' + cleanSlug(slug) + '/book'; }

  // ---- A) popup: open the hosted booking page in a lightweight modal iframe ----
  function openPopup(slug) {
    slug = cleanSlug(slug || DEFAULT_SLUG);
    if (!slug) { console.warn('[atlas-embed] no slug set (data-atlas-slug).'); return; }
    var scrim = document.createElement('div');
    scrim.setAttribute('role', 'dialog');
    scrim.setAttribute('aria-label', 'Book online');
    scrim.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(10,15,13,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    var box = document.createElement('div');
    box.style.cssText = 'position:relative;width:100%;max-width:460px;height:min(88vh,860px);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.4);';
    var x = document.createElement('button');
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = '&times;';
    x.style.cssText = 'position:absolute;top:8px;right:10px;z-index:2;width:34px;height:34px;border:0;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:22px;line-height:1;cursor:pointer;';
    var frame = document.createElement('iframe');
    frame.title = 'Book online';
    frame.loading = 'eager';
    frame.src = bookUrl(slug);
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;';
    function close() { try { document.body.removeChild(scrim); } catch (e) {} document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    x.addEventListener('click', close);
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    document.addEventListener('keydown', onKey);
    box.appendChild(x); box.appendChild(frame); scrim.appendChild(box); document.body.appendChild(scrim);
  }

  // ---- B) form intake: POST the booking to the CORS-enabled embed endpoint ----
  function book(payload) {
    payload = payload || {};
    var slug = cleanSlug(payload.slug || DEFAULT_SLUG);
    if (!slug) return Promise.reject(new Error('no slug'));
    var body = {};
    for (var i = 0; i < FIELDS.length; i++) { var k = FIELDS[i]; if (payload[k] != null && payload[k] !== '') body[k] = payload[k]; }
    return fetch(intakeUrl(slug), {
      method: 'POST', mode: 'cors', credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, json: j }; }); })
      .then(function (res) {
        var j = res.json || {};
        if (!j.ok) { var e = new Error(j.error || 'Booking failed'); e.response = j; throw e; }
        return j;   // { ok, ref, confirmed, portal, payUrl, message }
      });
  }

  function readForm(form) {
    var out = {};
    var tagged = form.querySelectorAll('[data-atlas-field]');
    for (var i = 0; i < tagged.length; i++) { var f = tagged[i].getAttribute('data-atlas-field'); if (f) out[f] = tagged[i].value; }
    for (var j = 0; j < FIELDS.length; j++) {
      var k = FIELDS[j]; if (out[k] != null && out[k] !== '') continue;
      var el = form.querySelector('[name="' + k + '"]'); if (el && el.value != null) out[k] = el.value;
    }
    return out;
  }

  function msg(form, text, ok) {
    var m = form.querySelector('[data-atlas-message]');
    if (!m) { m = document.createElement('div'); m.setAttribute('data-atlas-message', ''); m.setAttribute('role', 'status'); form.appendChild(m); }
    m.textContent = text || '';
    m.style.cssText = 'margin-top:10px;font:500 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:' + (ok ? '#146c43' : '#b42318') + ';';
  }

  function wireForm(form) {
    if (form.__atlasWired) return; form.__atlasWired = true;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var slug = cleanSlug(form.getAttribute('data-atlas-form') || DEFAULT_SLUG);
      var payload = readForm(form); payload.slug = slug;
      var btn = form.querySelector('[type="submit"], button:not([type="button"])');
      var label = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      msg(form, '', true);
      book(payload).then(function (j) {
        if (j.payUrl) { window.location.href = j.payUrl; return; }   // deposit required -> owner's payment page
        var redir = form.getAttribute('data-atlas-redirect');
        if (redir) { window.location.href = redir; return; }
        form.reset();
        msg(form, j.message || (j.confirmed ? 'Your booking is confirmed.' : 'Booking request received.'), true);
        if (j.portal) {
          var a = document.createElement('a'); a.href = j.portal; a.textContent = 'Sign & manage your booking';
          a.style.cssText = 'display:inline-block;margin-top:8px;font:600 14px system-ui;color:#146c43;';
          var mm = form.querySelector('[data-atlas-message]'); if (mm) mm.appendChild(document.createElement('br')), mm.appendChild(a);
        }
        if (typeof window.atlasOnBooked === 'function') { try { window.atlasOnBooked(j); } catch (e) {} }
      }).catch(function (err) {
        var em = (err && err.message) || 'Something went wrong';
        // a bare "Failed to fetch" cross-origin usually means this site's address is not on the Atlas allow-list yet
        if (/fetch/i.test(em)) { em = 'Booking is temporarily unavailable. Please try again or contact us.'; console.warn('[atlas-embed] request blocked. Add this site to the allowed list in Atlas: Settings > Add booking to your site (origin: ' + window.location.origin + ').'); }
        msg(form, em, false);
      }).then(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
    });
  }

  function wireButton(el) {
    if (el.__atlasWired) return; el.__atlasWired = true;
    el.addEventListener('click', function (ev) { ev.preventDefault(); openPopup(el.getAttribute('data-atlas-book') || DEFAULT_SLUG); });
  }

  // ---- AUTO MODE: connect an existing site with ONE pasted line, no data-atlas attributes ----
  // Reads the live page, maps a booking form's fields by input type + label text, and wires it to post
  // inline. Deliberately conservative: a form is only wired when it looks like a booking/quote form (has a
  // name or email AND a date/asset field or booking wording), so plain contact and newsletter forms are
  // left alone. Scanning the LIVE page (not raw HTML) is what makes this work on Squarespace/Wix/etc, which
  // build their forms with JavaScript after load.
  var MAP = [
    ['email',   /e-?mail/i,                                   function (el) { return el.type === 'email'; }],
    ['phone',   /phone|mobile|\btel\b|cell|whats ?app/i,      function (el) { return el.type === 'tel'; }],
    ['start',   /date|check-?in|start|arriv|\bfrom\b|when|pick-?up ?date|rental ?date|\bday\b/i, function (el) { return el.type === 'date'; }],
    ['time',    /\btime\b|pick-?up ?time/i,                   function (el) { return el.type === 'time'; }],
    ['periods', /days|nights|period|duration|quantity|\bqty\b|how many|number of|length/i, null],
    ['asset',   /vehicle|\bcar\b|boat|yacht|asset|\bitem\b|\bunit\b|rental|equipment|property|\broom\b|\bmodel\b|which|\bselect\b|choose/i, null],
    ['location',/location|pick-?up|branch|where|depot/i,      null],
    ['deliveryAddr', /deliver|drop-?off|address/i,            null],
    ['promo',   /promo|coupon|discount|voucher|\bcode\b/i,    null],
    ['name',    /full ?name|your name|^name$|contact|first ?name|\bname\b/i, null],
    ['notes',   /note|message|comment|detail|request|special|anything/i, null]
  ];
  function labelText(el) {
    var t = [el.getAttribute('data-atlas-field') || '', el.name || '', el.id || '', el.getAttribute('placeholder') || '', el.getAttribute('aria-label') || ''];
    try { if (el.id) { var lb = document.querySelector('label[for="' + String(el.id).replace(/["\\]/g, '') + '"]'); if (lb) t.push(lb.textContent || ''); } } catch (e) {}
    try { var wrap = el.closest && el.closest('label'); if (wrap) t.push(wrap.textContent || ''); } catch (e) {}
    return t.join(' ').toLowerCase();
  }
  function fieldFor(el) {
    var explicit = el.getAttribute('data-atlas-field'); if (explicit) return explicit;
    var tag = (el.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return null;
    var type = (el.type || '').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'password' || type === 'file' || type === 'checkbox' || type === 'radio') return null;
    var lt = labelText(el);
    for (var i = 0; i < MAP.length; i++) { var m = MAP[i]; if ((m[2] && m[2](el)) || m[1].test(lt)) return m[0]; }
    if (tag === 'textarea') return 'notes';
    return null;
  }
  function mapForm(form) {
    var out = {}, els = form.querySelectorAll('input, select, textarea');
    for (var i = 0; i < els.length; i++) { var f = fieldFor(els[i]); if (f && out[f] == null) out[f] = els[i]; }
    return out;
  }
  function formText(form) {
    var t = (form.getAttribute('aria-label') || '') + ' ' + (form.className || '') + ' ';
    try { var btn = form.querySelector('[type=submit], button'); if (btn) t += ' ' + (btn.textContent || ''); } catch (e) {}
    try { var near = form.closest && form.closest('section, article, div'); if (near) { var hd = near.querySelector('h1, h2, h3, h4'); if (hd) t += ' ' + (hd.textContent || ''); } } catch (e) {}
    return t.toLowerCase();
  }
  function looksBookable(form, fields) {
    var hasWho = !!(fields.name || fields.email);
    var hasWhen = !!(fields.start || fields.asset);
    var bookish = /book|reserv|\brent\b|avail|quote|enquir|inquir|schedule/i.test(formText(form));
    return hasWho && (hasWhen || bookish);
  }
  function readMapped(fields) {
    var out = {};
    for (var k in fields) { if (!fields.hasOwnProperty(k)) continue; var el = fields[k]; var v = (el && el.value != null) ? String(el.value).trim() : ''; if (v !== '') out[k] = v; }
    return out;
  }
  function wireAutoForm(form) {
    if (form.__atlasWired) return false;
    if (!looksBookable(form, mapForm(form))) return false;
    form.__atlasWired = true;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      var payload = readMapped(mapForm(form)); payload.slug = cleanSlug(DEFAULT_SLUG);
      if (!payload.name && !payload.email) { msg(form, 'Please add your name and email.', false); return; }
      var btn = form.querySelector('[type="submit"], button:not([type="button"])');
      var label = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      msg(form, '', true);
      book(payload).then(function (j) {
        if (j.payUrl) { window.location.href = j.payUrl; return; }
        try { form.reset(); } catch (e) {}
        msg(form, j.message || (j.confirmed ? 'Your booking is confirmed.' : 'Booking request received.'), true);
        if (j.portal) {
          var a = document.createElement('a'); a.href = j.portal; a.textContent = 'Sign & manage your booking';
          a.style.cssText = 'display:inline-block;margin-top:8px;font:600 14px system-ui;color:#146c43;';
          var mm = form.querySelector('[data-atlas-message]'); if (mm) mm.appendChild(document.createElement('br')), mm.appendChild(a);
        }
        if (typeof window.atlasOnBooked === 'function') { try { window.atlasOnBooked(j); } catch (e) {} }
      }).catch(function (err) {
        var em = (err && err.message) || 'Something went wrong';
        if (/fetch/i.test(em)) { em = 'Booking is temporarily unavailable. Please try again or contact us.'; console.warn('[atlas-embed] request blocked. Add this site to the allowed list in Atlas: Settings > Add booking to your site (origin: ' + window.location.origin + ').'); }
        msg(form, em, false);
      }).then(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
    }, true);
    return true;
  }
  function isDeadCta(el) {
    if (el.__atlasWired) return false;
    var txt = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
    if (!/book|reserv|\brent\b|avail|get started|request a|enquir|inquir/i.test(txt)) return false;
    if (el.closest && el.closest('form')) return false;              // a submit button inside a form is handled by form wiring
    if (el.getAttribute('onclick')) return false;                    // never override the site's own handler
    if ((el.tagName || '').toLowerCase() === 'a') { var href = (el.getAttribute('href') || '').trim(); if (href && href !== '#' && !/^javascript:/i.test(href)) return false; }  // never override a real link
    return true;
  }
  function wireAutoButton(el) {
    if (el.__atlasWired) return false; el.__atlasWired = true;
    el.addEventListener('click', function (ev) { ev.preventDefault(); window.open(bookUrl(cleanSlug(DEFAULT_SLUG)), '_blank', 'noopener'); });
    return true;
  }
  function autoScan() {
    var n = 0, forms = document.querySelectorAll('form:not([data-atlas-ignore])');
    for (var i = 0; i < forms.length; i++) { if (wireAutoForm(forms[i])) n++; }
    var cands = document.querySelectorAll('a, button');
    for (var j = 0; j < cands.length; j++) { if (isDeadCta(cands[j])) wireAutoButton(cands[j]); }
    return n;
  }
  var _obs = null;
  function observe() {
    if (_obs || typeof MutationObserver === 'undefined') return;
    try {
      _obs = new MutationObserver(function () { autoScan(); });
      _obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
      var tries = [400, 1200, 3000, 6000]; for (var i = 0; i < tries.length; i++) setTimeout(autoScan, tries[i]);   // builders inject forms after load
      setTimeout(function () { try { if (_obs) { _obs.disconnect(); _obs = null; } } catch (e) {} }, 15000);         // then stop observing to stay light
    } catch (e) {}
  }

  // ---- wire explicit markers first; if the page has none (and auto is not disabled), fall back to AUTO MODE ----
  function scan() {
    var forms = document.querySelectorAll('[data-atlas-form]'); for (var i = 0; i < forms.length; i++) wireForm(forms[i]);
    var btns = document.querySelectorAll('[data-atlas-book]'); for (var j = 0; j < btns.length; j++) wireButton(btns[j]);
    var manual = SELF && (SELF.getAttribute('data-atlas-manual') != null || SELF.getAttribute('data-atlas-auto') === 'off');
    if (!manual && !forms.length && !btns.length) { autoScan(); observe(); }
  }

  window.AtlasBooking = { book: book, openPopup: openPopup, scan: scan, autoScan: autoScan };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();
