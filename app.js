(function () {
  'use strict';

  var CFG = window.TOUCHE_CONFIG || {};
  var C = window.TOUCHE_CONTENT || {};
  var KEY = 'touche-member-v1';
  var SUPABASE_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  var app = document.getElementById('app');
  var nav = document.getElementById('nav');

  var cloud = null;      // Supabase client when sign-in is turned on
  var session = null;    // signed-in session (cloud mode only)
  var member = null;     // the patron's profile
  var tab = 'home';
  var notice = '';
  var linkSentTo = '';

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function newCode() {
    var letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 6; i++) out += letters.charAt(Math.floor(Math.random() * letters.length));
    return out;
  }

  function blankMember() {
    return {
      name: '', usual: '', code: newCode(),
      joined: new Date().toISOString().slice(0, 10),
      stamps: {}, rsvp: false, draw: false, gift: false
    };
  }

  function niceDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Pugo, Touché's mascot. Poses: 'hello', 'calm', 'surprised'.
  function pugo(size, pose) {
    return '<img class="pugo" src="pugo-' + pose + '.png" alt="" width="' + size + '" style="width:' + size + 'px">';
  }

  /* ---------- saving ---------- */

  function localLoad() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function localSave() {
    try { window.localStorage.setItem(KEY, JSON.stringify(member)); }
    catch (e) { notice = 'This browser is not letting us save. Your journal will reset when you close the page.'; }
  }

  function localClear() {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* nothing to clear */ }
  }

  async function cloudStamps() {
    var r = await cloud.from('stamps').select('stamp_id').eq('member_id', session.user.id);
    if (r.error) throw r.error;
    var map = {};
    (r.data || []).forEach(function (x) { map[x.stamp_id] = true; });
    return map;
  }

  async function cloudLoad() {
    var r = await cloud.from('members').select('*').eq('id', session.user.id).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) return null;
    return {
      name: r.data.name || '', usual: r.data.usual || '', joined: r.data.joined, code: r.data.code,
      stamps: await cloudStamps(), rsvp: !!r.data.rsvp, draw: !!r.data.draw, gift: !!r.data.gift
    };
  }

  // Stamps are not saved from here: only staff can add them, from the staff page.
  async function cloudSave() {
    var r = await cloud.from('members').upsert({
      id: session.user.id, email: session.user.email, name: member.name, usual: member.usual,
      code: member.code, joined: member.joined, rsvp: member.rsvp, draw: member.draw, gift: member.gift
    });
    if (r.error) throw r.error;
  }

  function save() {
    if (!cloud) { localSave(); return; }
    cloudSave().catch(function () {
      notice = 'We could not save that just now. Check your connection and try again.';
      render();
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  /* ---------- screens ---------- */

  function noticeHtml() {
    return notice ? '<p class="notice" role="status">' + esc(notice) + '</p>' : '';
  }

  function viewSignIn() {
    if (linkSentTo) {
      return '<div class="stack">' + pugo(130, 'calm') +
        '<h1>Check your email</h1>' +
        '<p class="muted">We sent a sign-in link to ' + esc(linkSentTo) + '. Open it on this device and you are in.</p>' +
        '<button type="button" class="btn quiet" data-act="resetlink">Use a different email</button></div>';
    }
    return '<form class="stack" data-form="signin">' + pugo(130, 'hello') +
      '<div class="stack-xs"><h1>The regulars\' corner</h1>' +
      '<p class="muted">For the people who keep coming back to the woods. New or returning, enter your email and we will send you a link. No password needed.</p></div>' +
      noticeHtml() +
      '<label>Email<input type="email" name="email" required autocomplete="email" inputmode="email"></label>' +
      '<button type="submit" class="btn">Email me a link</button></form>';
  }

  function viewJoin() {
    var options = (C.usuals || []).map(function (u) {
      return '<option value="' + esc(u) + '">' + esc(u) + '</option>';
    }).join('');
    return '<form class="stack" data-form="join">' + pugo(130, 'hello') +
      '<div class="stack-xs"><h1>Pull up a seat</h1>' +
      '<p class="muted">Join the regulars\' corner of Touché. It takes a few seconds.</p></div>' +
      noticeHtml() +
      '<label>What should we call you?<input type="text" name="name" required maxlength="40" autocomplete="given-name"></label>' +
      '<label>Your usual<select name="usual"><option value="">Still deciding</option>' + options + '</select></label>' +
      '<label class="check"><input type="checkbox" name="ok" required><span>' + esc(C.privacy || 'I agree to Touché keeping my name and journal for this members\' corner.') + '</span></label>' +
      '<button type="submit" class="btn">Join the regulars</button></form>';
  }

  function viewHome() {
    var s = C.surprise || {};
    var gift = member.gift
      ? '<div class="row">' + pugo(84, 'surprised') + '<div class="stack-xs"><p class="display">' + esc(s.perk) + '</p><p class="muted">' + esc(s.how) + '</p></div></div>'
      : '<p class="display">' + esc(s.lead) + '</p><button type="button" class="btn" data-act="gift">Open it</button>';

    var events = (C.events || []).map(function (e) {
      return '<div class="outline between"><div class="stack-xs"><strong>' + esc(e.title) + '</strong>' +
        '<span class="muted small">' + esc(e.note) + '</span></div><span class="when">' + esc(e.when) + '</span></div>';
    }).join('');

    var news = (C.news || []).map(function (n) {
      return '<div class="outline stack-xs"><strong>' + esc(n.title) + '</strong><span class="muted small">' + esc(n.note) + '</span></div>';
    }).join('');

    var pick = C.pugoPick || {};
    return '<div class="row">' + pugo(96, 'hello') +
      '<div class="stack-xs"><span class="muted small">Welcome back to the woods</span><h1>Hi, ' + esc(member.name) + '</h1></div></div>' +
      noticeHtml() +
      '<section class="panel stack-s"><span class="eyebrow hot">Pugo left you something</span>' + gift + '</section>' +
      (events ? '<section class="stack-s"><h2>This week at Touché</h2>' + events + '</section>' : '') +
      (pick.title ? '<section class="paper stack-xs"><span class="eyebrow">Pugo\'s Pick</span><p class="display big">' + esc(pick.title) + '</p><p class="small">' + esc(pick.note) + '</p></section>' : '') +
      (news ? '<section class="stack-s"><h2>News from the cabin</h2>' + news + '</section>' : '');
  }

  function viewJournal() {
    var list = C.stamps || [];
    var count = 0;
    var cells = list.map(function (st) {
      var on = !!member.stamps[st.id];
      if (on) count += 1;
      return '<button type="button" class="stamp" data-act="stamp" data-id="' + esc(st.id) + '" aria-pressed="' + on + '">' +
        '<strong>' + esc(st.label) + '</strong><span>' + (on ? 'Stamped' : (cloud ? 'Ask your barista' : 'Tap to stamp')) + '</span></button>';
    }).join('');
    return '<div class="stack-xs"><h1>Your trail journal</h1>' +
      '<p class="muted">Stamps are for moments here, not for money spent. ' + count + ' of ' + list.length + ' collected.</p></div>' +
      noticeHtml() +
      '<div class="stamps">' + cells + '</div>' +
      '<div class="outline stack-xs"><span class="eyebrow">Your usual</span><strong>' + esc(member.usual || 'Still deciding') + '</strong></div>';
  }

  function viewSip() {
    var f = C.firstSip || {};
    var d = C.draw || {};
    var fresh = (C.fresh || []).map(function (n) {
      return '<div class="outline stack-xs"><strong>' + esc(n.title) + '</strong><span class="muted small">' + esc(n.note) + '</span></div>';
    }).join('');
    return '<div class="stack-xs"><h1>First Sip Club</h1>' +
      '<p class="muted">Taste what\'s coming before anyone else, then tell us what you think.</p></div>' +
      noticeHtml() +
      '<section class="panel stack-s"><span class="eyebrow hot">Not on the menu yet</span>' +
      '<p class="display big">' + esc(f.name) + '</p><p class="muted">' + esc(f.note) + '</p>' +
      '<button type="button" class="btn' + (member.rsvp ? ' ghost' : '') + '" data-act="rsvp" aria-pressed="' + !!member.rsvp + '">' +
      (member.rsvp ? 'You are on the list' : 'Save me a first sip') + '</button></section>' +
      '<section class="outline stack-s" style="padding:18px;border-radius:18px"><span class="eyebrow">Members\' draw</span>' +
      '<p class="display big">This month: ' + esc(d.prize) + '</p><p class="muted">' + esc(d.note) + '</p>' +
      '<button type="button" class="btn ' + (member.draw ? 'ghost' : 'light') + '" data-act="draw" aria-pressed="' + !!member.draw + '">' +
      (member.draw ? 'Your name is in' : 'Put my name in') + '</button></section>' +
      (fresh ? '<section class="stack-s"><h2>New on the brew bar</h2>' + fresh + '</section>' : '');
  }

  function qrHtml(text) {
    try {
      if (typeof window.qrcode === 'function') {
        var q = window.qrcode(0, 'M');
        q.addData(text);
        q.make();
        return q.createSvgTag({ cellSize: 4, margin: 0 });
      }
    } catch (e) { /* fall through to the plain code */ }
    return esc(member.code);
  }

  function viewCard() {
    return '<h1>Your member card</h1>' + noticeHtml() +
      '<section class="paper stack"><div class="between"><div class="stack-xs">' +
      '<span class="eyebrow">Touché regular</span><p class="display big" style="font-size:27px">' + esc(member.name) + '</p>' +
      '<span class="small">Part of the woods since ' + esc(niceDate(member.joined)) + '</span></div>' +
      pugo(84, 'calm') + '</div>' +
      '<div class="qr" role="img" aria-label="Your member code as a QR code">' + qrHtml('touche:' + member.code) + '</div>' +
      '<p class="small">Member code <span class="code">' + esc(member.code) + '</span></p></section>' +
      '<p class="muted">Show this at the counter. To keep it handy, use your browser\'s "Add to Home Screen".</p>' +
      (cloud ? '<button type="button" class="btn quiet" data-act="signout">Sign out</button>' : '') +
      '<button type="button" class="btn quiet" data-act="leave">Leave the club and erase my journal</button>';
  }

  function render() {
    var html;
    var inside = false;
    if (cloud && !session) html = viewSignIn();
    else if (!member || !member.name) html = viewJoin();
    else {
      inside = true;
      html = tab === 'journal' ? viewJournal() : tab === 'sip' ? viewSip() : tab === 'card' ? viewCard() : viewHome();
    }
    app.innerHTML = html;
    nav.hidden = !inside;
    var buttons = nav.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute('data-tab') === tab) buttons[i].setAttribute('aria-current', 'page');
      else buttons[i].removeAttribute('aria-current');
    }
    notice = '';
  }

  /* ---------- actions ---------- */

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');

    if (act === 'tab') {
      tab = el.getAttribute('data-tab'); render(); window.scrollTo(0, 0);
      if (cloud && session && member && tab === 'journal') {
        cloudStamps().then(function (map) { member.stamps = map; if (tab === 'journal') render(); }).catch(function () {});
      }
      return;
    }
    if (act === 'resetlink') { linkSentTo = ''; render(); return; }
    if (!member && act !== 'signout') return;

    if (act === 'gift') { member.gift = true; save(); render(); }
    else if (act === 'stamp') {
      if (cloud) {
        notice = 'Show your member card at the counter and your barista will stamp this for you.';
        render(); return;
      }
      var id = el.getAttribute('data-id');
      if (member.stamps[id]) delete member.stamps[id]; else member.stamps[id] = true;
      save(); render();
    }
    else if (act === 'rsvp') { member.rsvp = !member.rsvp; save(); render(); }
    else if (act === 'draw') { member.draw = true; save(); render(); }
    else if (act === 'signout') {
      cloud.auth.signOut().then(function () { session = null; linkSentTo = ''; member = null; tab = 'home'; render(); });
    }
    else if (act === 'leave') {
      if (el.getAttribute('data-sure') !== 'yes') {
        el.setAttribute('data-sure', 'yes');
        el.textContent = 'Tap again to erase everything';
        return;
      }
      leave();
    }
  });

  async function leave() {
    try {
      if (cloud && session) {
        var r = await cloud.from('members').delete().eq('id', session.user.id);
        if (r.error) throw r.error;
        await cloud.auth.signOut();
        session = null;
        linkSentTo = '';
      }
      localClear();
      member = null; tab = 'home';
      notice = 'Your journal has been erased. You are welcome back any time.';
    } catch (e) {
      notice = 'We could not erase your journal just now. Please try again.';
    }
    render();
  }

  app.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.target;
    var kind = form.getAttribute('data-form');

    if (kind === 'join') {
      var name = form.elements.name.value.trim();
      if (!name) return;
      member = member || blankMember();
      member.name = name;
      member.usual = form.elements.usual.value;
      if (!cloud && !member.stamps.visit && (C.stamps || []).some(function (s) { return s.id === 'visit'; })) member.stamps.visit = true;
      save(); tab = 'home'; render();
    }

    if (kind === 'signin') {
      var email = form.elements.email.value.trim();
      if (!email) return;
      var here = window.location.origin + window.location.pathname;
      cloud.auth.signInWithOtp({ email: email, options: { emailRedirectTo: here } }).then(function (r) {
        if (r.error) notice = 'We could not send the link. Check the email address and try again.';
        else linkSentTo = email;
        render();
      });
    }
  });

  /* ---------- start ---------- */

  async function start() {
    if (CFG.supabaseUrl && CFG.supabaseAnonKey) {
      try {
        await loadScript(SUPABASE_SRC);
        cloud = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
        var got = await cloud.auth.getSession();
        session = got.data.session;
        if (session) member = await cloudLoad();
        cloud.auth.onAuthStateChange(function (event, next) {
          var wasIn = !!session;
          session = next;
          if (next) linkSentTo = '';
          if (!wasIn && next) {
            cloudLoad().then(function (m) { member = m; render(); })
              .catch(function () { notice = 'We could not load your journal. Please refresh.'; render(); });
          }
        });
      } catch (e) {
        cloud = null; session = null;
        member = localLoad();
        notice = 'Sign-in is unavailable right now, so your journal is being kept on this device.';
      }
    } else {
      member = localLoad();
    }
    render();
  }

  start();
})();
