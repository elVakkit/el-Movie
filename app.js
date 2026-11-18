// el Movies - film listesi. Her şey telefonda saklanır; sunucuya hiçbir şey gönderilmez.
(function () {
'use strict';

var DB_NAME = 'el-movies', STORE = 'kv', KEY = 'films', LKEY = 'el-movies-films';
var coll = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
var TR = 'ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZ';
var items = [];
var ui = { q: '', filter: 'all' };
var status = '', saveTimer = null;
var root = document.getElementById('root');

function ls(fn) { try { return fn(); } catch (e) { return null; } }

// ---------------- kalıcı kayıt (IndexedDB + yedek olarak localStorage) ----------------
var dbP = null;
function db() {
  if (dbP) return dbP;
  dbP = new Promise(function (res, rej) {
    if (!window.indexedDB) { rej(new Error('no idb')); return; }
    var r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
  return dbP;
}
function idbGet() {
  return db().then(function (d) {
    return new Promise(function (res, rej) {
      var q = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      q.onsuccess = function () { res(q.result || null); };
      q.onerror = function () { rej(q.error); };
    });
  });
}
function idbPut(v) {
  return db().then(function (d) {
    return new Promise(function (res, rej) {
      var tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(v, KEY);
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  });
}
function load() {
  var local = ls(function () { return JSON.parse(localStorage.getItem(LKEY)); });
  return idbGet().catch(function () { return null; }).then(function (fromDb) {
    // ikisinden daha yeni olanı kullan
    var best = fromDb;
    if (local && (!best || (local.ts || 0) > (best.ts || 0))) best = local;
    if (best && Array.isArray(best.items)) return best.items;
    return null; // hiç kayıt yok: ilk açılış
  });
}
function saveNow() {
  clearTimeout(saveTimer);
  var v = { ts: Date.now(), items: items };
  ls(function () { localStorage.setItem(LKEY, JSON.stringify(v)); });
  return idbPut(v).then(function () { setStatus('Kaydedildi', ''); },
    function () {
      var okLocal = ls(function () { return localStorage.getItem(LKEY) !== null; });
      setStatus(okLocal ? 'Kaydedildi' : 'Kaydedilemedi — yedek al', okLocal ? '' : 'err');
    });
}
function changed() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
document.addEventListener('visibilitychange', function () { if (document.hidden && saveTimer) saveNow(); });
window.addEventListener('pagehide', function () { if (saveTimer) saveNow(); });

// ---------------- yardımcılar ----------------
function key(t) { return t.replace(/^[\s"'“‘(\[¿¡]+/, ''); }
function isNum(t) { return /^[0-9]/.test(key(t)); }
function sortItems(a) {
  return a.slice().sort(function (x, y) {
    var nx = isNum(x.t), ny = isNum(y.t);
    if (nx !== ny) return nx ? 1 : -1;
    return coll.compare(key(x.t), key(y.t));
  });
}
function letter(t) {
  var k = key(t); if (!k) return '#';
  var c = k.charAt(0);
  if (/[0-9]/.test(c)) return '0–9';
  var u = c.toLocaleUpperCase('tr');
  if (TR.indexOf(u) >= 0) return u;
  var b = u.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return TR.indexOf(b) >= 0 ? b : '#';
}
function norm(s) { return s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i'); }
function h(tag, attrs, kids) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === 'on') { for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]); }
    else if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function setStatus(t, c) { status = t; var e = document.getElementById('stat'); if (e) { e.textContent = t; e.className = 'st ' + (c || ''); } }
function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

// ---------------- görünüm ----------------
function counts() { var w = 0, f = 0; items.forEach(function (o) { if (o.w) w++; if (o.f) f++; }); return { all: items.length, w: w, u: items.length - w, f: f }; }
function visible() {
  var q = norm(ui.q.trim());
  return sortItems(items).filter(function (o) {
    if (ui.filter === 'w' && !o.w) return false;
    if (ui.filter === 'u' && o.w) return false;
    if (ui.filter === 'f' && !o.f) return false;
    return !q || norm(o.t).indexOf(q) >= 0;
  });
}

var listEl, idxEl, statsEl;
function render() {
  root.innerHTML = '';
  statsEl = h('div', { class: 'stats' });
  var search = h('input', { class: 'search', type: 'search', placeholder: 'Film ara', value: ui.q, on: { input: function (e) { ui.q = e.target.value; renderList(); } } });
  var chips = h('div', { class: 'chips' }, [['all', 'Tümü'], ['u', 'İzlenecek'], ['w', 'İzlendi'], ['f', '★ Favori']].map(function (p) {
    return h('button', { class: 'chip' + (ui.filter === p[0] ? ' on' : ''), text: p[1], on: { click: function () { ui.filter = p[0]; render(); window.scrollTo(0, 0); } } });
  }));
  var brand = h('div', { class: 'brand' }, ['el ', h('span', { text: 'Movies' })]);
  var top = h('div', { class: 'top', id: 'top' }, [
    h('div', { class: 'row1' }, [h('div', null, [brand, h('div', { class: 'st', id: 'stat', text: status })]),
      h('button', { class: 'iconbtn', 'aria-label': 'Menü', text: '⋯', on: { click: openMenu } })]),
    statsEl, search, chips]);
  listEl = h('main'); idxEl = h('div', { class: 'idx' });
  root.appendChild(top); root.appendChild(listEl); root.appendChild(idxEl);
  root.appendChild(h('button', { class: 'fab', 'aria-label': 'Film ekle', text: '+', on: { click: function () { openEdit(null); } } }));
  root.appendChild(h('button', { class: 'fab2', text: '🎲 Ne izlesem?', on: { click: openPick } }));
  renderList();
  requestAnimationFrame(function () { document.documentElement.style.setProperty('--toph', top.offsetHeight + 'px'); });
}
function renderStats() {
  var c = counts();
  statsEl.innerHTML = '';
  [[c.all, 'film'], [c.w, 'izlendi'], [c.u, 'izlenecek'], [c.f, 'favori']].forEach(function (p) {
    statsEl.appendChild(h('span', null, [h('b', { text: String(p[0]) }), ' ' + p[1]]));
  });
}
function renderList() {
  renderStats();
  listEl.innerHTML = ''; idxEl.innerHTML = '';
  var v = visible();
  if (!v.length) { listEl.appendChild(h('div', { class: 'empty', text: items.length ? 'Eşleşen film yok.' : 'Henüz film yok. + ile ekle.' })); return; }
  var cur = null, letters = [], frag = document.createDocumentFragment();
  v.forEach(function (o) {
    var L = letter(o.t);
    if (L !== cur) { cur = L; letters.push(L); frag.appendChild(h('div', { class: 'grp', id: 'g-' + L, text: L })); }
    frag.appendChild(row(o));
  });
  listEl.appendChild(frag);
  if (!ui.q && letters.length > 4) letters.forEach(function (L) { idxEl.appendChild(h('span', { 'data-l': L, text: L === '0–9' ? '#' : L })); });
}
function row(o) {
  var el = h('div', { class: 'item' + (o.w ? ' w' : '') });
  var chk = h('button', { class: 'chk', 'aria-label': o.w ? 'İzlenmedi yap' : 'İzlendi yap', text: o.w ? '✓' : '', on: { click: function () {
    o.w = !o.w; el.className = 'item' + (o.w ? ' w' : ''); chk.textContent = o.w ? '✓' : ''; changed(); renderStats();
    if (ui.filter === 'w' || ui.filter === 'u') setTimeout(renderList, 350);
  } } });
  var star = h('button', { class: 'star' + (o.f ? ' on' : ''), 'aria-label': 'Favori', text: '★', on: { click: function () {
    o.f = !o.f; star.className = 'star' + (o.f ? ' on' : ''); changed(); renderStats();
    if (ui.filter === 'f') setTimeout(renderList, 350);
  } } });
  el.appendChild(chk);
  el.appendChild(h('button', { class: 'title', text: o.t, on: { click: function () { openEdit(o); } } }));
  el.appendChild(star);
  return el;
}

// sağ kenardaki harf dizini: dokun ya da parmağını kaydır
function jump(ev) {
  var t = ev.touches ? ev.touches[0] : ev;
  var e = document.elementFromPoint(t.clientX, t.clientY);
  if (!e || !e.getAttribute) return;
  var L = e.getAttribute('data-l'); if (!L) return;
  var g = document.getElementById('g-' + L);
  if (g) window.scrollTo(0, g.offsetTop - document.getElementById('top').offsetHeight);
  ev.preventDefault();
}
['touchstart', 'touchmove'].forEach(function (n) {
  document.addEventListener(n, function (e) { if (e.target.closest && e.target.closest('.idx')) jump(e); }, { passive: false });
});
document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.idx')) jump(e); });

// ---------------- alt pencereler ----------------
function sheet(kids) {
  var v = h('div', { class: 'veil' }), s = h('div', { class: 'sheet' }, kids);
  v.appendChild(s);
  v.addEventListener('click', function (e) { if (e.target === v) close(); });
  function close() { v.remove(); }
  document.body.appendChild(v);
  return close;
}
function sw(on, cb) {
  var e = h('button', { class: 'sw' + (on ? ' on' : ''), on: { click: function () { on = !on; e.className = 'sw' + (on ? ' on' : ''); cb(on); } } });
  return e;
}

function openEdit(o) {
  var isNew = !o, t = o ? o.t : '', w = o ? o.w : false, f = o ? o.f : false, delStep = false, close;
  var inp = h('input', { class: 'field', value: t, placeholder: 'Film adı', autocapitalize: 'words' });
  var warn = h('div', { class: 'warn' });
  function check() {
    var v = norm(inp.value.trim());
    var d = v && items.some(function (x) { return x !== o && norm(x.t) === v; });
    warn.textContent = d ? 'Bu film listede zaten var.' : '';
  }
  inp.addEventListener('input', check);
  function ok() {
    var v = inp.value.trim().replace(/\s+/g, ' ');
    if (!v) { inp.focus(); return; }
    if (isNew) { o = { t: v, w: w, f: f }; items.push(o); } else { o.t = v; o.w = w; o.f = f; }
    close(); changed(); renderList();
    if (isNew) {
      Array.prototype.some.call(listEl.querySelectorAll('.title'), function (b) {
        if (b.textContent === v) { b.scrollIntoView({ block: 'center' }); return true; }
      });
    }
  }
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok(); });
  var del = h('button', { class: 'b d', text: 'Sil', on: { click: function () {
    if (!delStep) { delStep = true; del.textContent = 'Emin misin? Tekrar dokun'; return; }
    items.splice(items.indexOf(o), 1); close(); changed(); renderList();
  } } });
  close = sheet([h('h2', { text: isNew ? 'Film ekle' : 'Filmi düzenle' }), inp, warn,
    h('div', { class: 'tog' }, ['İzledim', sw(w, function (v) { w = v; })]),
    h('div', { class: 'tog' }, ['Favori ★', sw(f, function (v) { f = v; })]),
    h('div', { class: 'btns' }, [isNew ? h('button', { class: 'b', text: 'Vazgeç', on: { click: function () { close(); } } }) : del,
      h('button', { class: 'b p', text: isNew ? 'Ekle' : 'Kaydet', on: { click: ok } })])]);
  check();
  if (isNew) setTimeout(function () { inp.focus(); }, 50);
}

function toText() {
  return '•FİLMLER\n' + sortItems(items).map(function (o) { return (o.w ? '✓' : '◦') + '\t' + o.t + (o.f ? '⭐️' : ''); }).join('\n') + '\n';
}

function openMenu() {
  var close = sheet([h('h2', { text: 'Menü' }),
    h('button', { class: 'menuitem', text: 'Yedek al', on: { click: function () { close(); openBackup(); } } }),
    h('button', { class: 'menuitem', text: 'Yedekten geri yükle / liste içe aktar', on: { click: function () { close(); openImport(); } } }),
    h('p', { class: 'note', text: 'Listen yalnızca bu telefonda, bu uygulamanın içinde saklanır ve her değişiklikte kendiliğinden kaydedilir. Telefonu değiştirirsen ya da uygulamayı ana ekrandan silersen liste de gider; bu yüzden ara sıra yedek al.' }),
    h('div', { class: 'btns' }, [h('button', { class: 'b', text: 'Kapat', on: { click: function () { close(); } } })])]);
}

function openBackup() {
  var name = 'el-movies-yedek-' + today() + '.txt';
  var text = toText();
  var msg = h('p', { class: 'note', text: '“Dosya olarak kaydet” ile yedeği Dosyalar’a ya da iCloud Drive’a kaydedebilirsin. “Kopyala” ile metni Notlar’a yapıştırabilirsin.' });
  var close;
  function asFile() {
    var file = null;
    try { file = new File([text], name, { type: 'text/plain' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'el Movies yedeği' }).then(function () { msg.textContent = 'Yedek paylaşıldı / kaydedildi.'; }, function (e) {
        if (e && e.name === 'AbortError') return;
        download();
      });
    } else download();
  }
  function download() {
    try {
      var url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      var a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      msg.textContent = 'Yedek dosyası indirildi.';
    } catch (e) { msg.textContent = 'Dosya kaydedilemedi; “Kopyala”yı kullan.'; }
  }
  function copy() {
    var fail = function () { msg.textContent = 'Kopyalanamadı.'; };
    try { navigator.clipboard.writeText(text).then(function () { msg.textContent = 'Kopyalandı. Notlar’a yapıştırabilirsin.'; }, fail); } catch (e) { fail(); }
  }
  close = sheet([h('h2', { text: 'Yedek al' }),
    h('p', { class: 'note', text: items.length + ' film. ✓ izlendi, ◦ izlenecek, ⭐️ favori.' }),
    h('button', { class: 'b p filebtn', text: 'Dosya olarak kaydet', on: { click: asFile } }),
    h('div', { class: 'btns' }, [h('button', { class: 'b', text: 'Kopyala', on: { click: copy } }), h('button', { class: 'b', text: 'Kapat', on: { click: function () { close(); } } })]),
    msg]);
}

function parseText(s) {
  s = (s || '').replace(/^﻿/, '').trim();
  if (!s) return [];
  if (s.charAt(0) === '[' || s.charAt(0) === '{') {
    try {
      var j = JSON.parse(s), a = Array.isArray(j) ? j : j.items;
      return a.map(function (o) { return { t: String(o.t || o.title || '').trim(), w: !!(o.w || o.watched), f: !!(o.f || o.fav) }; }).filter(function (o) { return o.t; });
    } catch (e) { }
  }
  var out = [];
  s.split(/\r?\n/).forEach(function (l) {
    l = l.trim();
    if (!l || l.charAt(0) === '•') return;
    var w = false, m = l.match(/^(✓|✔|☑|\[x\]|-\s*\[x\])\s*/i);
    if (m) { w = true; l = l.slice(m[0].length); }
    else { m = l.match(/^(◦|○|-|\*|☐|\[ \]|-\s*\[ \])\s*/); if (m) l = l.slice(m[0].length); }
    var f = /⭐️|⭐|❤️‍🔥|★/.test(l);
    l = l.replace(/⭐️|⭐|❤️‍🔥|★/g, '').replace(/\s+/g, ' ').trim();
    if (l) out.push({ t: l, w: w, f: f });
  });
  return out;
}

function openImport() {
  var ta = h('textarea', { class: 'field', placeholder: 'Yedek metnini ya da Notlar’daki ✓ / ◦ listesini buraya yapıştır' });
  var fileIn = h('input', { type: 'file', accept: '.txt,.json,text/plain,application/json', class: 'hidden' });
  fileIn.addEventListener('change', function () {
    var f = fileIn.files && fileIn.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { ta.value = String(r.result || ''); msg.textContent = parseText(ta.value).length + ' film okundu. Şimdi Birleştir ya da Değiştir’e dokun.'; };
    r.readAsText(f);
  });
  var msg = h('p', { class: 'note', text: 'Birleştir: yeni filmleri ekler, listede olanlara dokunmaz. Değiştir: listeyi tamamen bununla değiştirir (yedekten geri yüklerken bunu kullan).' });
  var close, repStep = false, rep;
  function go(replace) {
    var a = parseText(ta.value);
    if (!a.length) { msg.textContent = 'Metinde film bulunamadı.'; return; }
    if (replace) {
      if (!repStep) { repStep = true; rep.textContent = 'Emin misin? Tekrar dokun'; return; }
      items = a;
    } else {
      a.forEach(function (o) { var k = norm(o.t); if (!items.some(function (x) { return norm(x.t) === k; })) items.push(o); });
    }
    close(); saveNow(); render();
  }
  rep = h('button', { class: 'b p', text: 'Değiştir', on: { click: function () { go(true); } } });
  close = sheet([h('h2', { text: 'İçe aktar' }),
    h('button', { class: 'b filebtn', text: 'Yedek dosyası seç', on: { click: function () { fileIn.click(); } } }), fileIn,
    h('p', { class: 'note', text: 'ya da yapıştır:' }), ta, msg,
    h('div', { class: 'btns' }, [h('button', { class: 'b', text: 'Birleştir', on: { click: function () { go(false); } } }), rep]),
    h('div', { class: 'btns' }, [h('button', { class: 'b', text: 'Vazgeç', on: { click: function () { close(); } } })])]);
}

function openPick() {
  var pool = items.filter(function (o) { return !o.w; });
  var title = h('div', { class: 'pick' });
  function roll() { title.textContent = pool.length ? pool[Math.floor(Math.random() * pool.length)].t : 'İzlenecek film kalmamış!'; }
  roll();
  var close = sheet([h('p', { class: 'note', text: 'İzlenecekler listenden rastgele:' }), title,
    h('div', { class: 'btns' }, [h('button', { class: 'b', text: 'Kapat', on: { click: function () { close(); } } }), h('button', { class: 'b p', text: 'Başka', on: { click: roll } })])]);
}

// ---------------- başlangıç ----------------
load().then(function (saved) {
  if (saved) { items = saved; }
  else {
    items = (window.EL_SEED || []).map(function (o) { return { t: o.t, w: !!o.w, f: !!o.f }; });
    saveNow();
  }
  render();
});

// tarayıcıdan "kalıcı depolama" iste (veri silinmesin)
if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () { }); }

// internetsiz çalışma
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
}
})();
