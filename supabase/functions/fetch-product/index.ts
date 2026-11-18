// @ts-nocheck
// Supabase Edge Function "fetch-product"
//   GET ?url=<product page>  → { title, price, currency, images: [..], site }
//   GET ?img=<image url>     → the image bytes (so the browser can upload them to our storage)
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor, name "fetch-product",
// paste this file, Deploy. Then in the function's settings turn OFF "Verify JWT" (the site uses a publishable key).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_HTML = 4_000_000, MAX_IMG = 12_000_000, MAX_IMAGES = 8;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

// Only public http(s) addresses — never the function's own network.
function target(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch (_) { throw new Error("Neplatný odkaz"); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Neplatný odkaz");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") || !h.includes(".") ||
      /^(0|10|127)\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) || h.includes(":")) throw new Error("Tahle adresa není povolená");
  return u;
}

const decode = s => String(s || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .trim();

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? "");
  return out;
}

function parsePrice(v) {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? Math.round(v) : null;
  let s = String(v).replace(/[^\d.,]/g, "");
  if (!s) return null;
  // "1 290,00" / "1.290,00" / "1290.00" / "1,290.00"
  if (/,\d{1,2}$/.test(s)) s = s.replace(/[.]/g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n) : null;
}

// Find schema.org Product objects anywhere inside JSON-LD
function* walk(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const x of node) yield* walk(x); return; }
  yield node;
  for (const k of ["@graph", "mainEntity", "itemListElement", "item", "hasVariant"]) if (node[k]) yield* walk(node[k]);
}
const isType = (o, t) => [].concat(o["@type"] || []).some(x => String(x).toLowerCase() === t);
const imgList = v => [].concat(v || []).flatMap(x => typeof x === "string" ? [x] : x && (x.url || x.contentUrl) ? [x.url || x.contentUrl] : []);

function extract(html, base) {
  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]), key = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content;
    if (key && a.content && (key === "og:image" || key === "og:image:secure_url" || key === "twitter:image" || key === "image")) (meta.__imgs ||= []).push(a.content);
  }
  let title = null, price = null, currency = null;
  const images = [];

  // 1) JSON-LD Product (most reliable: name, all photos, price)
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data; try { data = JSON.parse(m[1].trim()); } catch (_) { continue; }
    for (const o of walk(data)) {
      if (!isType(o, "product") && !isType(o, "productgroup")) continue;
      title ||= o.name ? decode(o.name) : null;
      images.push(...imgList(o.image));
      for (const off of [].concat(o.offers || [])) {
        for (const x of walk(off)) {
          const p = parsePrice(x.price ?? x.lowPrice ?? x.priceSpecification?.price);
          if (p != null && price == null) { price = p; currency = x.priceCurrency || x.priceSpecification?.priceCurrency || null; }
        }
      }
    }
  }
  // 2) Open Graph / Twitter / microdata
  images.push(...(meta.__imgs || []));
  for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/gi)) { const a = attrs(m[0]); if (a.href) images.push(a.href); }
  for (const m of html.matchAll(/<img\b[^>]*itemprop\s*=\s*["']image["'][^>]*>/gi)) { const a = attrs(m[0]); const s = a.src || a["data-src"]; if (s) images.push(s); }
  title ||= meta["og:title"] || meta["twitter:title"] || null;
  if (!title) { const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (t) title = decode(t[1]); }
  if (price == null) {
    price = parsePrice(meta["product:price:amount"] || meta["og:price:amount"] || meta["price"]);
    currency = meta["product:price:currency"] || meta["og:price:currency"] || meta["pricecurrency"] || null;
  }
  if (price == null) {
    const m = html.match(/itemprop\s*=\s*["']price["'][^>]*content\s*=\s*["']([^"']+)/i) || html.match(/content\s*=\s*["']([^"']+)["'][^>]*itemprop\s*=\s*["']price["']/i);
    if (m) price = parsePrice(m[1]);
  }

  const seen = new Set(), out = [];
  for (const raw of images) {
    let u; try { u = new URL(decode(raw), base); } catch (_) { continue; }
    if (!/^https?:$/.test(u.protocol) || /\.svg(\?|$)/i.test(u.pathname)) continue;
    const key = u.href.replace(/[?#].*$/, "");
    if (seen.has(key)) continue;
    seen.add(key); out.push(u.href);
    if (out.length >= MAX_IMAGES) break;
  }
  return { title: title ? title.slice(0, 200) : null, price, currency, images: out, site: new URL(base).hostname.replace(/^www\./, "") };
}

async function getImage(raw) {
  const u = target(raw);
  const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8", Referer: u.origin + "/" }, redirect: "follow" });
  const type = (r.headers.get("content-type") || "").split(";")[0];
  if (!r.ok || !type.startsWith("image/")) return json({ error: "Obrázek se nepodařilo stáhnout" }, 502);
  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX_IMG) return json({ error: "Obrázek je moc velký" }, 413);
  return new Response(buf, { headers: { ...CORS, "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
}

async function getPage(raw) {
  const u = target(raw);
  const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8" }, redirect: "follow" });
  if (!r.ok) return json({ error: `Obchod odpověděl chybou ${r.status}` }, 502);
  target(r.url);                                   // redirect must also stay public
  const html = (await r.text()).slice(0, MAX_HTML);
  return json(extract(html, r.url));
}

if (typeof Deno !== "undefined") Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const q = new URL(req.url).searchParams;
  try {
    if (q.get("img")) return await getImage(q.get("img"));
    if (q.get("url")) return await getPage(q.get("url"));
    return json({ error: "Chybí parametr url" }, 400);
  } catch (e) {
    return json({ error: e?.message || "Chyba" }, 400);
  }
});
if (typeof module !== "undefined") module.exports = { extract, parsePrice, target };
