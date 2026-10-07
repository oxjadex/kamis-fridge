import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const load = (f) => import(pathToFileURL(join(process.cwd(), "src", f)).href);
const { FOODS } = await load("foods.js");
const { DISHES } = await load("dishes.js");
const byId = new Map(FOODS.map((f) => [f.id, f]));

const monthly = new Map();
function monthsOf(id) {
  if (monthly.has(id)) return monthly.get(id);
  const file = `data/history/${id}.json`;
  const m = new Map();
  if (existsSync(file)) {
    const acc = new Map();
    for (const [d, p] of JSON.parse(readFileSync(file, "utf8")).points) {
      const k = d.slice(0, 7);
      const a = acc.get(k) || [];
      a.push(p);
      acc.set(k, a);
    }
    for (const [k, a] of acc) m.set(k, a.reduce((x, y) => x + y, 0) / a.length);
  }
  monthly.set(id, m);
  return m;
}

const all = new Set();
for (const d of DISHES) for (const [id] of d.items) for (const k of monthsOf(id).keys()) all.add(k);
const months = [...all].sort();
const last = months.at(-1);
const first = months.find((k) => k >= `${Number(last.slice(0, 4)) - 3}-${last.slice(5)}`) || months[0];
const range = months.filter((k) => k >= first);

const dishes = {};
const gaps = {};
for (const d of DISHES) {
  dishes[d.id] = range.map((k) => {
    let sum = 0;
    for (const [id, g] of d.items) {
      const food = byId.get(id);
      const m = monthsOf(id);
      let p = m.get(k);
      if (p == null) {
        const prev = [...m.keys()].filter((x) => x < k).sort().at(-1);
        p = prev ? m.get(prev) : null;
        if (p != null) gaps[d.id] = (gaps[d.id] || 0) + 1;
      }
      if (p == null) return null;
      sum += (p * g) / food.g;
    }
    return Math.round(sum);
  });
}
writeFileSync("data/dish-index.json", JSON.stringify({ region: "1101", months: range, dishes, filled: gaps }));
for (const d of DISHES) {
  const v = dishes[d.id];
  console.log(d.id, v[0], v.at(-1), v.filter((x) => x == null).length, gaps[d.id] || 0);
}
