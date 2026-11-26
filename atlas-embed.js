/*! Atlas Rental.io embed v1 -- connect your own website to Atlas bookings.
 *
 * Add once, before </body>:
 *   <script src="https://atlasrental.io/atlas-embed.js" data-atlas-slug="YOUR-SLUG" defer></script>
 * (find YOUR-SLUG in Atlas: Settings > Add booking to your site.)
 *
 * Then EITHER:
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

  function scan() {
    var forms = document.querySelectorAll('[data-atlas-form]'); for (var i = 0; i < forms.length; i++) wireForm(forms[i]);
    var btns = document.querySelectorAll('[data-atlas-book]'); for (var j = 0; j < btns.length; j++) wireButton(btns[j]);
  }

  window.AtlasBooking = { book: book, openPopup: openPopup, scan: scan };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();
