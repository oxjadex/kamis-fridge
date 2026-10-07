import {
  LEVEL, P, FOODS, quote, pct, won, matchFood, substitutes, board, proteinRanking,
  regionCompare, groupLabel, priceDate, regionNames, isLoaded
} from "./price.js";

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

function verdict(q) {
  if (q.level === "none") return "오늘 가격 정보가 없어요";
  const ref = q.vsNormal != null ? `평년보다 ${pct(q.vsNormal)}` : q.vsMonth != null ? `지난달보다 ${pct(q.vsMonth)}` : "";
  return ref;
}

function advice(q) {
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
    ${per}
    ${subs.length ? `<h4>같은 쓰임새인데 지금 싼 것</h4>${subs.map((x) => row(x)).join("")}` : ""}
    ${q.fallback ? `<p class="pnote">이 지역 조사값이 없어 서울 가격으로 보여 줘요.</p>` : ""}
  </div>`;
}

export function createShop({ getItems, onRegionChange }) {
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
      return;
    }
    const items = getItems();
    body.innerHTML =
      tab === "fridge" ? fridgeTab(items, code) :
      tab === "board" ? boardTab(code) :
      tab === "protein" ? proteinTab(code) :
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
