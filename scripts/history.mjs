import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { call, rows, errorCode, num } from "./kamis.mjs";

const { FOODS } = await import(pathToFileURL(join(process.cwd(), "src", "foods.js")).href);

const YEARS = Number(process.argv[2] || 3);
const latest = JSON.parse(readFileSync("data/latest.json", "utf8"));
const daily = JSON.parse(readFileSync(join("data", latest.file), "utf8"));
const CATEGORY = {};
for (const r of Object.values(daily.regions)) for (const it of r.items) CATEGORY[it.ic] = it.c;
const only = process.argv.slice(3);

function kstToday() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function shiftYears(day, n) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}

function nextDay(day) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function series(food, start, end) {
  const byDay = new Map();
  const errors = [];
  for (const kc of food.kcs || [food.kc]) {
    const s = await seriesOf(food, kc, start, end);
    if (s.error) errors.push(`${kc}:${s.error}`);
    for (const [d, p] of s.points) {
      const a = byDay.get(d) || [];
      a.push(p);
      byDay.set(d, a);
    }
  }
  const points = [...byDay.entries()].map(([d, a]) => [d, Math.round(a.reduce((x, y) => x + y, 0) / a.length)]);
  const allFailed = errors.length === (food.kcs || [food.kc]).length;
  return allFailed ? { error: errors.join("|"), points } : { points };
}

async function seriesOf(food, kc, start, end) {
  const r = await call("periodRetailProductList", {
    p_productclscode: "01",
    p_startday: start,
    p_endday: end,
    p_itemcategorycode: CATEGORY[food.ic] || "200",
    p_itemcode: food.ic,
    p_kindcode: kc,
    p_productrankcode: food.rc,
    p_countrycode: "1101",
    p_convert_kg_yn: "N"
  });
  if (!r.ok) return { error: r.error, points: [] };
  const err = errorCode(r.json);
  if (err) return { error: err, points: [] };
  const points = [];
  for (const x of rows(r.json)) {
    if (x.countyname && x.countyname !== "평균") continue;
    const p = num(x.price);
    if (!p || !x.yyyy || !x.regday) continue;
    points.push([`${x.yyyy}-${x.regday.replace("/", "-")}`, p]);
  }
  return { points };
}


mkdirSync("data/history", { recursive: true });
const end = kstToday();
const prev = only.length && existsSync("data/history/index.json") ? JSON.parse(readFileSync("data/history/index.json", "utf8")).items : {};
const index = { ...prev };
for (const food of FOODS) {
  if (only.length && !only.includes(food.id)) continue;
  const all = new Map();
  let errors = [];
  let to = end;
  for (let y = 0; y < YEARS; y++) {
    const from = nextDay(shiftYears(to, -1));
    const s = await series(food, from, to);
    if (s.error) errors.push(s.error);
    for (const [d, p] of s.points) all.set(d, p);
    to = shiftYears(to, -1);
  }
  const points = [...all.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  index[food.id] = { n: points.length, from: points[0]?.[0] || null, to: points.at(-1)?.[0] || null, errors };
  console.log(food.id, points.length, errors.join(","));
  if (points.length) writeFileSync(`data/history/${food.id}.json`, JSON.stringify({ id: food.id, unit: food.name, points }));
}
writeFileSync("data/history/index.json", JSON.stringify({ updated: end, years: YEARS, items: index }, null, 1));
