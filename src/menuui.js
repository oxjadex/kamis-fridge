import { LEVEL, won, pct, matchFood, priceDate, regionNames, isLoaded } from "./price.js";
import { currentRegion, setRegion } from "./shop.js";
import { dishQuote, menuBoard, dishesUsing, seasonOfDish, dishIndex, dineData, DISHES, levelOf } from "./menu.js";
import { forecastText, seasonBars, yearLine } from "./season.js";
import { CATS } from "./dishes.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dot = (level) => `<i class="pdot" style="background:${LEVEL[level].color}"></i>`;
const ADVICE = { good: "해 먹기 좋은 날이에요", ok: "평소 재료값이에요", bad: "재료값이 비싼 날이에요", none: "" };
const KIMJANG_ADVICE = { good: "김장 재료값이 싼 편이에요", ok: "김장 재료값이 평소 수준이에요", bad: "김장 재료값이 비싼 편이에요", none: "" };
const short = (name) => name.replace(/ \(.*\)$/, "").replace(/ \d.*$/, "");

function vsText(r) {
  if (r == null) return "";
  return Math.round((r - 1) * 100) === 0 ? "평년과 같아요" : `평년보다 ${pct(r)}`;
}

function moveText(r) {
  const d = Math.round((r - 1) * 100);
  if (d === 0) return "그대로";
  return d > 0 ? `${d}% 올랐어요` : `${-d}% 내렸어요`;
}

function dishRow(q) {
  const out = q.outside;
  const gap = out ? out.price - q.now : null;
  return `<button type="button" class="mrow" data-dish="${q.dish.id}">
    ${dot(q.level)}
    <span class="mname">${esc(q.dish.name)}<small class="lv-${q.level}">${esc(vsText(q.ratio))}</small></span>
    <span class="mnum"><b>${won(q.now)}</b>${out ? `<small>사 먹으면 ${won(out.price)}</small>` : ""}</span>
    ${gap != null ? `<span class="mgap">${won(gap)}<small>아껴요</small></span>` : ""}
  </button>`;
}

function homeMeals(code) {
  const qs = menuBoard(code, (d) => d.out && d.cat !== "김장").filter((q) => q.outside);
  if (!qs.length) return null;
  const home = qs.reduce((a, q) => a + q.now, 0) / qs.length;
  const out = qs.reduce((a, q) => a + q.outside.price, 0) / qs.length;
  return { home, out, n: qs.length };
}

function boardTab(code, cat) {
  const qs = menuBoard(code, (d) => d.cat !== "김장" && (!cat || d.cat === cat));
  const good = menuBoard(code).filter((q) => q.level === "good");
  const hm = homeMeals(code);
  const chips = [["", "전체"], ...CATS.filter((c) => c !== "김장").map((c) => [c, c])]
    .map(([v, l]) => `<button type="button" data-cat="${v}" class="${cat === v ? "sel" : ""}">${l}</button>`).join("");
  return `${hm ? `<div class="mhero">
      <div><small>집에서 해 먹으면</small><b>${won(hm.home)}</b></div>
      <div class="vs">vs</div>
      <div><small>사 먹으면</small><b>${won(hm.out)}</b></div>
    </div>
    <p class="pnote center">외식비 조사 메뉴 ${hm.n}가지의 1인분 평균 · 집밥은 오늘 KAMIS 소매가로 계산한 재료비</p>` : ""}
    <p class="psum">${good.length ? `오늘은 <b class="lv-good">${good.slice(0, 3).map((q) => esc(q.dish.name)).join(", ")}</b> 해 먹기 좋아요.` : "오늘 평년보다 확 싸진 메뉴는 없어요. 값이 덜 오른 순서로 보여 드려요."}</p>
    <div class="mchips">${chips}</div>
    ${qs.map(dishRow).join("")}
    <p class="pnote">재료비는 1인분 기준이에요. 양념 · 두부처럼 KAMIS가 조사하지 않는 재료는 빠져 있어요.</p>`;
}

function gramText(g) {
  if (g >= 1000) return `${(g / 1000).toFixed(g % 1000 ? 1 : 0)}kg`;
  return `${g}g`;
}

function bars(q) {
  return q.shares.map((p) => `<div class="mbar">
      <span class="mbar-name">${dot(p.q.level)}${esc(short(p.food.name))} <small>${gramText(p.grams)}</small></span>
      <span class="mbar-track"><i style="width:${Math.max(2, p.share * 100).toFixed(1)}%;background:${LEVEL[p.q.level].color}"></i></span>
      <b>${won(p.now)}</b>
    </div>`).join("");
}

function indexPoints(id) {
  const ix = dishIndex();
  if (!ix || !ix.dishes[id]) return [];
  return ix.months.map((m, i) => [`${m}-15`, ix.dishes[id][i]]).filter(([, v]) => v != null);
}

