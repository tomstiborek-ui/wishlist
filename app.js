/* Dárky — shared wish list for Bohoušek and Boženka.
   Data lives in Supabase (setup: gifts.sql). With an empty DB.url the site runs in demo mode (data in this browser only). */
"use strict";

const DB = { url: "https://qemmhggbpzicywjejtay.supabase.co", key: "sb_publishable_4Uvxd_75gAIi4ZdJZ7-1bQ_in6Y7SG9" };  // public (publishable) key
const BUCKET = "gift-photos";
const DEMO = !DB.url;

const PEOPLE = {
  bohousek: { name: "Bohoušek", acc: "Bohouška", gen: "Bohouška" },
  bozenka:  { name: "Boženka",  acc: "Boženku",  gen: "Boženky" },
};
const DEFAULT_CATS = ["Oblečení", "Elektronika", "Knihy", "Zážitky", "Domácnost", "Sport", "Kosmetika", "Šperky", "Hobby"];
const MAX_PHOTOS = 6;

/* ---------- small helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtPrice = p => p == null ? "" : new Intl.NumberFormat("cs-CZ").format(p) + " Kč";
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { v == null || v === "" ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
};
const domain = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return ""; } };
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (_) { return ""; } };
const photoSrc = p => /^(data:|https?:|blob:)/.test(p) ? p : `${DB.url}/storage/v1/object/public/${BUCKET}/${p.split("/").map(encodeURIComponent).join("/")}`;
let toastT;
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2400); }

/* ---------- photos: shrink to 1600 px, WebP where possible ---------- */
function shrinkPhoto(file, max = 1600) {
  return createImageBitmap(file).then(bmp => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => b && b.type === "image/webp" ? res(b) : c.toBlob(res, "image/jpeg", 0.85), "image/webp", 0.82));
  });
}
const blobToDataUrl = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

/* ---------- API: Supabase or local demo ---------- */
const auth = () => DB.key.startsWith("eyJ") ? { apikey: DB.key, Authorization: `Bearer ${DB.key}` } : { apikey: DB.key };
const hdr = () => ({ ...auth(), "Content-Type": "application/json" });
const rpc = (fn, body) => fetch(`${DB.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) })
  .then(r => r.ok ? (r.status === 204 ? null : r.json()) : r.text().then(t => Promise.reject(new Error(t || r.status))));

const remoteApi = {
  check: pass => rpc("gifts_check", { pass }),
  list: () => rpc("gifts_list", { pass: S.pass, viewer: "" }),
  save: (g, who) => rpc("gifts_save", { pass: S.pass, viewer: who, gift: g }),
  del: (id, who) => rpc("gifts_delete", { pass: S.pass, viewer: who, gift_id: id }),
  upload: async (file, i) => {
    const blob = await shrinkPhoto(file);
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const path = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const r = await fetch(`${DB.url}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { ...auth(), "Content-Type": blob.type }, body: blob });
    if (!r.ok) throw new Error("upload");
    return path;
  },
};

