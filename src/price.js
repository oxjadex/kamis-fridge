import { FOODS, GROUPS } from "./foods.js";

export const LEVEL = {
  good: { label: "싸요", color: "#2fbf71", ink: "#11663a" },
  ok: { label: "보통", color: "#f5b82e", ink: "#7a5600" },
  bad: { label: "비싸요", color: "#ff5a5f", ink: "#8c1d21" },
  none: { label: "정보 없음", color: "#b9b3c4", ink: "#5a4f66" }
};

const GOOD_AT = 0.92;
const BAD_AT = 1.08;

export const P = { today: 0, week: 1, twoWeeks: 2, month: 3, year: 4, normal: 5 };

const store = { date: null, regions: {}, regionNames: {}, loaded: false };

export async function loadPrices(base = "data/") {
  try {
    const latest = await (await fetch(base + "latest.json", { cache: "no-cache" })).json();
    const day = await (await fetch(base + latest.file, { cache: "no-cache" })).json();
    store.date = day.date;
    store.regions = {};
    store.regionNames = {};
    for (const [code, r] of Object.entries(day.regions)) {
      store.regions[code] = r.items;
      store.regionNames[code] = r.name;
    }
    store.loaded = true;
  } catch (e) {
    store.loaded = false;
  }
  return store.loaded;
}

export const priceDate = () => store.date;
export const regionNames = () => store.regionNames;
export const isLoaded = () => store.loaded;

function rowFor(code, food) {
  const items = store.regions[code];
  if (!items) return null;
  for (const kc of food.kcs || [food.kc]) {
    const hit =
      items.find((x) => x.ic === food.ic && x.kc === kc && x.rc === food.rc && x.p[P.today]) ||
      items.find((x) => x.ic === food.ic && x.kc === kc && x.p[P.today]);
    if (hit) return hit;
  }
  return items.find((x) => x.ic === food.ic && x.kc === food.kc) || null;
}

function priceRow(code, food) {
  const own = rowFor(code, food);
  if (own && own.p[P.today]) return { row: own, region: code, fallback: false };
  const seoul = rowFor("1101", food);
  if (seoul && seoul.p[P.today]) return { row: seoul, region: "1101", fallback: true };
  return own ? { row: own, region: code, fallback: false } : null;
}

export function quote(food, code) {
  const found = priceRow(code, food);
  if (!found) return { food, level: "none" };
  const p = found.row.p;
  const now = p[P.today] ?? p[P.week];
  const base = p[P.normal] ?? p[P.year];
  const month = p[P.month];
  if (!now) return { food, level: "none", unit: found.row.u };
  const vsNormal = base ? now / base : null;
  const vsMonth = month ? now / month : null;
  const ref = vsNormal ?? vsMonth;
  const level = ref == null ? "ok" : ref <= GOOD_AT ? "good" : ref >= BAD_AT ? "bad" : "ok";
  const proteinPer1000 = food.pro ? (food.g * food.pro) / 100 / now * 1000 : null;
  const kcalPer1000 = food.kcal ? (food.g * food.kcal) / 100 / now * 1000 : null;
  return {
    food,
    level,
    now,
    unit: found.row.u,
    vsNormal,
    vsMonth,
    vsYear: p[P.year] ? now / p[P.year] : null,
    series: p,
    proteinPer1000,
    kcalPer1000,
    region: found.region,
    fallback: found.fallback
  };
}

export function pct(ratio) {
  if (ratio == null) return "";
  const d = Math.round((ratio - 1) * 100);
  if (d === 0) return "같아요";
  return d > 0 ? `${d}% 비싸요` : `${-d}% 싸요`;
}

export function won(n) {
  return n == null ? "-" : `${Math.round(n).toLocaleString("ko-KR")}원`;
}

const PROCESSED = /(고추장|간장|된장|쌈장|초장|청국장|소스|주스|즙|가루|액젓|오일|기름|식초|케첩|마요|잼|시럽|과자|라면|만두|떡볶이)/;

export function matchFood(name, kind) {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  if (PROCESSED.test(text)) return null;
  let best = null;
  let bestLen = 0;
  for (const f of FOODS) {
    for (const k of f.keys) {
      const key = k.trim();
      if (key && text.includes(key) && key.length > bestLen) {
        best = f;
        bestLen = key.length;
      }
    }
  }
  if (best) return best;
  if (kind) return FOODS.find((f) => (f.kinds || []).includes(kind)) || null;
  return null;
}

export function substitutes(food, code, limit = 3) {
  const mine = quote(food, code);
  const mineRatio = mine.vsNormal ?? 1;
  return FOODS.filter((f) => f.group === food.group && f.id !== food.id && f.ic !== food.ic)
    .map((f) => quote(f, code))
    .filter((q) => q.level !== "none" && (q.vsNormal ?? 1) <= Math.min(1, mineRatio - 0.05))
    .sort((a, b) => (a.vsNormal ?? 1) - (b.vsNormal ?? 1))
    .slice(0, limit);
}

export function board(code) {
  return FOODS.map((f) => quote(f, code)).filter((q) => q.level !== "none");
}

export function proteinRanking(code, limit = 12) {
  return board(code)
    .filter((q) => q.food.pro >= 8 && q.proteinPer1000)
    .sort((a, b) => b.proteinPer1000 - a.proteinPer1000)
    .slice(0, limit);
}

export function regionCompare(food) {
  return Object.keys(store.regions)
    .map((code) => {
      const r = rowFor(code, food);
      return r && r.p[P.today] ? { code, name: store.regionNames[code], now: r.p[P.today] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.now - b.now);
}

export function groupLabel(g) {
  return GROUPS[g] || g;
}

export { FOODS, GROUPS };
