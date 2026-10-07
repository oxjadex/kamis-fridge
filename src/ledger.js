export function makeBuy({ id, date, food, name, q, paid, regionName }) {
  return {
    id,
    d: date,
    food: food.id,
    name,
    unit: q.unit || "",
    now: q.now,
    normal: q.series ? q.series[5] ?? q.series[4] ?? null : null,
    level: q.level,
    region: q.region,
    regionName,
    paid: paid > 0 ? Math.round(paid) : null
  };
}

export function ledgerSummary(buys) {
  const by = { good: 0, ok: 0, bad: 0, none: 0 };
  let saved = 0;
  let paid = 0;
  let paidCount = 0;
  for (const b of buys) {
    by[b.level] = (by[b.level] || 0) + 1;
    if (b.normal && b.now) saved += b.normal - b.now;
    if (b.paid) {
      paid += b.paid;
      paidCount++;
    }
  }
  return { count: buys.length, by, saved, paid, paidCount };
}
