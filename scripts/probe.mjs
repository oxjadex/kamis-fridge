import { call, rows, errorCode, credentials } from "./kamis.mjs";

const day = process.argv[2] || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const { key } = credentials();
console.log("key", key === "TEST" ? "TEST" : key.slice(0, 8) + "...", "day", day);

const checks = [
  ["dailyPriceByCategoryList", { p_product_cls_code: "01", p_country_code: "1101", p_regday: day, p_convert_kg_yn: "N", p_item_category_code: "200" }],
  ["periodRetailProductList", { p_productclscode: "01", p_startday: "2026-09-01", p_endday: day, p_itemcategorycode: "200", p_itemcode: "211", p_kindcode: "02", p_productrankcode: "04", p_countrycode: "1101", p_convert_kg_yn: "N" }],
  ["monthlySalesList", { p_yyyy: day.slice(0, 4), p_period: "3", p_itemcategorycode: "200", p_itemcode: "211", p_kindcode: "02", p_graderank: "1", p_countycode: "1101", p_convert_kg_yn: "N" }],
  ["recentlyPriceTrendList", { p_productno: "211", p_regday: day }]
];

for (const [action, params] of checks) {
  const r = await call(action, params, { retries: 2 });
  if (!r.ok) {
    console.log(action, "FAIL", r.error);
    continue;
  }
  const err = errorCode(r.json);
  const list = rows(r.json);
  console.log(action, err ? "error " + err : "ok", "rows", list.length, list[0] ? JSON.stringify(list[0]).slice(0, 220) : JSON.stringify(r.json).slice(0, 220));
}