function detailBody(d, code) {
  const q = dishQuote(d, code);
  const out = q.outside;
  const month = Number((priceDate() || "2026-01").slice(5, 7));
  const season = seasonOfDish(d.id);
  const fc = season ? forecastText(season, month) : null;
  const pts = indexPoints(d.id);
  const kimjang = d.cat === "김장";
  const fcText = fc ? fc.text.replace("제일 싸고", kimjang ? "재료비가 제일 싸고" : "제일 싸게 해 먹고") : "";
  return `<h4>${dot(q.level)} ${esc(d.name)}</h4>
    <div class="mhero">
      <div><small>${kimjang ? "재료비 합계" : "집밥 1인분"}</small><b>${won(q.now)}</b><small class="lv-${q.level}">${esc(vsText(q.ratio))}</small></div>
      ${out ? `<div class="vs">vs</div><div><small>${esc(out.prov)} ${esc(out.name)}</small><b>${won(out.price)}</b><small>${esc(out.month)} 참가격</small></div>` : ""}
    </div>
    ${out ? `<p class="psum center">해 먹으면 <b class="lv-good">${won(out.price - q.now)}</b> 아껴요 · 재료비는 외식값의 ${Math.round((q.now / out.price) * 100)}%</p>` : ""}
    <p class="padvice lv-${q.level}">${kimjang ? KIMJANG_ADVICE[q.level] : ADVICE[q.level]}${q.vsYear ? ` · 1년 전보다 ${pct(q.vsYear)}` : ""}</p>
    <h4>재료비 내역</h4>
    ${bars(q)}
    ${q.pusher ? `<p class="psum">값을 끌어올린 재료는 <b class="lv-bad">${esc(short(q.pusher.food.name))}</b>예요. 평년보다 ${won(q.pusher.push)} 더 들어요.</p>` : ""}
    ${q.swaps.length ? `<h4>바꿔 넣으면</h4>${q.swaps.map((s) => `<div class="mswap">${dot(s.from.q.level)}${esc(short(s.from.food.name))} → ${dot(s.to.q.level)}<b>${esc(short(s.to.food.name))}</b><span>${won(s.after)} <small class="lv-good">−${won(s.save)}</small></span></div>`).join("")}` : ""}
    ${fc && !fc.flat ? `<h4>${kimjang ? "김장 재료가 제일 쌀 때" : "제철 예보"}</h4><p class="psum">${esc(fcText)}</p>${seasonBars(season, month)}<p class="pnote">달마다 앞뒤 1년 평균과 견준 재료비 (서울, ${season.years}년치). 초록이 제일 싼 달.</p>` : ""}
    ${pts.length > 12 ? `<h4>3년 동안의 재료비</h4><p class="psum">${esc(pts[0][0].slice(0, 7))} ${won(pts[0][1])} → 지금 ${won(q.now)} · ${moveText(q.now / pts[0][1])}</p>${yearLine(pts, pts[0][0], q.now)}<p class="pnote">서울 월평균 소매가 기준, 빨간 점선이 오늘</p>` : ""}
    ${q.borrowed.length ? `<p class="pnote">이 지역에서 조사되지 않아 서울 가격을 쓴 재료: ${esc(q.borrowed.map(short).join(", "))}</p>` : ""}
    <p class="pnote">계산에서 빠진 재료: ${esc([...(d.extra || []), ...q.missing].join(", ") || "없음")}${d.note ? ` · ${esc(d.note)}` : ""}</p>`;
}

function detail(id, code) {
  const d = DISHES.find((x) => x.id === id);
  if (!d) return "";
  return `<div class="pdetail"><button type="button" class="pback" data-back>← 뒤로</button>${detailBody(d, code)}</div>`;
}

function indexTab() {
  const ix = dishIndex();
  if (!ix) return `<p class="empty">지수 데이터를 불러오지 못했어요.</p>`;
  const rows = DISHES.filter((d) => d.cat !== "김장" && ix.dishes[d.id] && ix.dishes[d.id][0] != null)
    .map((d) => {
      const v = ix.dishes[d.id];
      return { d, a: v[0], b: v[v.length - 1], r: v[v.length - 1] / v[0] };
    })
    .sort((x, y) => y.r - x.r);
  const k = rows.find((x) => x.d.id === "kimchi-jjigae");
  const pts = indexPoints("kimchi-jjigae");
  if (!k || !pts.length) return `<p class="empty">지수 데이터가 부족해요.</p>`;
  const lo = pts.reduce((a, p) => (p[1] < a[1] ? p : a));
  const hi = pts.reduce((a, p) => (p[1] > a[1] ? p : a));
  return `<p class="psum">빅맥 지수처럼, <b>김치찌개 1인분을 집에서 끓이는 값</b>으로 밥상 물가를 재요.</p>
    <div class="mhero"><div><small>${esc(ix.months[0])}</small><b>${won(k.a)}</b></div><div class="vs">→</div><div><small>${esc(ix.months.at(-1))}</small><b>${won(k.b)}</b><small class="lv-${k.r > 1 ? "bad" : "good"}">${moveText(k.r)}</small></div></div>
    ${yearLine(pts, pts[0][0], null)}
    <p class="pnote center">3년 중 제일 쌌던 달 ${esc(lo[0].slice(0, 7))} ${won(lo[1])} · 제일 비쌌던 달 ${esc(hi[0].slice(0, 7))} ${won(hi[1])} (서울 월평균)</p>
    <h4>3년 사이 집밥 재료비 변화</h4>
    ${rows.map((x) => `<button type="button" class="mrow" data-dish="${x.d.id}">${dot(levelOf(x.r))}<span class="mname">${esc(x.d.name)}</span><span class="mnum"><b>${won(x.b)}</b><small>3년 전 ${won(x.a)}</small></span><span class="mgap lv-${x.r > 1 ? "bad" : "good"}">${x.r > 1 ? "+" : ""}${Math.round((x.r - 1) * 100)}%</span></button>`).join("")}`;
}

