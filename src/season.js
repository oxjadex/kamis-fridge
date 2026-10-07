const cache = new Map();

export function loadHistory(id, base = "data/") {
  if (!cache.has(id)) {
    cache.set(
      id,
      fetch(`${base}history/${id}.json`, { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  return cache.get(id);
}

function monthKey(day) {
  return day.slice(0, 7);
}

export function seasonality(points) {
  const byMonth = new Map();
  for (const [d, p] of points) {
    const k = monthKey(d);
    const m = byMonth.get(k) || [];
    m.push(p);
    byMonth.set(k, m);
  }
  const monthAvg = [...byMonth.entries()].map(([k, a]) => [k, a.reduce((s, x) => s + x, 0) / a.length]);
  const ratios = Array.from({ length: 12 }, () => []);
  for (let i = 0; i < monthAvg.length; i++) {
    const lo = Math.max(0, i - 6);
    const hi = Math.min(monthAvg.length, i + 6);
    if (hi - lo < 10) continue;
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += monthAvg[j][1];
    const ratio = monthAvg[i][1] / (sum / (hi - lo));
    ratios[Number(monthAvg[i][0].slice(5, 7)) - 1].push(ratio);
  }
  const index = ratios.map((a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null));
  const known = index.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (known.length < 9) return null;
  const cheap = known.reduce((a, b) => (b[1] < a[1] ? b : a));
  const dear = known.reduce((a, b) => (b[1] > a[1] ? b : a));
  const years = Math.max(1, Math.round((Date.parse(points.at(-1)[0]) - Date.parse(points[0][0])) / (365 * 86400000)));
  return { index, cheapMonth: cheap[0] + 1, cheapRatio: cheap[1], dearMonth: dear[0] + 1, dearRatio: dear[1], years };
}

export function percentile(points, now, today) {
  const from = new Date(new Date(today + "T00:00:00Z").getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const year = points.filter(([d]) => d >= from);
  if (year.length < 30 || !now) return null;
  const below = year.filter(([, p]) => p < now).length;
  const prices = year.map(([, p]) => p);
  return { rank: below / year.length, min: Math.min(...prices), max: Math.max(...prices), n: year.length, from };
}

export function forecastText(season, month) {
  if (!season) return null;
  const swing = season.dearRatio - season.cheapRatio;
  if (swing < 0.08) return { flat: true, text: "철에 따라 값이 거의 안 변해요. 필요할 때 사면 돼요." };
  const here = season.index[month - 1];
  const gap = (m) => ((m - month + 12) % 12);
  const wait = gap(season.cheapMonth);
  let when;
  if (wait === 0) when = "지금이 1년 중 제일 싼 달이에요.";
  else if (here != null && here <= season.cheapRatio + 0.03) when = "지금도 제철 가격이에요.";
  else if (wait <= 2) when = `${wait}달만 기다리면 제철이에요.`;
  else when = `제철까지 ${wait}달 남았어요.`;
  return {
    flat: false,
    text: `보통 ${season.cheapMonth}월에 제일 싸고 ${season.dearMonth}월에 제일 비싸요. ${when}`
  };
}

export function seasonBars(season, month) {
  const w = 252;
  const h = 70;
  const bw = w / 12;
  const vals = season.index.map((v) => v ?? 1);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(hi - lo, 0.02);
  const bars = vals.map((v, i) => {
    const bh = 10 + ((v - lo) / span) * (h - 26);
    const x = i * bw + 2;
    const cls = i + 1 === season.cheapMonth ? "cheap" : i + 1 === season.dearMonth ? "dear" : i + 1 === month ? "now" : "";
    return `<rect class="${cls}" x="${x.toFixed(1)}" y="${(h - 14 - bh).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" rx="3"/>` +
      `<text x="${(x + (bw - 4) / 2).toFixed(1)}" y="${h - 2}"${i + 1 === month ? ' class="nowt"' : ""}>${i + 1}</text>`;
  });
  return `<svg class="sbars" viewBox="0 0 ${w} ${h}">${bars.join("")}</svg>`;
}

export function yearLine(points, from, now) {
  const year = points.filter(([d]) => d >= from);
  if (year.length < 2) return "";
  const w = 252;
  const h = 64;
  const t0 = Date.parse(year[0][0]);
  const t1 = Date.parse(year.at(-1)[0]);
  const prices = year.map(([, p]) => p).concat(now ? [now] : []);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = Math.max(hi - lo, 1);
  const X = (d) => 4 + ((Date.parse(d) - t0) / Math.max(t1 - t0, 1)) * (w - 8);
  const Y = (p) => 6 + (1 - (p - lo) / span) * (h - 12);
  const line = year.map(([d, p]) => `${X(d).toFixed(1)},${Y(p).toFixed(1)}`).join(" ");
  const nowY = now ? Y(now).toFixed(1) : null;
  return `<svg class="yline" viewBox="0 0 ${w} ${h}">` +
    (nowY ? `<line x1="0" x2="${w}" y1="${nowY}" y2="${nowY}"/>` : "") +
    `<polyline points="${line}"/></svg>`;
}
