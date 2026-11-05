#!/usr/bin/env node
// Compare rendered variants of a video, scene by scene, then build one deck from the scenes you picked.
//
// usage: node ab.mjs compare <variant-dir> <variant-dir>... [--out compare.html]
//        node ab.mjs merge <picks.json> <out-dir>
//
// A variant is a work folder after a full render: deck.html, lines.json, timeline.js and voiceover/voiced.mp4.
// compare writes a page that plays any scene of any variant, switches variant mid-scene with the number keys,
// hides which is which in blind mode, and gives back picks.json. merge takes each scene's lines and
// <section> from the variant picked for it, on top of the first variant's deck, and copies the voiced
// lines so the merged script only voices what is new.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values: opt, positionals: [mode, ...rest] } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string", default: "compare.html" } },
});
const fail = (msg) => (console.error(msg), process.exit(2));
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : fail(`missing ${file}`));
const sectionRe = /<section\b[^>]*\bdata-scene="([^"]+)"[\s\S]*?<\/section>/g;
const sections = (html) => new Map([...html.matchAll(sectionRe)].map((m) => [m[1], m[0]]));

function variant(dir) {
  dir = resolve(dir);
  const timeline = JSON.parse(read(join(dir, "timeline.js")).replace(/^window\.TIMELINE = /, "").replace(/;\s*$/, ""));
  const video = ["voiceover/voiced.mp4", "video.mp4"].map((f) => join(dir, f)).find(existsSync);
  if (!video?.endsWith("voiced.mp4")) console.error(`${dir}: no voiceover/voiced.mp4, comparing ${video ? "the silent render" : "nothing"}`);
  const lines = JSON.parse(read(join(dir, "lines.json")));
  return { name: basename(dir), dir, video, timeline, lines };
}

// Scene order: the first variant's, with any scene only another variant has placed after its predecessor there.
function sceneOrder(variants) {
  const order = variants[0].timeline.scenes.map((s) => s.id);
  for (const v of variants.slice(1)) {
    let prev = -1;
    for (const { id } of v.timeline.scenes) {
      if (!order.includes(id)) order.splice(prev + 1, 0, id);
      prev = order.indexOf(id);
    }
  }
  return order;
}

if (mode === "compare") {
  if (rest.length < 2) fail("usage: node ab.mjs compare <variant-dir> <variant-dir>... [--out compare.html]");
  const out = resolve(opt.out);
  const variants = rest.map(variant);
  const data = {
    variants: variants.map((v) => ({
      name: v.name,
      dir: v.dir,
      src: relative(dirname(out), v.video ?? ""),
      duration: v.timeline.duration,
      scenes: Object.fromEntries(v.timeline.scenes.map((s) => [s.id, { start: s.start, end: s.end, say: v.lines.filter((l) => l.scene === s.id).map((l) => l.say).join(" ") }])),
    })),
    order: sceneOrder(variants),
  };
  writeFileSync(out, page(data));
  console.log(out);
} else if (mode === "merge") {
  if (rest.length !== 2) fail("usage: node ab.mjs merge <picks.json> <out-dir>");
  const picks = JSON.parse(read(rest[0]));
  const out = resolve(rest[1]);
  const variants = picks.variants.map(variant);
  const byName = new Map(variants.map((v) => [v.name, v]));
  const base = variants[0];
  const baseDeck = read(join(base.dir, "deck.html"));
  const decks = new Map(variants.map((v) => [v.name, v === base ? baseDeck : read(join(v.dir, "deck.html"))]));

  const lines = [], parts = [];
  for (const id of sceneOrder(variants)) {
    const pick = picks.scenes[id] === undefined ? (picks.whole ?? base.name) : picks.scenes[id];
    if (pick === null) continue; // the scene was cut
    const v = byName.get(pick) ?? fail(`scene ${id}: no variant "${pick}"`);
    const section = sections(decks.get(pick)).get(id) ?? fail(`scene ${id}: ${pick}/deck.html has no section for it`);
    lines.push(...v.lines.filter((l) => l.scene === id).map(({ wav, seconds, at, ...l }) => l));
    parts.push(section);
  }

  // The first variant's deck with its scenes swapped for the picked ones. Deck-only styles of other picked
  // variants are appended; they share one page, so scope a variant's new CSS by its scene: [data-scene=why] .x
  const used = new Set([picks.whole, ...Object.values(picks.scenes)].filter(Boolean));
  const styles = [...used].filter((n) => n !== base.name).flatMap((n) => decks.get(n).match(/<style>[\s\S]*?<\/style>/g) ?? [])
    .filter((s) => !baseDeck.includes(s));
  const first = baseDeck.search(sectionRe);
  let deck = baseDeck.replace(sectionRe, "");
  deck = deck.slice(0, first) + parts.join("\n\n  ") + deck.slice(first);
  deck = deck.replace("</head>", `${styles.join("\n")}\n</head>`);

  const generated = new Set(["deck.html", "lines.json", "timed.json", "timeline.js", "video.mp4", "stills", "sync", "voiceover", "compare.html"]);
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(base.dir)) if (!generated.has(f)) cpSync(join(base.dir, f), join(out, f), { recursive: true });
  writeFileSync(join(out, "deck.html"), deck);
  writeFileSync(join(out, "lines.json"), JSON.stringify(lines, null, 1));
  mkdirSync(join(out, "voiceover"), { recursive: true });
  for (const v of variants) {
    const vo = join(v.dir, "voiceover");
    if (existsSync(vo)) for (const f of readdirSync(vo)) if (f.endsWith(".wav") && f !== "narration.wav") cpSync(join(vo, f), join(out, "voiceover", f));
  }
  console.error(`merged ${parts.length} scenes, ${lines.length} lines into ${out}; voice, then render as usual`);
  console.log(out);
} else {
  fail("usage: node ab.mjs compare <variant-dir>... | node ab.mjs merge <picks.json> <out-dir>");
}

