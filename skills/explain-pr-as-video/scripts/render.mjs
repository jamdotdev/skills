#!/usr/bin/env node
// Render an HTML deck to a silent MP4, timed by voiced lines.
//
// usage: node render.mjs <deck.html> <voiced-lines.json> [--stills] [--at <seconds>] [--fps 30] [--jobs 4]
//
// <voiced-lines.json> is the lines.json add-voiceover writes after voicing: each line has "say",
// "seconds", a "scene" id and, optionally, a "cue" name and a "pause" in seconds before it.
// The script spaces the lines out, then writes, next to the deck:
//   timeline.js   the timing the deck's runtime reads, in the render and in the browser
//   timed.json    the same lines with "at" set, for add-voiceover's second pass with --video
//   video.mp4     the silent render, 1920x1080
// --stills writes stills/NN-<scene>.png, one per scene once it has fully built, instead of the video.
// --at writes one frame at that second to stills/at-<seconds>.png.
//
// Needs Node 22+, ffmpeg and Chrome or Chromium (CHROME_PATH overrides the search). No npm packages.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    stills: { type: "boolean" },
    at: { type: "string" },
    fps: { type: "string", default: "30" },
    jobs: { type: "string", default: String(Math.max(1, Math.min(4, availableParallelism() >> 1))) },
  },
});
if (positionals.length !== 2) {
  console.error("usage: node render.mjs <deck.html> <voiced-lines.json> [--stills] [--at <s>] [--fps 30] [--jobs 4]");
  process.exit(2);
}
const deck = resolve(positionals[0]);
const work = dirname(deck);
const fps = Number(opt.fps);
const W = 1920, H = 1080;
const LEAD = 0.8, GAP = 0.45, SCENE_GAP = 1.4, TAIL = 2.2; // seconds of air around the voice

// Space the lines: a breath between lines, a longer one between scenes, plus any "pause" a line asks for.
const lines = JSON.parse(readFileSync(positionals[1], "utf8"));
let t = LEAD;
lines.forEach((line, i) => {
  if (typeof line.seconds !== "number" || !line.scene) {
    console.error(`line ${i + 1} needs "scene" and "seconds"; voice the lines with add-voiceover first`);
    process.exit(2);
  }
  if (i && line.scene !== lines[i - 1].scene) t += SCENE_GAP;
  t += line.pause ?? 0;
  line.at = Math.round(t * 1000) / 1000;
  t += line.seconds + GAP;
});
const duration = Math.ceil((t - GAP + TAIL) * 10) / 10;
const scenes = [];
for (const line of lines) {
  const last = scenes.at(-1);
  if (last?.id === line.scene) continue;
  if (scenes.some((s) => s.id === line.scene)) {
    console.error(`scene "${line.scene}" comes back after another scene; keep each scene's lines together`);
    process.exit(2);
  }
  scenes.push({ id: line.scene, start: last ? Math.max(0, line.at - SCENE_GAP / 2 - 0.15) : 0 });
}
scenes.forEach((s, i) => (s.end = scenes[i + 1]?.start ?? duration));
const timeline = {
  duration,
  scenes,
  lines: lines.map(({ say, scene, cue, at, seconds }) => ({ say, scene, cue, at, seconds })),
};
writeFileSync(join(work, "timeline.js"), `window.TIMELINE = ${JSON.stringify(timeline, null, 1)};\n`);
writeFileSync(join(work, "timed.json"), JSON.stringify(lines, null, 1));
console.error(`timeline: ${scenes.length} scenes, ${lines.length} lines, ${duration} s`);

// Chrome over --remote-debugging-pipe: JSON messages separated by NUL on fds 3 (in) and 4 (out).
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  return candidates.find((p) => p && existsSync(p)) ?? (console.error("Chrome not found; set CHROME_PATH"), process.exit(2));
}

