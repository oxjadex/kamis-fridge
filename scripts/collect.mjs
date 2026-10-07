import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { call, rows, errorCode, num } from "./kamis.mjs";

const CATEGORIES = ["100", "200", "300", "400", "500", "600"];
const CANDIDATE_REGIONS = {
  "1101": "서울", "2100": "부산", "2200": "대구", "2300": "인천", "2401": "광주", "2501": "대전", "2601": "울산", "2701": "세종",
  "3111": "수원", "3112": "성남", "3113": "의정부", "3138": "고양", "3145": "용인", "3211": "춘천", "3214": "강릉", "3311": "청주",
  "3411": "천안", "3511": "전주", "3613": "순천", "3711": "포항", "3714": "안동", "3814": "창원", "3818": "김해", "3911": "제주"
};

function kstDate(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 3600000 - offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

function compact(item) {
  return {
    n: item.item_name,
    ic: item.item_code,
    k: item.kind_name,
    kc: item.kind_code,
    r: item.rank,
    rc: item.rank_code,
    u: item.unit,
    p: [item.dpr1, item.dpr3, item.dpr4, item.dpr5, item.dpr6, item.dpr7].map(num)
  };
}

async function regionsToUse(day) {
  const file = "data/regions.json";
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const found = {};
  for (const [code, name] of Object.entries(CANDIDATE_REGIONS)) {
    const r = await call("dailyPriceByCategoryList", {
      p_product_cls_code: "01", p_country_code: code, p_regday: day, p_convert_kg_yn: "N", p_item_category_code: "500"
    }, { retries: 2 });
    const n = r.ok ? rows(r.json).length : 0;
    console.log("region", code, name, n);
    if (n > 0) found[code] = name;
  }
  writeFileSync(file, JSON.stringify(found, null, 1));
  return found;
}

async function collectDay(day, regions) {
  const out = { date: day, fetchedAt: new Date().toISOString(), regions: {} };
  let total = 0;
  for (const [code, name] of Object.entries(regions)) {
    const items = [];
    for (const cat of CATEGORIES) {
      const r = await call("dailyPriceByCategoryList", {
        p_product_cls_code: "01", p_country_code: code, p_regday: day, p_convert_kg_yn: "N", p_item_category_code: cat
      });
      if (!r.ok) {
        console.log("fail", code, cat, r.error);
        continue;
      }
      const err = errorCode(r.json);
      if (err) {
        console.log("error", code, cat, err);
        continue;
      }
      for (const it of rows(r.json)) items.push({ c: cat, ...compact(it) });
    }
    out.regions[code] = { name, items };
    total += items.length;
    console.log(day, code, name, items.length);
  }
  return { out, total };
}

const day = process.argv[2] || kstDate(0);
mkdirSync("data/daily", { recursive: true });
const regions = await regionsToUse(day);
const { out, total } = await collectDay(day, regions);
if (total === 0) {
  console.log("no prices for", day, "- nothing written");
  process.exit(0);
}
writeFileSync(`data/daily/${day}.json`, JSON.stringify(out));
writeFileSync("data/latest.json", JSON.stringify({ date: day, file: `daily/${day}.json` }));
console.log("wrote", day, total, "rows");