const DEMO_KEY = "darky-demo";
const demoRows = () => { try { return JSON.parse(store.get(DEMO_KEY)) || seed(); } catch (_) { return seed(); } };
const demoWrite = rows => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(rows)); } catch (_) { throw new Error("Úložiště prohlížeče je plné — zkus menší nebo méně fotek."); } };
function seed() {
  const t = Date.now(), d = n => new Date(t - n * 864e5).toISOString();
  return [
    { id: "s1", for_whom: "bozenka", name: "Kašmírová šála", price: 1890, category: "Oblečení", url: "https://www.example.com/sala", note: "Ideálně béžová nebo šedá.", photos: [], created_at: d(1) },
    { id: "s2", for_whom: "bohousek", name: "Kniha: Projekt Hail Mary", price: 449, category: "Knihy", url: "", note: "", photos: [], created_at: d(2) },
    { id: "s3", for_whom: "bozenka", name: "Víkend ve wellness", price: 6500, category: "Zážitky", url: "", note: "Klidně někde na Šumavě.", photos: [], created_at: d(3) },
    { id: "s4", for_whom: "bohousek", name: "Bezdrátová sluchátka", price: 3990, category: "Elektronika", url: "https://www.example.com/sluchatka", note: "", photos: [], created_at: d(4) },
    { id: "s5", for_whom: "bohousek", name: "Běžecké ponožky", price: 290, category: "Sport", url: "", note: "Velikost 43–46", photos: [], created_at: d(5) },
  ];
}
const demoApi = {
  check: async () => true,
  list: async () => demoRows(),
  save: async (g, who) => {
    const rows = demoRows();
    if (g.id) { const i = rows.findIndex(r => r.id === g.id && r.for_whom === who); if (i < 0) throw new Error("not found"); rows[i] = { ...rows[i], ...g, price: g.price === "" ? null : g.price }; }
    else rows.unshift({ ...g, id: "d" + Date.now(), for_whom: who, created_at: new Date().toISOString() });
    demoWrite(rows);
  },
  del: async (id, who) => demoWrite(demoRows().filter(r => !(r.id === id && r.for_whom === who))),
  upload: async file => blobToDataUrl(await shrinkPhoto(file, 900)),
};
const api = DEMO ? demoApi : remoteApi;
// Edge function that reads a product page (photos, name, price) — see supabase/functions/fetch-product
const FETCH_FN = DEMO ? "" : `${DB.url}/functions/v1/fetch-product`;
const proxied = u => `${FETCH_FN}?img=${encodeURIComponent(u)}`;

/* ---------- state ---------- */
const CAT_ICON = { "Oblečení": "👕", "Elektronika": "🎧", "Knihy": "📚", "Zážitky": "🎟️", "Domácnost": "🏠", "Sport": "⚽", "Kosmetika": "💄", "Šperky": "💍", "Hobby": "🎨" };
const catIcon = c => CAT_ICON[c] || "🎁";
const SORTS = [["new", "Nejnovější"], ["cheap", "Nejlevnější"], ["dear", "Nejdražší"], ["name", "Podle názvu"]];
const NO_FILTER = { who: "all", cat: null, min: null, max: null, sort: "new" };
const S = { pass: "", gifts: [], loading: true, error: "", f: { ...NO_FILTER } };
try { const s = JSON.parse(store.get("darky-filters")) || {}; for (const k in NO_FILTER) if (k in s) S.f[k] = s[k]; } catch (_) {}
const saveFilters = () => store.set("darky-filters", JSON.stringify(S.f));
const ICON = {
  left: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  right: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
  back: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`,
  edit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  grid: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="10" y="3" width="5" height="5" rx="1"/><rect x="17" y="3" width="4" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1"/><rect x="10" y="10" width="5" height="5" rx="1"/><rect x="17" y="10" width="4" height="5" rx="1"/><rect x="3" y="17" width="5" height="4" rx="1"/><rect x="10" y="17" width="5" height="4" rx="1"/><rect x="17" y="17" width="4" height="4" rx="1"/></svg>`,
  ext: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`,
  photo: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>`,
};
const plural = (n, one, few, many) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;

async function load() {
  S.loading = true; render();
  try { S.gifts = (await api.list()) || []; S.error = ""; }
  catch (_) { S.error = "Přání se nepodařilo načíst."; }
  S.loading = false; render();
}