function kimjangTab(code) {
  const d = DISHES.find((x) => x.id === "kimjang");
  const names = regionNames();
  const all = Object.keys(names)
    .map((c) => ({ c, q: dishQuote(d, c) }))
    .filter((x) => !x.q.missing.length && !x.q.borrowed.length)
    .sort((a, b) => a.q.now - b.q.now);
  const mine = dishQuote(d, code);
  const top = all.length ? all[all.length - 1].q.now : 1;
  return `<div class="pdetail">${detailBody(d, code)}</div>
    <h4>지역별 김장 재료비</h4>
    ${all.map((x) => `<div class="mtown ${x.c === code ? "me" : ""}"><span>${esc(names[x.c])}</span><span class="mbar-track"><i style="width:${((x.q.now / top) * 100).toFixed(1)}%"></i></span><b>${won(x.q.now)}</b></div>`).join("")}
    <p class="pnote">김장 재료 8가지가 모두 그 지역에서 조사된 곳만 보여 줘요. ${esc(names[code] || "")}: ${mine.missing.length || mine.borrowed.length ? `${esc([...mine.missing, ...mine.borrowed].join(", "))}은 서울 가격으로 계산했어요` : "전부 그 지역 가격이에요"}.</p>`;
}

function fridgeTab(items, code) {
  const foods = [...new Set(items.map((it) => matchFood(it.name, it.kind)).filter(Boolean).map((f) => f.id))];
  if (!foods.length) return `<p class="empty">냉장고에 KAMIS 품목과 이어지는 재료가 없어요.</p>`;
  const list = dishesUsing(foods, code).slice(0, 8);
  return `<p class="psum">냉장고에 있는 재료로 시작해서, <b>모자란 것만 사면</b> 얼마인지 보여 줘요.</p>
    ${list.map((x) => `<button type="button" class="mrow" data-dish="${x.q.dish.id}">${dot(x.q.level)}
      <span class="mname">${esc(x.q.dish.name)}<small>있는 것: ${esc(x.used.map((p) => short(p.food.name)).join(", "))}</small></span>
      <span class="mnum"><b>${won(x.needCost)}</b><small>더 살 것 ${x.need.length}가지</small></span></button>`).join("")}`;
}

export function createMenu({ getItems }) {
  const dlg = document.getElementById("menuDlg");
  const body = document.getElementById("menuBody");
  const sel = document.getElementById("menuRegion");
  const tabs = document.getElementById("menuTabs");
  let tab = "board";
  let cat = "";
  let focus = null;

  function fillRegions() {
    const here = currentRegion();
    sel.innerHTML = Object.entries(regionNames()).map(([c, n]) => `<option value="${c}" ${c === here ? "selected" : ""}>${esc(n)}</option>`).join("");
  }

  function render() {
    const code = currentRegion();
    const dine = dineData();
    document.getElementById("menuDate").textContent = isLoaded()
      ? `KAMIS ${priceDate()} 소매가격 · ${regionNames()[code] || ""}${dine ? ` · 외식비 참가격 ${dine.month}` : ""}`
      : "가격을 불러오지 못했어요";
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", b.dataset.tab === tab));
    if (!isLoaded()) {
      body.innerHTML = `<p class="empty">가격 데이터가 아직 없어요.</p>`;
      return;
    }
    body.innerHTML = focus ? detail(focus, code) :
      tab === "board" ? boardTab(code, cat) :
      tab === "index" ? indexTab() :
      tab === "kimjang" ? kimjangTab(code) :
      fridgeTab(getItems(), code);
  }

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    tab = b.dataset.tab;
    focus = null;
    render();
    body.scrollTop = 0;
  });
  body.addEventListener("click", (e) => {
    if (e.target.closest("[data-back]")) {
      focus = null;
      render();
      return;
    }
    const c = e.target.closest("[data-cat]");
    if (c) {
      cat = c.dataset.cat;
      render();
      return;
    }
    const t = e.target.closest("[data-dish]");
    if (t) {
      focus = t.dataset.dish;
      render();
      body.scrollTop = 0;
    }
  });
  sel.addEventListener("change", () => {
    setRegion(sel.value);
    render();
  });

  return {
    open(startTab) {
      if (startTab) tab = startTab;
      focus = null;
      fillRegions();
      render();
      if (!dlg.open) dlg.showModal();
    },
    openDish(id) {
      fillRegions();
      focus = id;
      render();
      if (!dlg.open) dlg.showModal();
    }
  };
}