function page(data) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Compare variants</title>
<style>
  :root { --ink:#1c2024; --mute:#6b7177; --line:#e3e5e1; --bg:#f9faf7; --card:#fff; --accent:#ff4063; --pick:#9ff065; }
  @media (prefers-color-scheme: dark) { :root { --ink:#eceeec; --mute:#9aa09f; --line:#2c3033; --bg:#141617; --card:#1c1f21; --pick:#4f7a24; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 Inter, system-ui, sans-serif; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 520px; gap: 24px; padding: 20px; height: 100vh; }
  .stage { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  video { width: 100%; background: #000; border-radius: 8px; }
  .now { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .now b { font-size: 18px; }
  .hint { color: var(--mute); font-size: 13px; }
  .list { overflow: auto; display: flex; flex-direction: column; gap: 8px; }
  .scene { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
  .scene.on { border-color: var(--accent); }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .opts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  button { font: inherit; border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  button.playing { border-color: var(--accent); color: var(--accent); }
  button.picked { background: var(--pick); border-color: var(--pick); color: #1c2024; }
  .say { color: var(--mute); font-size: 13px; margin-top: 6px; display: grid; gap: 4px; }
  .say span b { color: var(--ink); }
  textarea { width: 100%; height: 120px; font: 12px ui-monospace, monospace; background: var(--card); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; }
  label { display: inline-flex; gap: 6px; align-items: center; }
  @media (max-width: 1100px) { main { grid-template-columns: 1fr; height: auto; } }
</style>
</head>
<body>
<main>
  <div class="stage">
    <video id="v" controls preload="auto"></video>
    <div class="now"><b id="now">Pick a scene</b><span class="hint">space play/pause · 1–9 switch variant at the same point · ↑↓ scene</span></div>
    <div class="now">
      <span>Whole video:</span><span id="whole" class="opts" style="margin:0"></span>
      <label><input type="checkbox" id="blind"> blind</label>
    </div>
    <textarea id="picks" readonly></textarea>
    <div class="now"><button id="copy">Copy picks.json</button><span class="hint">then: node ab.mjs merge picks.json merged</span></div>
  </div>
  <div class="list" id="list"></div>
</main>
<script>
const DATA = ${JSON.stringify(data).replace(/</g, "\\u003c")};
const key = "ab-picks:" + DATA.variants.map((v) => v.dir).join("|");
let store = { picks: {}, whole: null, blind: false };
try { Object.assign(store, JSON.parse(localStorage.getItem(key) || "{}")); } catch {}
const save = () => { try { localStorage.setItem(key, JSON.stringify(store)); } catch {} render(); };
const video = document.getElementById("v");
let cur = { v: 0, scene: null }; // scene null = the whole video

// Blind mode labels the variants X, Y, Z in a fixed shuffled order per scene, so position gives nothing away.
const letters = "XYZWVU";
const shuffled = (id) => {
  const idx = DATA.variants.map((_, i) => i);
  let h = [...(id || "whole")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  for (let i = idx.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
};
const label = (i, id) => store.blind ? letters[shuffled(id).indexOf(i)] : DATA.variants[i].name;
const seconds = (s) => (s.end - s.start).toFixed(1) + " s";

function play(v, scene, offset = 0) {
  const src = DATA.variants[v].src;
  const at = scene ? DATA.variants[v].scenes[scene].start : 0;
  cur = { v, scene };
  const go = () => { video.currentTime = at + offset; video.play().catch(() => {}); };
  if (!video.src.endsWith(encodeURI(src))) { video.src = src; video.addEventListener("loadedmetadata", go, { once: true }); } else go();
  render();
}
video.addEventListener("timeupdate", () => {
  const s = cur.scene && DATA.variants[cur.v].scenes[cur.scene];
  if (s && video.currentTime >= s.end) video.pause();
});
function switchTo(v) {
  if (!DATA.variants[v]) return;
  const from = DATA.variants[cur.v];
  let scene = cur.scene;
  if (!scene) scene = Object.keys(from.scenes).find((id) => video.currentTime < from.scenes[id].end);
  const off = scene ? video.currentTime - from.scenes[scene].start : video.currentTime;
  const target = DATA.variants[v].scenes[scene];
  if (!target) return play(v, null, video.currentTime);
  const into = Math.min(off, target.end - target.start);
  cur.scene ? play(v, cur.scene, into) : play(v, null, target.start + into);
}

function render() {
  const now = cur.scene ? cur.scene : "whole video";
  document.getElementById("now").textContent = (video.src ? label(cur.v, cur.scene) + " · " : "") + now;
  document.getElementById("whole").innerHTML = "";
  for (const i of store.blind ? shuffled(null) : DATA.variants.map((_, i) => i)) {
    const v = DATA.variants[i];
    const b = button("▶ " + label(i, null) + " " + v.duration.toFixed(0) + " s", () => play(i, null), !cur.scene && cur.v === i && video.src);
    const p = button("pick", () => { store.whole = store.whole === v.name ? null : v.name; save(); }, false, store.whole === v.name);
    document.getElementById("whole").append(b, p);
  }
  const list = document.getElementById("list");
  list.innerHTML = "";
  for (const id of DATA.order) {
    const el = document.createElement("div");
    el.className = "scene" + (cur.scene === id ? " on" : "");
    const order = store.blind ? shuffled(id) : DATA.variants.map((_, i) => i);
    el.innerHTML = '<div class="head"><b></b><span class="hint"></span></div><div class="opts"></div><div class="say"></div>';
    el.querySelector("b").textContent = id;
    el.querySelector(".hint").textContent = store.picks[id] === null ? "cut" : store.picks[id] ? "picked " + (store.blind ? "✓" : store.picks[id]) : "";
    for (const i of order) {
      const v = DATA.variants[i], s = v.scenes[id];
      if (!s) continue;
      el.querySelector(".opts").append(
        button("▶ " + label(i, id) + " " + seconds(s), () => play(i, id), cur.scene === id && cur.v === i),
        button("pick " + label(i, id), () => { store.picks[id] = store.picks[id] === v.name ? undefined : v.name; save(); }, false, store.picks[id] === v.name),
      );
      const say = document.createElement("span");
      say.innerHTML = "<b></b> ";
      say.querySelector("b").textContent = label(i, id) + ":";
      const same = order.slice(0, order.indexOf(i)).find((j) => DATA.variants[j].scenes[id]?.say === s.say);
      say.append(same === undefined ? s.say : "same words as " + label(same, id));
      el.querySelector(".say").append(say);
    }
    el.querySelector(".opts").append(button("cut", () => { store.picks[id] = store.picks[id] === null ? undefined : null; save(); }, false, store.picks[id] === null));
    list.append(el);
  }
  document.getElementById("blind").checked = store.blind;
  document.getElementById("picks").value = JSON.stringify({ variants: DATA.variants.map((v) => v.dir), whole: store.whole, scenes: store.picks }, null, 1);
}
function button(text, onclick, playing, picked) {
  const b = document.createElement("button");
  b.textContent = text;
  b.onclick = onclick;
  if (playing) b.className = "playing";
  if (picked) b.className = "picked";
  return b;
}
document.getElementById("blind").onchange = (e) => { store.blind = e.target.checked; save(); };
document.getElementById("copy").onclick = () => navigator.clipboard.writeText(document.getElementById("picks").value);
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA") return;
  if (e.key === " ") { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  else if (/^[1-9]$/.test(e.key)) {
    const order = store.blind ? shuffled(cur.scene) : DATA.variants.map((_, i) => i);
    switchTo(order[Number(e.key) - 1]);
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const i = DATA.order.indexOf(cur.scene) + (e.key === "ArrowDown" ? 1 : -1);
    const id = DATA.order[Math.max(0, Math.min(DATA.order.length - 1, i))];
    const v = DATA.variants[cur.v].scenes[id] ? cur.v : DATA.variants.findIndex((x) => x.scenes[id]);
    play(v, id);
  }
});
render();
</script>
</body>
</html>
`;
}