const profile = mkdtempSync(join(tmpdir(), "explain-pr-as-video-"));
const chrome = spawn(findChrome(), [
  "--headless=new", "--remote-debugging-pipe", `--user-data-dir=${profile}`, "--no-first-run",
  "--hide-scrollbars", "--mute-audio", "--allow-file-access-from-files", "--force-color-profile=srgb",
  "--force-device-scale-factor=1", `--window-size=${W},${H}`, "--font-render-hinting=none", "about:blank",
], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
const pending = new Map();
let nextId = 0, buffer = "";
chrome.stdio[4].on("data", (chunk) => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf("\0")) >= 0) {
    const msg = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    const wait = pending.get(msg.id);
    if (!wait) continue;
    pending.delete(msg.id);
    msg.error ? wait.reject(new Error(`${wait.method}: ${msg.error.message}`)) : wait.resolve(msg.result);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++nextId;
    pending.set(id, { resolve: res, reject: rej, method });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
  });
const cleanup = () => {
  chrome.kill("SIGKILL");
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {} // Chrome may still be writing its profile; the OS temp dir clears it later
};
process.on("exit", cleanup);

async function openPage() {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await page("Page.enable");
  const url = pathToFileURL(deck);
  url.searchParams.set("render", "1");
  await page("Page.navigate", { url: url.href });
  const evaluate = async (expression) => {
    const r = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`deck: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  for (let i = 0; !(await evaluate("document.readyState === 'complete' && !!window.deck?.ready")); i++) {
    if (i > 100) throw new Error("the deck never loaded window.deck; check that it includes runtime.js");
    await new Promise((r) => setTimeout(r, 100));
  }
  await evaluate("document.fonts.ready.then(() => window.deck.problems())").then((problems) => {
    for (const p of problems) console.error(`deck: ${p}`);
  });
  const shot = async (seconds, format = "jpeg") => {
    await evaluate(`window.deck.seek(${seconds})`);
    const { data } = await page("Page.captureScreenshot", { format, quality: format === "jpeg" ? 92 : undefined, optimizeForSpeed: true });
    return Buffer.from(data, "base64");
  };
  return { shot, evaluate };
}

function ffmpeg(args) {
  const proc = spawn("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => proc.on("close", (code) => (code ? rej(new Error(`ffmpeg exited ${code}`)) : res())));
  return { stdin: proc.stdin, done };
}

if (opt.stills || opt.at) {
  const stills = join(work, "stills");
  mkdirSync(stills, { recursive: true });
  const { shot } = await openPage();
  const targets = opt.at
    ? [[`at-${opt.at}`, Number(opt.at)]]
    : scenes.map((s, i) => [`${String(i).padStart(2, "0")}-${s.id}`, s.end - 0.4]);
  for (const [name, at] of targets) {
    writeFileSync(join(stills, `${name}.png`), await shot(at, "png"));
    console.log(join(stills, `${name}.png`));
  }
  process.exit(0);
}

// Split the frames into contiguous chunks, one tab and one encoder each, then join the parts.
const frames = Math.ceil(duration * fps);
const jobs = Math.max(1, Math.min(Number(opt.jobs), Math.ceil(frames / (fps * 5))));
const parts = Array.from({ length: jobs }, (_, j) => ({
  from: Math.floor((frames * j) / jobs),
  to: Math.floor((frames * (j + 1)) / jobs),
  file: join(profile, `part-${j}.mp4`),
}));
let done = 0;
const started = Date.now();
await Promise.all(
  parts.map(async (part) => {
    const { shot } = await openPage();
    const enc = ffmpeg(["-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(fps), part.file]);
    for (let f = part.from; f < part.to; f++) {
      if (!enc.stdin.write(await shot(f / fps))) await new Promise((r) => enc.stdin.once("drain", r));
      if (++done % (fps * 10) === 0) console.error(`frames ${done}/${frames} (${Math.round((Date.now() - started) / 1000)} s)`);
    }
    enc.stdin.end();
    await enc.done;
  }),
);
const list = join(profile, "parts.txt");
writeFileSync(list, parts.map((p) => `file '${p.file}'`).join("\n"));
const out = join(work, "video.mp4");
const join_ = ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
join_.stdin.end();
await join_.done;
console.error(`rendered ${frames} frames in ${Math.round((Date.now() - started) / 1000)} s`);
console.log(out);
process.exit(0);