/* ---------- filtering ---------- */
const categories = () => [...new Set(S.gifts.map(g => g.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
function applyFilter(f, skipWho) {
  const list = S.gifts.filter(g =>
    (skipWho || f.who === "all" || g.for_whom === f.who) &&
    (!f.cat || g.category === f.cat) &&
    (f.min == null || (g.price != null && g.price >= f.min)) &&
    (f.max == null || (g.price != null && g.price <= f.max)));
  const by = {
    new: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
    cheap: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    dear: (a, b) => (b.price ?? -1) - (a.price ?? -1),
    name: (a, b) => a.name.localeCompare(b.name, "cs"),
  }[f.sort] || (() => 0);
  return list.sort(by);
}
const activeCount = f => (f.cat ? 1 : 0) + (f.min != null || f.max != null ? 1 : 0) + (f.sort !== "new" ? 1 : 0);
const _priceLabel = f => f.min == null && f.max == null ? "Jakákoli" : f.min == null ? `do ${fmtPrice(f.max)}` : f.max == null ? `od ${fmtPrice(f.min)}` : `${new Intl.NumberFormat("cs-CZ").format(f.min)}–${fmtPrice(f.max)}`;

/* ---------- router ---------- */
const route = () => { const m = location.hash.match(/^#\/p\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };
addEventListener("hashchange", () => { render(); scrollTo(0, 0); });

/* ---------- render ---------- */
function render() {
  const id = route();
  $("#list").hidden = !!id; $("#detail").hidden = !id;
  document.body.classList.toggle("on-detail", !!id);
  renderHeader();
  if (id) renderDetail(id); else renderList();
}
function renderHeader() {
  const f = S.f, forWho = applyFilter({ ...f, who: "all" });
  const n = w => forWho.filter(g => w === "all" || g.for_whom === w).length;
  const who = $("#f-who");
  [["all", "Oba"], ["bohousek", "Bohoušek"], ["bozenka", "Boženka"]].forEach(([id, l], k) => { who.options[k].textContent = S.gifts.length ? `${l} (${n(id)})` : l; });
  who.value = f.who; who.classList.toggle("on", f.who !== "all");
  const cats = categories(); if (f.cat && !cats.includes(f.cat)) cats.push(f.cat);
  $("#f-cat").innerHTML = `<option value="">Vše</option>` + cats.map(c => `<option value="${esc(c)}">${catIcon(c)} ${esc(c)}</option>`).join("");
  $("#f-cat").value = f.cat || ""; $("#f-cat").classList.toggle("on", !!f.cat);
  if (document.activeElement !== $("#f-min")) $("#f-min").value = f.min ?? "";
  if (document.activeElement !== $("#f-max")) $("#f-max").value = f.max ?? "";
  $("#f-sort").value = f.sort; $("#f-sort").classList.toggle("on", f.sort !== "new");
  $("#f-clear").hidden = !(activeCount(f) || f.who !== "all");
}
function renderList() {
  const f = S.f, grid = $("#grid"), empty = $("#empty");
  $("#demo").hidden = !DEMO;
  const title = f.who === "all" ? "Přání pro oba" : `Přání pro ${PEOPLE[f.who].acc}`;
  $("#res-title").textContent = title;
  if (S.loading && !S.gifts.length) {
    $("#res-sub").textContent = "Načítám…"; empty.innerHTML = "";
    grid.innerHTML = Array.from({ length: 8 }, () => `<div class="card skel"><div class="ph"></div><div class="sk" style="width:70%"></div><div class="sk" style="width:45%"></div></div>`).join("");
    return;
  }
  if (S.error) {
    $("#res-sub").textContent = ""; grid.innerHTML = "";
    empty.innerHTML = `<div class="empty"><div class="big">😕</div><h2>${esc(S.error)}</h2><p>Zkontroluj připojení a zkus to znovu.</p><button class="btn-dark" type="button" data-act="reload">Zkusit znovu</button></div>`;
    return;
  }
  const list = applyFilter(f), total = list.reduce((s, g) => s + (g.price || 0), 0);
  $("#res-sub").innerHTML = list.length
    ? `${list.length} ${plural(list.length, "přání", "přání", "přání")} · celkem ${fmtPrice(total)}${activeCount(f) || f.who !== "all" ? ` · <button type="button" data-act="reset">Zrušit filtry</button>` : ""}`
    : "";
  grid.innerHTML = list.map(card).join("");
  if (list.length) empty.innerHTML = "";
  else if (!S.gifts.length) empty.innerHTML = `<div class="empty"><div class="big">🎁</div><h2>Zatím žádná přání</h2><p>Přidej první věc, kterou by sis přál(a) dostat.</p><button class="btn-grad" style="width:auto" type="button" data-act="add">Přidat přání</button></div>`;
  else if (f.who !== "all" && !S.gifts.some(g => g.for_whom === f.who)) empty.innerHTML = `<div class="empty"><div class="big">🎈</div><h2>${PEOPLE[f.who].name} zatím nemá žádná přání</h2><p>Přidej první přání pro ${PEOPLE[f.who].acc}.</p><button class="btn-grad" style="width:auto" type="button" data-act="add">Přidat přání</button></div>`;
  else empty.innerHTML = `<div class="empty"><div class="big">🔍</div><h2>Nic tomu neodpovídá</h2><p>Zkus změnit nebo zrušit některé filtry.</p><button class="btn-line" type="button" data-act="reset">Zrušit filtry</button></div>`;
}
function photosHTML(g, cls = "") {
  const p = g.photos || [];
  if (!p.length) return `<div class="noimg ${cls}" aria-hidden="true">${catIcon(g.category)}</div>`;
  return `<div class="track ${cls}">${p.map((x, i) => `<img src="${esc(photoSrc(x))}" alt="${i ? "" : esc(g.name)}" loading="lazy" draggable="false">`).join("")}</div>`;
}
function card(g) {
  const p = g.photos || [], url = safeUrl(g.url);
  return `<article class="card" data-id="${esc(g.id)}" tabindex="0" aria-label="${esc(g.name)}">
    <div class="ph">${photosHTML(g)}
      <span class="tag"><i class="dot-p ${g.for_whom}"></i>pro ${PEOPLE[g.for_whom].acc}</span>
      ${p.length > 1 ? `<button class="arr l" type="button" data-step="-1" aria-label="Předchozí fotka" disabled>${ICON.left}</button><button class="arr r" type="button" data-step="1" aria-label="Další fotka">${ICON.right}</button>
        <div class="dots">${p.slice(0, 5).map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : ""}
    </div>
    <div class="cbody">
      <div class="c1">${esc(g.name)}</div>
      <div class="c2">${[g.category, url && domain(url)].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</div>
      <div class="c3">${g.price != null ? `<b>${fmtPrice(g.price)}</b>` : `<span class="na">Cena neuvedena</span>`}</div>
    </div>
  </article>`;
}
// keep carousel dots + arrows in sync with swiping
document.addEventListener("scroll", e => {
  const t = e.target; if (!(t instanceof Element) || !t.classList.contains("track")) return;
  const i = Math.round(t.scrollLeft / t.clientWidth), n = t.children.length, box = t.parentElement;
  box.querySelectorAll(".dots i").forEach((d, k) => d.classList.toggle("on", k === Math.min(i, 4)));
  const l = box.querySelector(".arr.l"), r = box.querySelector(".arr.r"); if (l) l.disabled = i <= 0; if (r) r.disabled = i >= n - 1;
  const c = box.querySelector(".count"); if (c) c.textContent = `${i + 1} / ${n}`;
}, true);

/* ---------- detail ---------- */
function renderDetail(id) {
  const el = $("#detail"), g = S.gifts.find(x => x.id === id);
  if (!g) {
    el.innerHTML = S.loading ? `<div class="empty">Načítám…</div>` : `<div class="empty"><div class="big">🤷</div><h2>Tohle přání už neexistuje</h2><p>Možná bylo smazané.</p><a class="btn-dark" href="#">Zpět na přání</a></div>`;
    return;
  }
  const p = g.photos || [], url = safeUrl(g.url), who = PEOPLE[g.for_whom];
  const shown = p.slice(0, 5);
  const added = (() => { try { return new Date(g.created_at).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" }); } catch (_) { return ""; } })();
  const buy = url ? `<a class="btn-grad" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Kde koupit ${ICON.ext}</a>` : `<button class="btn-line" type="button" data-act="edit">Přidat odkaz</button>`;
  el.innerHTML = `
    <a class="back" href="#" aria-label="Zpět na přání">${ICON.back}<span>Všechna přání</span></a>
    <div class="d-carousel">${p.length ? `${photosHTML(g)}${p.length > 1 ? `<span class="count">1 / ${p.length}</span>` : ""}` : `<div class="noimg">${catIcon(g.category)}</div>`}</div>
    <div class="d-wrap">
      <div class="d-title"><h1>${esc(g.name)}</h1><div class="d-acts"><button type="button" data-act="edit">${ICON.edit} Upravit</button></div></div>
      ${p.length ? `<div class="mosaic n${shown.length}">${shown.map((x, i) => `<button class="mi m${i}" type="button" data-tour="${i}" aria-label="Zobrazit fotku ${i + 1}"><img src="${esc(photoSrc(x))}" alt="${i ? "" : esc(g.name)}"></button>`).join("")}
        ${p.length > 1 ? `<button class="all-ph" type="button" data-tour="0">${ICON.grid} Zobrazit všechny fotky</button>` : ""}</div>`
        : `<div class="mosaic n1"><div class="noimg">${catIcon(g.category)}</div></div>`}
      <div class="d-body">
        <div class="d-main">
          <div class="d-sec">
            <h2>${g.category ? `${esc(g.category)} pro ${who.acc}` : `Přání pro ${who.acc}`}</h2>
            <p class="sub">${[g.price != null ? fmtPrice(g.price) : "cena neuvedena", p.length ? `${p.length} ${plural(p.length, "fotka", "fotky", "fotek")}` : "", url ? domain(url) : ""].filter(Boolean).map(esc).join(" · ")}</p>
          </div>
          <div class="d-sec who-row"><span class="av ${g.for_whom}">B</span><div><b>Přeje si ${who.name}</b><span>${added ? `Přidáno ${esc(added)}` : ""}</span></div></div>
          <div class="d-sec feat">
            <div><span class="fi">${catIcon(g.category)}</span><div>${esc(g.category || "Bez kategorie")}<small>Kategorie</small></div></div>
            <div><span class="fi">🏷️</span><div>${g.price != null ? `Přibližně ${fmtPrice(g.price)}` : "Cena neuvedena"}<small>Cena</small></div></div>
            <div><span class="fi">🛍️</span><div>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(domain(url))}</a>` : "Odkaz nebyl přidán"}<small>Kde koupit</small></div></div>
          </div>
          ${g.note ? `<div class="d-sec"><h3>Poznámka</h3><p class="note">${esc(g.note)}</p></div>` : ""}
        </div>
        <aside class="book">
          <div class="pr">${g.price != null ? `${fmtPrice(g.price)} <small>přibližně</small>` : `<small>Cena neuvedena</small>`}</div>
          ${url ? `<div class="shopinfo"><div><span>OBCHOD</span><b>${esc(domain(url))}</b></div></div>` : ""}
          ${buy}
          <p class="fine">${url ? "Odkaz se otevře v nové záložce" : "U přání zatím není odkaz na obchod"}</p>
        </aside>
      </div>
    </div>
    <div class="m-bar"><div class="pr">${g.price != null ? fmtPrice(g.price) : "Cena neuvedena"}<small>${esc(g.category || "pro " + who.acc)}</small></div>${url ? `<a class="btn-grad" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Kde koupit</a>` : `<button class="btn-dark" type="button" data-act="edit">Upravit</button>`}</div>`;
}
function openTour(g, start) {
  const p = g.photos || [], body = $("#tour-body");
  body.innerHTML = p.map((x, i) => `<img id="tour-${i}" src="${esc(photoSrc(x))}" alt="${esc(g.name)} – fotka ${i + 1}">`).join("");
  $("#tour-count").textContent = `${p.length} ${plural(p.length, "fotka", "fotky", "fotek")}`;
  $("#dlg-tour").showModal();
  requestAnimationFrame(() => document.getElementById(`tour-${start}`)?.scrollIntoView({ block: "start" }));
}

/* ---------- clicks ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button,a,[data-id]"); if (!t) return;
  const f = S.f;
  if (t.dataset.step) {                                   // card carousel arrow
    e.stopPropagation(); const tr = t.parentElement.querySelector(".track");
    tr.scrollBy({ left: +t.dataset.step * tr.clientWidth, behavior: "smooth" }); return;
  }
  if (t.dataset.act === "reset") { Object.assign(f, NO_FILTER); saveFilters(); render(); return; }
  if (t.dataset.act === "add") return openEdit(null);
  if (t.dataset.act === "edit") return openEdit(route());
  if (t.dataset.act === "reload") return load();
  if (t.dataset.tour != null) { const g = S.gifts.find(x => x.id === route()); if (g) openTour(g, +t.dataset.tour); return; }
  if (t.matches(".card")) { location.hash = `#/p/${encodeURIComponent(t.dataset.id)}`; }
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".card")) { e.preventDefault(); location.hash = `#/p/${encodeURIComponent(e.target.dataset.id)}`; } });
addEventListener("scroll", () => document.body.classList.toggle("scrolled", scrollY > 8), { passive: true });

/* ---------- inline filters in the top bar ---------- */
const setF = patch => { Object.assign(S.f, patch); saveFilters(); if (route()) location.hash = ""; else render(); };
$("#f-who").addEventListener("change", e => setF({ who: e.target.value }));
$("#f-cat").addEventListener("change", e => setF({ cat: e.target.value || null }));
$("#f-sort").addEventListener("change", e => setF({ sort: e.target.value }));
["#f-min", "#f-max"].forEach(sel => $(sel).addEventListener("input", () => {
  const num = v => v === "" ? null : Math.max(0, +v);
  setF({ min: num($("#f-min").value), max: num($("#f-max").value) });
}));
$(".seg.price").addEventListener("click", e => { if (e.target.tagName !== "INPUT") $("#f-min").focus(); });

/* ---------- add / edit ---------- */
const dlgEdit = $("#dlg-edit");
let editing = null, picks = [], formFor = null, lastFetched = "";   // picks: {path} saved, or {file, url} new
function openEdit(id) {
  const g = id ? S.gifts.find(x => x.id === id) : null;
  editing = g;
  $("#edit-title").textContent = g ? "Upravit přání" : "Nové přání";
  $("#e-name").value = g?.name || ""; $("#e-price").value = g?.price ?? ""; $("#e-cat").value = g?.category || "";
  $("#e-url").value = g?.url || ""; $("#e-note").value = g?.note || ""; $("#edit-msg").textContent = "";
  dlgEdit.querySelectorAll(".fbox.err").forEach(x => x.classList.remove("err"));
  $("#e-delete").hidden = !g; $("#e-del-sp").hidden = !!g;
  formFor = g?.for_whom || (S.f.who !== "all" ? S.f.who : store.get("darky-lastfor")) || null;
  markFor();
  picks.forEach(p => p.file && URL.revokeObjectURL(p.url));
  picks = (g?.photos || []).map(path => ({ path, url: photoSrc(path) }));
  lastFetched = g?.url || ""; setFetchMsg(""); updateFetchRow();
  const all = [...new Set([...DEFAULT_CATS, ...categories()])];
  $("#cat-list").innerHTML = all.map(c => `<option value="${esc(c)}">`).join("");
  $("#e-cat-tiles").innerHTML = all.map(c => `<button type="button" class="tile" data-pick-cat="${esc(c)}"><span class="ic">${catIcon(c)}</span>${esc(c)}</button>`).join("");
  markCat(); renderPicks();
  dlgEdit.showModal(); dlgEdit.querySelector(".m-body").scrollTop = 0;
  if (!matchMedia("(max-width:744px)").matches) $(g ? "#e-name" : "#e-url").focus();
}
function markFor() { document.querySelectorAll("#e-for button").forEach(b => b.setAttribute("aria-pressed", b.dataset.for === formFor)); }
$("#e-for").addEventListener("click", e => { const b = e.target.closest("[data-for]"); if (b) { formFor = b.dataset.for; markFor(); } });
const markCat = () => $("#e-cat-tiles").querySelectorAll(".tile").forEach(c => c.setAttribute("aria-pressed", c.dataset.pickCat === $("#e-cat").value.trim()));
$("#e-cat").addEventListener("input", markCat);
$("#e-cat-tiles").addEventListener("click", e => { const c = e.target.closest("[data-pick-cat]"); if (!c) return; $("#e-cat").value = $("#e-cat").value === c.dataset.pickCat ? "" : c.dataset.pickCat; markCat(); });
function renderPicks() {
  $("#e-picks").innerHTML = picks.map((p, i) => `<div class="pick"><img src="${esc(p.url)}" alt="">${i === 0 ? `<span class="main">Hlavní</span>` : ""}${p.remote ? `<span class="src">z obchodu</span>` : ""}<button type="button" data-unpick="${i}" aria-label="Odebrat fotku">✕</button></div>`).join("") +
    (picks.length < MAX_PHOTOS ? `<label class="add-photo" for="e-files" tabindex="0">${ICON.photo}<span>Přidat fotky</span></label>` : "");
}
function addFiles(files) {
  const imgs = [...files].filter(f => f.type.startsWith("image/")).slice(0, MAX_PHOTOS - picks.length);
  imgs.forEach(file => picks.push({ file, url: URL.createObjectURL(file) }));
  renderPicks();
}
$("#e-files").addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });
$("#e-picks").addEventListener("click", e => { const b = e.target.closest("[data-unpick]"); if (!b) return; const [p] = picks.splice(+b.dataset.unpick, 1); if (p.file) URL.revokeObjectURL(p.url); renderPicks(); });
$("#e-picks").addEventListener("keydown", e => { if (e.target.matches(".add-photo") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); $("#e-files").click(); } });
const dz = $("#e-picks");
dz.addEventListener("dragover", e => { e.preventDefault(); dz.querySelector(".add-photo")?.classList.add("drag"); });
dz.addEventListener("dragleave", () => dz.querySelector(".add-photo")?.classList.remove("drag"));
dz.addEventListener("drop", e => { e.preventDefault(); addFiles(e.dataTransfer.files); });
dlgEdit.addEventListener("paste", e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });

/* ---------- photos (and name/price) from the shop link ---------- */
function normUrl(v) { v = v.trim(); if (v && !/^https?:\/\//i.test(v)) v = "https://" + v; return safeUrl(v); }
function setFetchMsg(t, err) { const m = $("#e-fetch-msg"); m.textContent = t; m.classList.toggle("err", !!err); }
function updateFetchRow() { $("#e-fetch").hidden = !FETCH_FN || !normUrl($("#e-url").value); }
async function fetchFromLink() {
  const url = normUrl($("#e-url").value); if (!url || !FETCH_FN) return;
  const btn = $("#e-fetch-btn"); btn.disabled = true; lastFetched = url;
  setFetchMsg(`Načítám z ${domain(url)}…`);
  try {
    const r = await fetch(`${FETCH_FN}?url=${encodeURIComponent(url)}`, { headers: auth() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || (r.status === 404 ? "Funkce fetch-product není nasazená." : `Chyba ${r.status}`));
    const filled = [];
    if (d.title && !$("#e-name").value.trim()) { $("#e-name").value = d.title.split(/\s+\|\s+/)[0].trim(); filled.push("název"); }
    if (d.price != null && !$("#e-price").value.trim() && (!d.currency || /^(CZK|Kč)$/i.test(d.currency))) { $("#e-price").value = d.price; filled.push("cenu"); }
    const have = new Set(picks.map(p => p.remote).filter(Boolean));
    const add = (d.images || []).filter(u => !have.has(u)).slice(0, MAX_PHOTOS - picks.length);
    add.forEach(u => picks.push({ remote: u, url: proxied(u) }));
    renderPicks();
    const parts = [];
    if (add.length) parts.push(`${add.length} ${plural(add.length, "fotka", "fotky", "fotek")}`);
    if (filled.length) parts.push(filled.join(" a "));
    setFetchMsg(parts.length ? `Doplněno z ${d.site || domain(url)}: ${parts.join(", ")}. Nechtěné fotky odeber křížkem.`
      : picks.length >= MAX_PHOTOS ? "Fotek už je maximum (6)." : `Na ${d.site || domain(url)} jsem nic nenašel — fotky přidej ručně.`);
  } catch (err) {
    setFetchMsg(`Nepodařilo se načíst: ${err.message === "Failed to fetch" ? "obchod nebo funkce neodpovídá." : err.message}`, true);
  } finally { btn.disabled = false; }
}
$("#e-fetch-btn").addEventListener("click", fetchFromLink);
$("#e-url").addEventListener("input", updateFetchRow);
// Pasting / finishing a new link loads photos automatically
const autoFetch = () => { updateFetchRow(); const u = normUrl($("#e-url").value); if (u && u !== lastFetched) fetchFromLink(); };
$("#e-url").addEventListener("change", autoFetch);
$("#e-url").addEventListener("paste", () => setTimeout(autoFetch, 0));

$("#edit-form").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#edit-msg"), btn = $("#e-save");
  const name = $("#e-name").value.trim(), price = $("#e-price").value.trim(), rawUrl = $("#e-url").value.trim();
  const fail = (sel, t) => { msg.textContent = t; if (sel) { $(sel).closest(".fbox")?.classList.add("err"); $(sel).focus(); } };
  dlgEdit.querySelectorAll(".fbox.err").forEach(x => x.classList.remove("err"));
  if (!formFor) { fail(null, "Vyber, pro koho přání je."); dlgEdit.querySelector(".m-body").scrollTop = 0; return; }
  if (!name) return fail("#e-name", "Vyplň název přání.");
  if (price && !/^\d+$/.test(price)) return fail("#e-price", "Cena musí být celé číslo v Kč.");
  let url = rawUrl;
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  if (url && !safeUrl(url)) return fail("#e-url", "Odkaz nevypadá jako webová adresa.");
  btn.disabled = true;
  try {
    const photos = [], newCount = picks.filter(p => p.file || p.remote).length; let done = 0, failed = 0;
    for (const [i, p] of picks.entries()) {
      if (p.file) { btn.textContent = `Nahrávám fotky ${++done}/${newCount}…`; photos.push(await api.upload(p.file, i)); }
      else if (p.remote) {
        btn.textContent = `Nahrávám fotky ${++done}/${newCount}…`;
        try { const r = await fetch(p.url, { headers: auth() }); if (!r.ok) throw 0; photos.push(await api.upload(await r.blob(), i)); }
        catch (_) { failed++; }
      }
      else photos.push(p.path);
    }
    if (failed) toast(`${failed} ${plural(failed, "fotku", "fotky", "fotek")} z obchodu se nepodařilo uložit`);
    btn.textContent = "Ukládám…"; msg.textContent = "";
    const data = { name, price: price === "" ? "" : +price, category: $("#e-cat").value.trim(), url, note: $("#e-note").value.trim(), photos };
    if (editing && editing.for_whom !== formFor) {      // moved to the other person: re-create, then remove the old one
      await api.save(data, formFor); await api.del(editing.id, editing.for_whom);
      if (route()) location.hash = "";
    } else await api.save({ ...data, id: editing?.id }, formFor);
    store.set("darky-lastfor", formFor);
    dlgEdit.close(); toast(editing ? "Změny uloženy" : "Přání přidáno");
    if (!route() && S.f.who !== "all" && S.f.who !== formFor) { S.f.who = "all"; saveFilters(); }
    await load();
  } catch (err) { msg.textContent = err.message?.startsWith("Úložiště") ? err.message : "Nepodařilo se uložit. Zkus to znovu."; }
  finally { btn.disabled = false; btn.textContent = "Uložit"; }
});
$("#e-delete").addEventListener("click", async () => {
  if (!editing || !confirm(`Smazat „${editing.name}“?`)) return;
  try { await api.del(editing.id, editing.for_whom); dlgEdit.close(); toast("Přání smazáno"); if (route()) location.hash = ""; await load(); }
  catch (_) { $("#edit-msg").textContent = "Nepodařilo se smazat."; }
});

// Close buttons + click on the backdrop
document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-close]")) d.close(); }));

/* ---------- start ---------- */
load();
