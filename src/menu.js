import { FOODS, P, GOOD_AT, BAD_AT, quote } from "./price.js";
import { DISHES } from "./dishes.js";

const byId = new Map(FOODS.map((f) => [f.id, f]));
let dine = null;
let index = null;

export async function loadMenuData(base = "data/") {
  const get = (f) => fetch(base + f, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  [dine, index] = await Promise.all([get("dineout.json"), get("dish-index.json")]);
  return { dine, index };
}

export const dineData = () => dine;
export const dishIndex = () => index;

function part(food, grams, code) {
  const q = quote(food, code);
  if (q.level === "none" || !q.now) return { food, grams, q, missing: true };
  const per = grams / food.g;
  const s = q.series || [];
  const ref = (i) => (s[i] ? s[i] * per : null);
  const now = q.now * per;
  return {
    food,
    grams,
    q,
    now,
    normal: ref(P.normal) ?? ref(P.year) ?? now,
    year: ref(P.year),
    month: ref(P.month) ?? now,
    missing: false
  };
}

export function levelOf(ratio) {
  if (ratio == null) return "ok";
  return ratio <= GOOD_AT ? "good" : ratio >= BAD_AT ? "bad" : "ok";
}

export function dishQuote(dish, code) {
  const parts = dish.items.map(([id, g]) => part(byId.get(id), g, code));
  const ok = parts.filter((p) => !p.missing);
  const sum = (k) => ok.reduce((a, p) => a + (p[k] ?? p.now), 0);
  const now = sum("now");
  const normal = sum("normal");
  const year = ok.every((p) => p.year != null) ? sum("year") : null;
  const month = sum("month");
  const ratio = normal ? now / normal : null;
  const shares = ok.map((p) => ({ ...p, share: now ? p.now / now : 0, push: p.now - p.normal })).sort((a, b) => b.share - a.share);
  const pusher = [...shares].sort((a, b) => b.push - a.push)[0];
  const swaps = [];
  for (const [id, alts] of Object.entries(dish.alt || {})) {
    const cur = ok.find((p) => p.food.id === id);
    if (!cur) continue;
    for (const altId of alts) {
      const alt = part(byId.get(altId), cur.grams, code);
      if (alt.missing) continue;
      const save = cur.now - alt.now;
      if (save > 0 && save >= cur.now * 0.1) swaps.push({ from: cur, to: alt, save, after: now - save });
    }
  }
  swaps.sort((a, b) => b.save - a.save);
  const seen = new Set();
  const bestSwaps = swaps.filter((s) => (seen.has(s.from.food.id) ? false : seen.add(s.from.food.id)));
  return {
    dish,
    parts,
    shares,
    missing: parts.filter((p) => p.missing).map((p) => p.food.name),
    borrowed: ok.filter((p) => p.q.fallback).map((p) => p.food.name),
    now,
    normal,
    year,
    month,
    ratio,
    vsYear: year ? now / year : null,
    vsMonth: month ? now / month : null,
    level: levelOf(ratio),
    pusher: pusher && pusher.push > 0 && ratio > 1 ? pusher : null,
    swaps: bestSwaps.slice(0, 2),
    outside: outsidePrice(dish, code)
  };
}

export function outsidePrice(dish, code) {
  if (!dine || !dish.out) return null;
  const prov = dine.regionToProvince[code] || "서울";
  const price = dine.provinces[prov] && dine.provinces[prov][dish.out];
  return price ? { price, prov, month: dine.month, name: dine.names[dish.out] } : null;
}

export function menuBoard(code, filter = (d) => d.cat !== "김장") {
  return DISHES.filter(filter).map((d) => dishQuote(d, code)).sort((a, b) => (a.ratio ?? 1) - (b.ratio ?? 1));
}

export function dishesUsing(foodIds, code) {
  const have = new Set(foodIds);
  return DISHES.filter((d) => d.cat !== "김장")
    .map((d) => {
      const q = dishQuote(d, code);
      const used = q.parts.filter((p) => have.has(p.food.id));
      if (!used.length) return null;
      const need = q.parts.filter((p) => !have.has(p.food.id) && !p.missing);
      return { q, used, need, needCost: need.reduce((a, p) => a + p.now, 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.used.length - a.used.length || a.needCost - b.needCost);
}

export function seasonOfDish(id) {
  if (!index || !index.dishes[id]) return null;
  const vals = index.dishes[id];
  const ratios = Array.from({ length: 12 }, () => []);
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] == null) continue;
    const lo = Math.max(0, i - 6);
    const hi = Math.min(vals.length, i + 6);
    const win = vals.slice(lo, hi).filter((v) => v != null);
    if (win.length < 10) continue;
    const avg = win.reduce((a, b) => a + b, 0) / win.length;
    ratios[Number(index.months[i].slice(5, 7)) - 1].push(vals[i] / avg);
  }
  const idx = ratios.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null));
  const known = idx.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (known.length < 9) return null;
  const cheap = known.reduce((a, b) => (b[1] < a[1] ? b : a));
  const dear = known.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { index: idx, cheapMonth: cheap[0] + 1, cheapRatio: cheap[1], dearMonth: dear[0] + 1, dearRatio: dear[1], years: Math.round(vals.filter((v) => v != null).length / 12) };
}

export { DISHES };
