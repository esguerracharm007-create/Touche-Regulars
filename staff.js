(function () {
  'use strict';

  var CFG = window.TOUCHE_CONFIG || {};
  var C = window.TOUCHE_CONTENT || {};
  var SUPABASE_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  var app = document.getElementById('app');

  var cloud = null;
  var session = null;
  var isStaff = false;
  var tab = 'stamp';       // 'stamp' or 'members'
  var notice = '';
  var linkSentTo = '';
  var current = null;      // member being stamped: { row, stamps: {id: true} }
  var members = null;      // full list for the Members tab
  var stampCounts = {};
  var search = '';
  var scanner = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function noticeHtml() {
    return notice ? '<p class="notice" role="status">' + esc(notice) + '</p>' : '';
  }

  /* ---------- data ---------- */

  async function findByCode(raw) {
    var code = String(raw || '').trim().toUpperCase().replace(/^TOUCHE:/, '');
    if (!code) return;
    var r = await cloud.from('members').select('*').eq('code', code).maybeSingle();
    if (r.error) { notice = 'Could not look that up. Check the connection and try again.'; render(); return; }
    if (!r.data) { notice = 'No member has the code ' + code + '.'; current = null; render(); return; }
    await openMember(r.data);
  }

  async function openMember(row) {
    var s = await cloud.from('stamps').select('stamp_id').eq('member_id', row.id);
    var map = {};
    (s.data || []).forEach(function (x) { map[x.stamp_id] = true; });
    current = { row: row, stamps: map };
    tab = 'stamp';
    render();
    window.scrollTo(0, 0);
  }

  async function toggleStamp(id) {
    if (!current) return;
    var r;
    if (current.stamps[id]) {
      r = await cloud.from('stamps').delete().eq('member_id', current.row.id).eq('stamp_id', id);
      if (!r.error) delete current.stamps[id];
    } else {
      r = await cloud.from('stamps').insert({ member_id: current.row.id, stamp_id: id, stamped_by: session.user.email });
      if (!r.error) current.stamps[id] = true;
    }
    if (r.error) notice = 'That stamp did not save. Try again.';
    members = null; // refresh counts next time the list opens
    render();
  }

  async function loadMembers() {
    var m = await cloud.from('members').select('*').order('joined', { ascending: false });
    var s = await cloud.from('stamps').select('member_id');
    if (m.error || s.error) { notice = 'Could not load the member list.'; members = []; render(); return; }
    members = m.data || [];
    stampCounts = {};
    (s.data || []).forEach(function (x) { stampCounts[x.member_id] = (stampCounts[x.member_id] || 0) + 1; });
    render();
  }

  function downloadCsv() {
    var head = ['Name', 'Email', 'Usual', 'Member code', 'Joined', 'Stamps', 'First sip', 'In the draw'];
    var lines = [head].concat((members || []).map(function (m) {
      return [m.name, m.email, m.usual, m.code, m.joined, stampCounts[m.id] || 0, m.rsvp ? 'yes' : 'no', m.draw ? 'yes' : 'no'];
    })).map(function (row) {
      return row.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(',');
    });
    var blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'touche-members.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- camera ---------- */

  function stopScanner() {
    if (!scanner) return Promise.resolve();
    var s = scanner; scanner = null;
    return s.stop().catch(function () {}).then(function () { try { s.clear(); } catch (e) { /* already gone */ } });
  }

  function startScanner() {
    if (typeof window.Html5Qrcode !== 'function') {
      notice = 'The camera scanner could not load. Type the member code instead.';
      render(); return;
    }
    var holder = document.getElementById('reader');
    if (!holder) return;
    scanner = new window.Html5Qrcode('reader');
    scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, function (text) {
      stopScanner().then(function () { findByCode(text); });
    }, function () { /* no code in this frame */ }).catch(function () {
      scanner = null;
      notice = 'The camera did not open. Allow camera access, or type the member code instead.';
      render();
    });
  }

  /* ---------- screens ---------- */

  function viewSignIn() {
    if (linkSentTo) {
      return '<div class="stack"><h1>Check your email</h1><p class="muted">We sent a sign-in link to ' + esc(linkSentTo) +
        '. Open it on this device.</p><button type="button" class="btn quiet" data-act="resetlink">Use a different email</button></div>';
    }
    return '<form class="stack" data-form="signin"><div class="stack-xs"><h1>Touché staff</h1>' +
      '<p class="muted">Sign in with your staff email.</p></div>' + noticeHtml() +
      '<label>Email<input type="email" name="email" required autocomplete="email" inputmode="email"></label>' +
      '<button type="submit" class="btn">Email me a sign-in link</button></form>';
  }

  function viewNotStaff() {
    return '<div class="stack"><h1>This door is for staff</h1><p class="muted">' + esc(session.user.email) +
      ' is not on the staff list yet. Ask the owner to add it.</p>' +
      '<a class="btn ghost" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="./">Go to the members\' site</a>' +
      '<button type="button" class="btn quiet" data-act="signout">Sign out</button></div>';
  }

  function viewStamp() {
    var html = '<form class="stack-s" data-form="code"><label>Member code' +
      '<input type="text" name="code" autocomplete="off" autocapitalize="characters" maxlength="12" placeholder="e.g. BP7FDA"></label>' +
      '<div class="pair"><button type="submit" class="btn">Find member</button>' +
      '<button type="button" class="btn ghost" data-act="scan">Scan their card</button></div></form>' +
      '<div id="reader"></div>';

    if (current) {
      var m = current.row;
      var cells = (C.stamps || []).map(function (st) {
        var on = !!current.stamps[st.id];
        return '<button type="button" class="stamp" data-act="stamp" data-id="' + esc(st.id) + '" aria-pressed="' + on + '">' +
          '<strong>' + esc(st.label) + '</strong><span>' + (on ? 'Stamped. Tap to undo' : 'Tap to stamp') + '</span></button>';
      }).join('');
      html += '<section class="paper stack-xs"><span class="eyebrow">Member</span><p class="display big">' + esc(m.name) + '</p>' +
        '<span class="small">Usual: ' + esc(m.usual || 'still deciding') + ' · Since ' + esc(m.joined) + ' · Code ' + esc(m.code) + '</span>' +
        '<span class="small">' + (m.rsvp ? 'Wants a first sip. ' : '') + (m.draw ? 'In the draw. ' : '') + (m.gift ? 'Opened Pugo\'s surprise.' : '') + '</span></section>' +
        '<div class="stamps">' + cells + '</div>';
    }
    return html;
  }

  function viewMembers() {
    if (members === null) { loadMembers(); return '<p class="muted">Loading members…</p>'; }
    var q = search.trim().toLowerCase();
    var rows = members.filter(function (m) {
      return !q || [m.name, m.email, m.code, m.usual].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var body = rows.map(function (m) {
      return '<tr><td><strong>' + esc(m.name) + '</strong></td><td>' + esc(m.email) + '</td><td>' + esc(m.usual) + '</td><td>' + esc(m.joined) +
        '</td><td>' + (stampCounts[m.id] || 0) + '</td><td>' + (m.rsvp ? 'Yes' : '') + '</td><td>' + (m.draw ? 'Yes' : '') +
        '</td><td><button type="button" data-act="open" data-id="' + esc(m.id) + '">Open</button></td></tr>';
    }).join('');
    return '<div class="between" style="align-items:center"><p class="muted">' + members.length + ' members</p></div>' +
      '<label>Search<input type="text" id="search" value="' + esc(search) + '" placeholder="Name, email, code, or usual"></label>' +
      '<div class="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Usual</th><th>Joined</th><th>Stamps</th><th>First sip</th><th>Draw</th><th></th></tr></thead>' +
      '<tbody>' + (body || '<tr><td colspan="8" class="muted">No members match.</td></tr>') + '</tbody></table></div>' +
      '<button type="button" class="btn ghost" data-act="csv">Download the list (CSV)</button>';
  }

  function render() {
    var html;
    if (!cloud) {
      html = '<div class="stack"><h1>Touché staff</h1><p class="muted">Sign-in is not set up yet. Add the two Supabase values to config.js (see README.md) and this page will switch on.</p>' + noticeHtml() + '</div>';
    } else if (!session) html = viewSignIn();
    else if (!isStaff) html = viewNotStaff();
    else {
      html = '<div class="between" style="align-items:center"><h1>Touché staff</h1>' +
        '<button type="button" class="btn quiet" style="width:auto" data-act="signout">Sign out</button></div>' +
        '<div class="tabs"><button type="button" data-act="tab" data-tab="stamp"' + (tab === 'stamp' ? ' aria-current="page"' : '') + '>Stamp a card</button>' +
        '<button type="button" data-act="tab" data-tab="members"' + (tab === 'members' ? ' aria-current="page"' : '') + '>Members</button></div>' +
        noticeHtml() + (tab === 'members' ? viewMembers() : viewStamp());
    }
    app.innerHTML = html;
    notice = '';
    var box = document.getElementById('search');
    if (box && search) { box.focus(); box.setSelectionRange(search.length, search.length); }
  }

  /* ---------- actions ---------- */

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'resetlink') { linkSentTo = ''; render(); }
    else if (act === 'signout') { stopScanner(); cloud.auth.signOut().then(function () { session = null; linkSentTo = ''; isStaff = false; current = null; members = null; render(); }); }
    else if (act === 'tab') { stopScanner(); tab = el.getAttribute('data-tab'); if (tab === 'members') members = null; render(); }
    else if (act === 'scan') { stopScanner().then(startScanner); }
    else if (act === 'stamp') { toggleStamp(el.getAttribute('data-id')); }
    else if (act === 'csv') { downloadCsv(); }
    else if (act === 'open') {
      var id = el.getAttribute('data-id');
      var row = (members || []).filter(function (m) { return m.id === id; })[0];
      if (row) openMember(row);
    }
  });

  app.addEventListener('input', function (ev) {
    if (ev.target.id === 'search') { search = ev.target.value; render(); }
  });

  app.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var kind = ev.target.getAttribute('data-form');
    if (kind === 'code') { stopScanner(); findByCode(ev.target.elements.code.value); }
    if (kind === 'signin') {
      var email = ev.target.elements.email.value.trim();
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

  async function checkStaff() {
    var r = await cloud.rpc('is_staff');
    isStaff = !r.error && r.data === true;
  }

  async function start() {
    if (CFG.supabaseUrl && CFG.supabaseAnonKey) {
      try {
        await loadScript(SUPABASE_SRC);
        cloud = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
        var got = await cloud.auth.getSession();
        session = got.data.session;
        if (session) await checkStaff();
        cloud.auth.onAuthStateChange(function (event, next) {
          var wasIn = !!session;
          session = next;
          if (next) linkSentTo = '';
          if (!wasIn && next) checkStaff().then(render);
        });
      } catch (e) {
        cloud = null;
        notice = 'The staff page could not connect. Check your internet connection and refresh.';
      }
    }
    render();
  }

  start();
})();
