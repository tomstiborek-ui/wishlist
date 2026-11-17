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
const PRICE_BANDS = [
  { id: "a", label: "do 500 Kč", min: 0, max: 500 },
  { id: "b", label: "500–2 000", min: 500, max: 2000 },
  { id: "c", label: "2 000–5 000", min: 2000, max: 5000 },
  { id: "d", label: "nad 5 000", min: 5000, max: null },
];
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
const GIFT_SVG = `<svg class="none" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>`;

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

/* ---------- state ---------- */
const S = {
  pass: "",   // no password: the database accepts an empty one (see gifts.sql)
  gifts: [], loading: true, error: "",
  f: { who: "all", cat: null, band: null, min: "", max: "", sort: "new" },
};
try { Object.assign(S.f, JSON.parse(store.get("darky-filters")) || {}); } catch (_) {}
const saveFilters = () => store.set("darky-filters", JSON.stringify(S.f));

/* ---------- start-up ---------- */
function enter() {
  $("#demo").hidden = !DEMO;
  load();
}
async function load() {
  S.loading = true; render();
  try { S.gifts = (await api.list()) || []; S.error = ""; }
  catch (e) {
    S.error = "Přání se nepodařilo načíst.";
  }
  S.loading = false; render();
}

/* ---------- filtering ---------- */
const categories = () => {
  const used = [...new Set(S.gifts.map(g => g.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
  return used;
};
function inPrice(g, f) {
  const band = PRICE_BANDS.find(b => b.id === f.band);
  const min = band ? band.min : (f.min === "" ? null : +f.min), max = band ? band.max : (f.max === "" ? null : +f.max);
  if (min == null && max == null) return true;
  if (g.price == null) return false;
  return (min == null || g.price >= min) && (max == null || g.price <= max);
}
function filtered(skip) {
  const f = S.f;
  let list = S.gifts.filter(g =>
    (skip === "who" || f.who === "all" || g.for_whom === f.who) &&
    (skip === "cat" || !f.cat || g.category === f.cat) &&
    inPrice(g, f));
  const by = {
    new: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
    cheap: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    dear: (a, b) => (b.price ?? -1) - (a.price ?? -1),
    name: (a, b) => a.name.localeCompare(b.name, "cs"),
  }[f.sort] || (() => 0);
  return list.sort(by);
}
const isFiltered = () => S.f.who !== "all" || S.f.cat || S.f.band || S.f.min !== "" || S.f.max !== "";

/* ---------- render ---------- */
function render() {
  const f = S.f;
  // who
  const forWho = filtered("who");
  const n = w => forWho.filter(g => w === "all" || g.for_whom === w).length;
  $("#f-who").innerHTML = [["all", "Oba"], ["bohousek", "Bohoušek"], ["bozenka", "Boženka"]]
    .map(([id, l]) => `<button type="button" data-who="${id}" aria-pressed="${f.who === id}">${id !== "all" ? `<span class="avatar mini ${id}">B</span>` : ""}${l} <span class="count">${n(id)}</span></button>`).join("");
  // categories
  const cats = categories();
  if (f.cat && !cats.includes(f.cat)) cats.push(f.cat);
  $("#f-cat").innerHTML = `<button type="button" class="chip" data-cat="" aria-pressed="${!f.cat}">Vše</button>` +
    cats.map(c => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${f.cat === c}">${esc(c)}</button>`).join("");
  // price
  $("#f-price").innerHTML = PRICE_BANDS.map(b => `<button type="button" class="chip" data-band="${b.id}" aria-pressed="${f.band === b.id}">${b.label}</button>`).join("");
  if (document.activeElement !== $("#f-min")) $("#f-min").value = f.min;
  if (document.activeElement !== $("#f-max")) $("#f-max").value = f.max;
  $("#f-sort").value = f.sort;

  // list
  const grid = $("#grid"), empty = $("#empty");
  if (S.loading && !S.gifts.length) { grid.innerHTML = ""; empty.innerHTML = `<div class="empty">Načítám…</div>`; $("#count").textContent = ""; return; }
  if (S.error) { grid.innerHTML = ""; empty.innerHTML = `<div class="empty"><h2>${esc(S.error)}</h2><button class="btn" type="button" data-act="reload">Zkusit znovu</button></div>`; return; }
  const list = filtered();
  $("#count").textContent = `${list.length} přání` +
    (list.length ? ` · celkem ${fmtPrice(list.reduce((s, g) => s + (g.price || 0), 0))}` : "");
  $("#reset").hidden = !isFiltered();
  grid.innerHTML = list.map(card).join("");
  if (list.length) empty.innerHTML = "";
  else if (!S.gifts.length) empty.innerHTML = `<div class="empty"><h2>Zatím žádná přání</h2><p>Přidej první věc, kterou by sis přál(a) dostat.</p><button class="btn primary" type="button" data-act="add">+ Přidat přání</button></div>`;
  else if (f.who !== "all" && !S.gifts.some(g => g.for_whom === f.who)) empty.innerHTML = `<div class="empty"><h2>${PEOPLE[f.who].name} zatím nemá žádná přání</h2><button class="btn primary" type="button" data-act="add">+ Přidat přání</button></div>`;
  else empty.innerHTML = `<div class="empty"><h2>Nic tomu neodpovídá</h2><p>Zkus upravit filtry.</p><button class="btn" type="button" data-act="reset">Zrušit filtry</button></div>`;
}
function card(g) {
  const p = g.photos || [], url = safeUrl(g.url);
  return `<article class="card" data-id="${esc(g.id)}" tabindex="0" aria-label="${esc(g.name)}">
    <div class="ph">${p.length ? `<img src="${esc(photoSrc(p[0]))}" alt="" loading="lazy">` : GIFT_SVG}
      ${p.length > 1 ? `<span class="n">${p.length} fotky</span>` : ""}
      <span class="for ${g.for_whom}">pro ${PEOPLE[g.for_whom].acc}</span>
    </div>
    <div class="cbody">
      <h3>${esc(g.name)}</h3>
      ${url ? `<a class="shop" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-stop>↗ ${esc(domain(url))}</a>` : ""}
      <div class="meta">${g.price != null ? `<span class="price">${fmtPrice(g.price)}</span>` : `<span class="price na">cena neuvedena</span>`}${g.category ? `<span class="cat">${esc(g.category)}</span>` : ""}</div>
    </div>
  </article>`;
}

/* ---------- filter events ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button,[data-id],a"); if (!t) return;
  const f = S.f;
  if (t.matches("[data-stop]")) return;          // shop link inside a card
  if (t.closest("#f-who") && t.dataset.who) { f.who = t.dataset.who; }
  else if (t.closest("#f-cat") && t.dataset.cat != null) { f.cat = t.dataset.cat || null; }
  else if (t.closest("#f-price") && t.dataset.band) { f.band = f.band === t.dataset.band ? null : t.dataset.band; f.min = f.max = ""; }
  else if (t.id === "reset" || t.dataset.act === "reset") { Object.assign(f, { who: "all", cat: null, band: null, min: "", max: "" }); }
  else if (t.dataset.act === "add") return openEdit(null);
  else if (t.dataset.act === "reload") return load();
  else if (t.matches(".card")) return openView(t.dataset.id);
  else return;
  saveFilters(); render();
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".card")) { e.preventDefault(); openView(e.target.dataset.id); } });
["#f-min", "#f-max"].forEach(s => $(s).addEventListener("input", () => { S.f.min = $("#f-min").value; S.f.max = $("#f-max").value; S.f.band = null; saveFilters(); render(); }));
$("#f-sort").addEventListener("change", e => { S.f.sort = e.target.value; saveFilters(); render(); });
addEventListener("scroll", () => document.body.classList.toggle("scrolled", scrollY > 4), { passive: true });

/* ---------- detail ---------- */
const dlgView = $("#dlg-view");
function openView(id) {
  const g = S.gifts.find(x => x.id === id); if (!g) return;
  const p = g.photos || [], url = safeUrl(g.url);
  $("#view").innerHTML = `
    <div class="dlg-head"><h2>${esc(g.name)}</h2><button class="icon-btn" type="button" data-close aria-label="Zavřít">✕</button></div>
    <div class="dlg-body">
      ${p.length ? `<div class="gallery"><div class="big"><img id="v-big" src="${esc(photoSrc(p[0]))}" alt="${esc(g.name)}"></div>
        ${p.length > 1 ? `<div class="thumbs">${p.map((x, i) => `<button type="button" data-ph="${i}" aria-pressed="${i === 0}" aria-label="Fotka ${i + 1}"><img src="${esc(photoSrc(x))}" alt=""></button>`).join("")}</div>` : ""}</div>` : ""}
      <div class="d-meta">
        ${g.price != null ? `<span class="price">${fmtPrice(g.price)}</span>` : `<span class="price na">cena neuvedena</span>`}
        ${g.category ? `<span class="cat">${esc(g.category)}</span>` : ""}
        <span class="for ${g.for_whom}">pro ${PEOPLE[g.for_whom].acc}</span>
      </div>
      ${g.note ? `<p class="note">${esc(g.note)}</p>` : ""}
      ${url ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Kde koupit · ${esc(domain(url))} ↗</a>` : ""}
    </div>
    <div class="dlg-foot"><button class="btn ghost" type="button" id="v-edit">Upravit</button></div>`;
  dlgView.querySelectorAll("[data-ph]").forEach(b => b.addEventListener("click", () => {
    $("#v-big").src = photoSrc(p[+b.dataset.ph]);
    dlgView.querySelectorAll("[data-ph]").forEach(x => x.setAttribute("aria-pressed", x === b));
  }));
  $("#v-edit").addEventListener("click", () => { dlgView.close(); openEdit(g.id); });
  if (!dlgView.open) dlgView.showModal();
}

/* ---------- add / edit ---------- */
const dlgEdit = $("#dlg-edit");
let editing = null, picks = [], formFor = null;  // picks: {path} saved, or {file, url} new
function openEdit(id) {
  const g = id ? S.gifts.find(x => x.id === id) : null;
  editing = g;
  $("#edit-title").textContent = g ? "Upravit přání" : "Nové přání";
  $("#e-name").value = g?.name || ""; $("#e-price").value = g?.price ?? ""; $("#e-cat").value = g?.category || "";
  $("#e-url").value = g?.url || ""; $("#e-note").value = g?.note || ""; $("#edit-msg").textContent = "";
  $("#e-delete").hidden = !g;
  formFor = g?.for_whom || (S.f.who !== "all" ? S.f.who : store.get("darky-lastfor")) || null;
  markFor();
  picks.forEach(p => p.file && URL.revokeObjectURL(p.url));
  picks = (g?.photos || []).map(path => ({ path, url: photoSrc(path) }));
  const all = [...new Set([...DEFAULT_CATS, ...categories()])];
  $("#cat-list").innerHTML = all.map(c => `<option value="${esc(c)}">`).join("");
  $("#e-cat-suggest").innerHTML = all.map(c => `<button type="button" class="chip" data-pick-cat="${esc(c)}">${esc(c)}</button>`).join("");
  markCat(); renderPicks();
  dlgEdit.showModal(); $("#e-name").focus();
}
function markFor() { document.querySelectorAll("#e-for button").forEach(b => b.setAttribute("aria-pressed", b.dataset.for === formFor)); }
$("#e-for").addEventListener("click", e => { const b = e.target.closest("[data-for]"); if (b) { formFor = b.dataset.for; markFor(); } });
const markCat = () => $("#e-cat-suggest").querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.pickCat === $("#e-cat").value));
$("#e-cat").addEventListener("input", markCat);
$("#e-cat-suggest").addEventListener("click", e => { const c = e.target.closest("[data-pick-cat]"); if (!c) return; $("#e-cat").value = $("#e-cat").value === c.dataset.pickCat ? "" : c.dataset.pickCat; markCat(); });
function renderPicks() {
  $("#e-picks").innerHTML = picks.map((p, i) => `<div class="pick"><img src="${esc(p.url)}" alt="">${i === 0 ? `<span class="main">Hlavní</span>` : ""}<button type="button" data-unpick="${i}" aria-label="Odebrat fotku">✕</button></div>`).join("") +
    (picks.length < MAX_PHOTOS ? `<label class="add-photo" for="e-files" tabindex="0">+ Přidat fotky<br><small>nebo přetáhni sem</small></label>` : "");
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
// Paste an image (e.g. copied from an e-shop) straight into the form
dlgEdit.addEventListener("paste", e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });

$("#edit-form").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#edit-msg"), btn = $("#e-save");
  const name = $("#e-name").value.trim(), price = $("#e-price").value.trim(), rawUrl = $("#e-url").value.trim();
  if (!formFor) { msg.textContent = "Vyber, pro koho přání je."; return; }
  if (!name) { msg.textContent = "Vyplň, co si přeješ."; $("#e-name").focus(); return; }
  if (price && (!/^\d+$/.test(price))) { msg.textContent = "Cena musí být celé číslo v Kč."; $("#e-price").focus(); return; }
  let url = rawUrl;
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  if (url && !safeUrl(url)) { msg.textContent = "Odkaz nevypadá jako webová adresa."; $("#e-url").focus(); return; }
  btn.disabled = true;
  try {
    const photos = [];
    const newCount = picks.filter(p => p.file).length;
    let done = 0;
    for (const [i, p] of picks.entries()) {
      if (p.file) { msg.textContent = `Nahrávám fotky… ${++done}/${newCount}`; photos.push(await api.upload(p.file, i)); }
      else photos.push(p.path);
    }
    msg.textContent = "Ukládám…";
    const data = { name, price: price === "" ? "" : +price, category: $("#e-cat").value.trim(), url, note: $("#e-note").value.trim(), photos };
    if (editing && editing.for_whom !== formFor) {      // moved to the other person: re-create, then remove the old one
      await api.save(data, formFor); await api.del(editing.id, editing.for_whom);
    } else await api.save({ ...data, id: editing?.id }, formFor);
    store.set("darky-lastfor", formFor);
    dlgEdit.close(); toast(editing ? "Uloženo ✓" : "Přání přidáno ✓");
    if (S.f.who !== "all" && S.f.who !== formFor) { S.f.who = "all"; saveFilters(); }
    await load();
  } catch (err) { msg.textContent = err.message?.startsWith("Úložiště") ? err.message : "Nepodařilo se uložit. Zkus to znovu."; }
  finally { btn.disabled = false; }
});
$("#e-delete").addEventListener("click", async () => {
  if (!editing || !confirm(`Smazat „${editing.name}“?`)) return;
  try { await api.del(editing.id, editing.for_whom); dlgEdit.close(); toast("Smazáno"); await load(); }
  catch (_) { $("#edit-msg").textContent = "Nepodařilo se smazat."; }
});

// Close buttons + click on backdrop
document.querySelectorAll("dialog").forEach(d => {
  d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
});

/* ---------- start ---------- */
enter();
