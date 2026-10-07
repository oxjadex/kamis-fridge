import { build } from "esbuild";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2];
const fontDir = process.env.LOCALAPPDATA + "\\Microsoft\\Windows\\Fonts\\";
const sync = existsSync("sync.json") ? JSON.parse(readFileSync("sync.json", "utf8")) : {};
const seed = process.argv.includes("--seed") && existsSync("seed.json") ? readFileSync("seed.json", "utf8") : "[]";
const result = await build({ entryPoints: ["src/main.js"], bundle: true, format: "iife", minify: true, write: false, target: "es2020" });
const js = result.outputFiles[0].text
  .replace(/<\/script/gi, "<\\/script")
  .replace("__SB_URL__", () => sync.url || "__SB_URL__")
  .replace("__SB_KEY__", () => sync.key || "__SB_KEY__")
  .replace('"__SEED__"', () => JSON.stringify(JSON.parse(seed)));
const f400 = readFileSync(fontDir + "Pretendard-Bold.otf").toString("base64");
const f600 = readFileSync(fontDir + "Pretendard-ExtraBold.otf").toString("base64");
const html = readFileSync("template.html", "utf8")
  .replace("__FONT_700__", () => f400)
  .replace("__FONT_800__", () => f600)
  .replace("__BUNDLE__", () => js);
writeFileSync(out, html);
console.log("wrote", out, (html.length / 1024 / 1024).toFixed(2) + " MB", "js", (js.length / 1024).toFixed(0) + " KB", sync.url ? "sync on" : "sync off", "seed", JSON.parse(seed).length);
