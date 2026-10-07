import { existsSync, readFileSync } from "node:fs";

const BASE = "https://www.kamis.or.kr/service/price/xml.do";

export function credentials() {
  if (process.env.KAMIS_CERT_KEY) {
    return { key: process.env.KAMIS_CERT_KEY, id: process.env.KAMIS_CERT_ID || "" };
  }
  if (existsSync("kamis.local.json")) {
    const c = JSON.parse(readFileSync("kamis.local.json", "utf8"));
    return { key: c.cert_key, id: c.cert_id };
  }
  return { key: "TEST", id: "TEST" };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function call(action, params, { retries = 3, gapMs = 1200 } = {}) {
  const { key, id } = credentials();
  const qs = new URLSearchParams({ action, ...params, p_cert_key: key, p_cert_id: id, p_returntype: "json" });
  const url = `${BASE}?${qs}`;
  let last;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
      const text = await res.text();
      await sleep(gapMs);
      const json = JSON.parse(text);
      return { ok: true, json };
    } catch (e) {
      last = e;
      await sleep(gapMs * (attempt + 2));
    }
  }
  return { ok: false, error: String(last) };
}

export function rows(json) {
  if (!json) return [];
  const d = json.data;
  if (Array.isArray(d)) return d.filter((x) => typeof x === "object");
  if (d && Array.isArray(d.item)) return d.item;
  if (d && typeof d.item === "object") return [d.item];
  return [];
}

export function errorCode(json) {
  const d = json && json.data;
  if (Array.isArray(d) && typeof d[0] === "string") return d[0];
  if (d && d.error_code && d.error_code !== "000") return d.error_code;
  return null;
}

export function num(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
