import {
  LEVEL, P, FOODS, quote, pct, won, matchFood, substitutes, board, proteinRanking,
  regionCompare, groupLabel, priceDate, regionNames, isLoaded
} from "./price.js";
import { ledgerSummary } from "./ledger.js";
import { loadHistory, seasonality, percentile, forecastText, seasonBars, yearLine } from "./season.js";

const REGION_KEY = "kamis-region";
const NATIONAL_ITEMS = new Set(["9903", "4304", "4402", "9901", "4301", "4401", "9908"]);

export function currentRegion() {
  try {
    return localStorage.getItem(REGION_KEY) || "1101";
  } catch (e) {
    return "1101";
  }
}

function setRegion(code) {
  try {
    localStorage.setItem(REGION_KEY, code);
  } catch (e) {}
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function dot(level) {
  return `<i class="pdot" style="background:${LEVEL[level].color}"></i>`;
}

function spark(series) {
  const order = [P.year, P.normal, P.month, P.twoWeeks, P.week, P.today];
  const v = order.map((i) => series[i]);
  const ok = v.filter((x) => x != null);
  if (ok.length < 2) return "";
  const lo = Math.min(...ok);
  const hi = Math.max(...ok);
  const span = hi - lo || 1;
  const pts = [];
  v.forEach((x, i) => {
    if (x == null) return;
    pts.push(`${(i / (v.length - 1)) * 56 + 2},${20 - ((x - lo) / span) * 16}`);
  });
  return `<svg class="spark" viewBox="0 0 60 24"><polyline points="${pts.join(" ")}"/><circle cx="${pts[pts.length - 1].split(",")[0]}" cy="${pts[pts.length - 1].split(",")[1]}" r="2.6"/></svg>`;
}

export function verdict(q) {
  if (q.level === "none") return "오늘 가격 정보가 없어요";
  const ref = q.vsNormal != null ? `평년보다 ${pct(q.vsNormal)}` : q.vsMonth != null ? `지난달보다 ${pct(q.vsMonth)}` : "";
  return ref;
}

export function advice(q) {
  if (q.level === "good") return "지금 사면 좋아요";
  if (q.level === "bad") return "급하지 않으면 미뤄요";
  if (q.level === "ok") return "평소 가격이에요";
  return "";
}

function row(q, extra = "") {
  return `<button type="button" class="prow" data-food="${q.food.id}">
    ${dot(q.level)}
    <span class="pname">${esc(q.food.name)}</span>
    ${spark(q.series || [])}
    <span class="pnum"><b>${won(q.now)}</b><small class="lv-${q.level}">${esc(verdict(q))}</small></span>
    ${extra}
  </button>`;
}

function fridgeTab(items, code) {
  const matched = [];
  const unmatched = [];
  for (const it of items) {
    const f = matchFood(it.name, it.kind);
    if (f) matched.push({ it, q: quote(f, code) });
    else unmatched.push(it);
  }
  if (!matched.length) return `<p class="empty">냉장고 재료 중 KAMIS 품목과 연결된 게 아직 없어요.</p>`;
  const order = { bad: 0, ok: 1, good: 2, none: 3 };
  matched.sort((a, b) => order[a.q.level] - order[b.q.level]);
  const bad = matched.filter((m) => m.q.level === "bad").length;
  const good = matched.filter((m) => m.q.level === "good").length;
  let html = `<p class="psum">내 재료 ${matched.length}개 중 <b class="lv-good">${good}개는 지금 싸고</b>, <b class="lv-bad">${bad}개는 비싸요</b>.</p>`;
  for (const { it, q } of matched) {
    const subs = q.level === "bad" ? substitutes(q.food, code) : [];
    const subHtml = subs.length
      ? `<div class="psubs">대신 ${subs.map((s) => `<span data-food="${s.food.id}">${dot(s.level)}${esc(s.food.name)} <small>${esc(pct(s.vsNormal))}</small></span>`).join("")}</div>`
      : "";
    html += `<div class="pcard">
      <div class="pcard-top"><span class="pmine">${esc(it.name)}</span><span class="parrow">→</span>${row(q)}</div>
      <div class="padvice lv-${q.level}">${advice(q)}</div>
      ${subHtml}
    </div>`;
  }
  if (unmatched.length) html += `<p class="pnote">KAMIS 조사 품목이 아닌 재료: ${unmatched.map((u) => esc(u.name)).join(", ")}</p>`;
  return html;
}

function boardTab(code) {
  const qs = board(code);
  const groups = {};
  for (const q of qs) (groups[q.food.group] ||= []).push(q);
  const cheap = qs.filter((q) => q.level === "good").sort((a, b) => (a.vsNormal ?? 1) - (b.vsNormal ?? 1)).slice(0, 5);
  let html = `<section><h4>오늘 제일 싼 것</h4>${cheap.map((q) => row(q)).join("")}</section>`;
  for (const [g, list] of Object.entries(groups)) {
    html += `<section><h4>${esc(groupLabel(g))}</h4>${list.map((q) => row(q)).join("")}</section>`;
  }
  return html;
}

function proteinTab(code) {
  const list = proteinRanking(code, 14);
  if (!list.length) return `<p class="empty">가격 정보가 없어요.</p>`;
  const top = list[0].proteinPer1000;
  return `<p class="psum">1,000원으로 살 수 있는 단백질 양이에요. 영양값은 국가표준식품성분표 기준 근사값이에요.</p>` +
    list.map((q, i) => `<button type="button" class="pbar" data-food="${q.food.id}">
      <span class="prank">${i + 1}</span>
      <span class="pname">${dot(q.level)}${esc(q.food.name)}</span>
      <span class="ptrack"><span style="width:${Math.max(6, (q.proteinPer1000 / top) * 100)}%"></span></span>
      <b>${q.proteinPer1000.toFixed(1)}g</b>
    </button>`).join("");
}

function ledgerTab(buys) {
  if (!buys.length) return `<p class="empty">아직 기록이 없어요. 재료를 넣을 때 KAMIS 품목과 이어지면 그날 시세가 자동으로 남아요.</p>`;
  const s = ledgerSummary(buys);
  const diff = s.saved >= 0 ? `<b class="lv-good">${won(s.saved)} 덜</b>` : `<b class="lv-bad">${won(-s.saved)} 더</b>`;
  let html = `<p class="psum">${s.count}번 샀어요 · 평년 시세로 샀을 때보다 ${diff} 썼어요.</p>
    <div class="pgrid ledger">
      <div><small>초록불에 산 것</small><b class="lv-good">${s.by.good}번</b></div>
      <div><small>노란불</small><b class="lv-ok">${s.by.ok}번</b></div>
      <div><small>빨간불</small><b class="lv-bad">${s.by.bad}번</b></div>
    </div>
    ${s.paidCount ? `<p class="pnote">직접 적은 산 값 합계 ${won(s.paid)} (${s.paidCount}건)</p>` : ""}`;
  for (const b of [...buys].reverse()) {
    const d = b.normal ? b.normal - b.now : null;
    html += `<div class="lrow">
      ${dot(b.level)}
      <span class="pname" data-food="${esc(b.food)}">${esc(b.name)}<small>${esc(b.d)} · ${esc(b.regionName || "")}</small></span>
      <span class="pnum"><b>${won(b.now)}</b><small>${d == null ? "" : d >= 0 ? `평년보다 ${won(d)} 쌌어요` : `평년보다 ${won(-d)} 비쌌어요`}${b.paid ? ` · 산 값 ${won(b.paid)}` : ""}</small></span>
      <button type="button" class="ldel" data-del="${esc(b.id)}" aria-label="기록 지우기">×</button>
    </div>`;
  }
  return html;
}

function townTab(foodId, items) {
  const foods = FOODS.filter((f) => regionCompare(f).length > 1);
  const mine = items.map((it) => matchFood(it.name, it.kind)).filter(Boolean);
  const selected = foods.find((f) => f.id === foodId) || mine.find((f) => foods.includes(f)) || foods.find((f) => f.id === "napa") || foods[0];
  if (!selected) return `<p class="empty">지역 가격이 없어요.</p>`;
  const list = regionCompare(selected);
  const lo = list[0].now;
  const hi = list[list.length - 1].now;
  const national = NATIONAL_ITEMS.has(selected.ic);
  const opts = foods.map((f) => `<option value="${f.id}" ${f.id === selected.id ? "selected" : ""}>${esc(f.name)}</option>`).join("");
  const here = currentRegion();
  const note = national
    ? `<p class="pnote">축산물은 KAMIS가 전국 단일 가격으로 발표해요.</p>`
    : `<p class="psum">제일 싼 곳 <b>${esc(list[0].name)}</b> ${won(lo)} · 제일 비싼 곳 <b>${esc(list[list.length - 1].name)}</b> ${won(hi)} (${Math.round((hi / lo - 1) * 100)}% 차이)</p>`;
  return `<select id="townFood">${opts}</select>${note}` +
    list.map((r) => `<div class="pbar ${r.code === here ? "here" : ""}">
      <span class="pname">${esc(r.name)}</span>
      <span class="ptrack"><span style="width:${hi === lo ? 100 : 25 + ((r.now - lo) / (hi - lo)) * 75}%"></span></span>
      <b>${won(r.now)}</b>
    </div>`).join("");
}

function detail(foodId, code) {
  const f = FOODS.find((x) => x.id === foodId);
  if (!f) return "";
  const q = quote(f, code);
  const s = q.series || [];
  const cells = [["오늘", P.today], ["1주 전", P.week], ["2주 전", P.twoWeeks], ["1달 전", P.month], ["1년 전", P.year], ["평년", P.normal]]
    .map(([l, i]) => `<div><small>${l}</small><b>${won(s[i])}</b></div>`).join("");
  const subs = substitutes(f, code);
  const per = q.proteinPer1000 ? `<p class="psum">1,000원으로 단백질 <b>${q.proteinPer1000.toFixed(1)}g</b> · ${Math.round(q.kcalPer1000)}kcal</p>` : "";
  return `<div class="pdetail">
    <button type="button" class="pback" data-back>← 목록</button>
    <h4>${dot(q.level)} ${esc(f.name)} <small>(${esc(q.unit || "")}, ${esc(groupLabel(f.group))})</small></h4>
    <p class="padvice lv-${q.level}">${advice(q)} · ${esc(verdict(q))}</p>
    <div class="pgrid">${cells}</div>
    <div class="pseason" id="pseason" data-id="${esc(f.id)}"><p class="pnote">지난 3년 가격을 살펴보는 중…</p></div>
    ${per}
    ${subs.length ? `<h4>같은 쓰임새인데 지금 싼 것</h4>${subs.map((x) => row(x)).join("")}` : ""}
    ${q.fallback ? `<p class="pnote">이 지역 조사값이 없어 서울 가격으로 보여 줘요.</p>` : ""}
  </div>`;
}

function rankText(r) {
  const pctile = Math.round(r.rank * 100);
  if (pctile <= 20) return `최근 1년 중 <b>하위 ${Math.max(pctile, 1)}%</b>로 싼 편이에요`;
  if (pctile >= 80) return `최근 1년 중 <b>상위 ${Math.max(100 - pctile, 1)}%</b>로 비싼 편이에요`;
  return `최근 1년 중 <b>중간쯤(${pctile}%)</b>이에요`;
}

async function fillSeason(el, foodId, code) {
  const f = FOODS.find((x) => x.id === foodId);
  const h = await loadHistory(foodId);
  if (!el.isConnected || el.dataset.id !== foodId) return;
  if (!h || !h.points || h.points.length < 30) {
    el.innerHTML = `<p class="pnote">기간별 가격 기록이 아직 부족해요.</p>`;
    return;
  }
  const today = priceDate();
  const month = Number(today.slice(5, 7));
  const q = quote(f, code);
  const season = seasonality(h.points);
  const fc = forecastText(season, month);
  const rk = percentile(h.points, q.now, today);
  const clash =
    rk && q.level === "good" && rk.rank >= 0.8 ? "평년보다는 싸지만 최근 1년 중엔 비싼 편이에요. 요 몇 달 값이 내려와 있었으니 급하지 않으면 조금 기다려 봐요." :
    rk && q.level === "bad" && rk.rank <= 0.2 ? "평년보다는 비싸지만 최근 1년 중엔 싼 편이에요. 값이 한동안 높았던 품목이라 지금이 그나마 나은 때예요." : "";
  el.innerHTML = `<h4>살 타이밍 예보</h4>
    ${fc ? `<p class="psum">${esc(fc.text)}</p>` : ""}
    ${season && !fc.flat ? `${seasonBars(season, month)}<p class="pnote">달마다 그 앞뒤 1년 평균과 견준 값이에요 (${season.years}년치, 서울 평균). 초록이 제일 싼 달.</p>` : ""}
    ${rk ? `<p class="psum">오늘 ${won(q.now)}은 ${rankText(rk)} · 1년 최저 ${won(rk.min)} / 최고 ${won(rk.max)}</p>${yearLine(h.points, rk.from, q.now)}` : ""}
    ${clash ? `<p class="padvice lv-ok">${clash}</p>` : ""}`;
}

export function createShop({ getItems, getBuys, removeBuy, onRegionChange }) {
  const dlg = document.getElementById("shopDlg");
  const body = document.getElementById("shopBody");
  const sel = document.getElementById("shopRegion");
  const tabs = document.getElementById("shopTabs");
  let tab = "fridge";
  let town = null;
  let focus = null;

  function fillRegions() {
    const names = regionNames();
    const here = currentRegion();
    sel.innerHTML = Object.entries(names).map(([c, n]) => `<option value="${c}" ${c === here ? "selected" : ""}>${esc(n)}</option>`).join("");
  }

  function render() {
    const code = currentRegion();
    document.getElementById("shopDate").textContent = isLoaded() ? `KAMIS ${priceDate()} 소매가격 · ${regionNames()[code] || ""}` : "가격을 불러오지 못했어요";
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", b.dataset.tab === tab));
    if (!isLoaded()) {
      body.innerHTML = `<p class="empty">가격 데이터가 아직 없어요.</p>`;
      return;
    }
    if (focus) {
      body.innerHTML = detail(focus, code);
      const ps = document.getElementById("pseason");
      if (ps) fillSeason(ps, focus, code);
      return;
    }
    const items = getItems();
    body.innerHTML =
      tab === "fridge" ? fridgeTab(items, code) :
      tab === "board" ? boardTab(code) :
      tab === "protein" ? proteinTab(code) :
      tab === "ledger" ? ledgerTab(getBuys()) :
      townTab(town, items);
    const tf = document.getElementById("townFood");
    if (tf) tf.addEventListener("change", () => { town = tf.value; render(); });
  }

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    tab = b.dataset.tab;
    focus = null;
    render();
  });
  body.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      removeBuy(del.dataset.del);
      render();
      return;
    }
    if (e.target.closest("[data-back]")) {
      focus = null;
      render();
      return;
    }
    const t = e.target.closest("[data-food]");
    if (t && !e.target.closest("select")) {
      focus = t.dataset.food;
      render();
      body.scrollTop = 0;
    }
  });
  sel.addEventListener("change", () => {
    setRegion(sel.value);
    render();
    onRegionChange && onRegionChange(sel.value);
  });

  return {
    open(startTab) {
      if (startTab) tab = startTab;
      focus = null;
      fillRegions();
      render();
      dlg.showModal();
    },
    openFood(foodId) {
      fillRegions();
      focus = foodId;
      render();
      dlg.showModal();
    }
  };
}

export function itemQuote(it) {
  const f = matchFood(it.name, it.kind);
  return f ? quote(f, currentRegion()) : null;
}
