// Give a recorded demo the finish of a screen-recording editor: a camera that frames what each beat's shot names,
// moving only when the shot changes and starting with the beat's first line; a cursor drawn crisp at any zoom along a
// hand's path, blurred while it moves, with a ring on each click; and the page as a rounded card with a shadow on a
// wallpaper, at 2560x1440 and 60 fps.
//
// usage: node polish.mjs <out-dir> [--background <image> | --background none] [--frame safari|chrome]
// Reads video.mp4 and timeline.json, writes polished.mp4 and poster.png. The wallpaper defaults to ../assets/wallpaper.png; none fills
// the frame with the page edge to edge, with no card. --frame puts the page in a Safari or Chrome window whose address
// bar (and Chrome's tab title) follows the page.
// Each frame is laid out in polish.html and filmed in a headless Chrome through agent-browser, so nothing needs installing.
// Timing is untouched, so narration.json still lines up with polished.mp4.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const die = (msg) => { console.error(msg); process.exit(1); };

function which(name) {
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH || "").split(delimiter))
    for (const ext of exts) if (dir && existsSync(join(dir, name + ext))) return join(dir, name + ext);
}
const tool = (name) => which(name) || die(`${name} not found on PATH`);

const W = 2560, H = 1440, FPS = 60; // a 4K take framed up to MAX_ZOOM still fills this card about pixel for pixel
const MARGIN = 0.15;    // room around a framed region, each side
const MAX_ZOOM = 2.0;
const MIN_ZOOM = 1.25;  // a frame that needs less than this isn't worth a camera move: it stays wide
const CURSOR = 28;      // pointer height in CSS pixels, a little larger than life so it reads in a video
const SHUTTER = 0.5;    // the pointer blurs over this share of a frame while it moves, like a camera's 180° shutter
const RING = 0.45;      // seconds a click's ring takes to spread and fade

const moveTime = (a, c) => 0.6 + 0.55 * Math.log(Math.max(a[2], c[2])); // a deeper zoom travels further: 0.7 s at 1.25x, about 1 s at 2x

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : dflt; };
const wallpaper = flag("--background", join(import.meta.dirname, "..", "assets", "wallpaper.png"));
const kind = flag("--frame", ""); // a browser window around the page
if (!["", "safari", "chrome"].includes(kind)) die("--frame takes safari or chrome");
const out = args[0] || die("usage: node polish.mjs <out-dir> [--background <image> | --background none] [--frame safari|chrome]");
const tl = JSON.parse(readFileSync(join(out, "timeline.json"), "utf8"));
const src = join(out, "video.mp4");
const FFMPEG = tool("ffmpeg");
const probe = execFileSync(tool("ffprobe"), ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height",
                                             "-show_entries", "format=duration", "-of", "json", src], { encoding: "utf8" });
const { streams: [{ width: sw, height: sh }], format: { duration } } = JSON.parse(probe);
const [vw, vh] = tl.viewport;

const ease = (u) => { u = Math.min(1, Math.max(0, u)); return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2; };

// 1. The pointer: each logged move along a gentle curve, with a minimum-jerk speed profile, like a hand.
function pointer(t) {
  let at = tl.pointer;
  for (const m of tl.moves) {
    if (t < m.t0) break;
    if (t >= m.t1) { at = m.to; continue; }
    const [[x0, y0], [x1, y1]] = [m.from, m.to];
    const u = (t - m.t0) / Math.max(1e-3, m.t1 - m.t0);
    const s = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
    const bx = (x0 + x1) / 2 - (y1 - y0) * m.bend, by = (y0 + y1) / 2 + (x1 - x0) * m.bend; // control point off the line
    return [(1 - s) ** 2 * x0 + 2 * (1 - s) * s * bx + s * s * x1, (1 - s) ** 2 * y0 + 2 * (1 - s) * s * by + s * s * y1];
  }
  return at;
}

// The cursor's kind: what the page asks for over the box the hand last went for, while the pointer is inside it.
function kindAt(t) {
  const m = tl.moves.findLast((m) => m.t0 <= t);
  if (!m?.box) return "arrow";
  const [x, y] = pointer(t), [x0, y0, x1, y1] = m.box;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 ? m.kind : "arrow";
}
const KINDS = ["arrow", "hand", "ibeam"];
const MORPH = 0.1; // seconds one kind takes to cross-fade into the next, so it morphs instead of popping

function squash(t) { // the cursor dips on a press and springs back
  const d = tl.presses.map((p) => t - p.at).find((d) => d >= -0.05 && d <= 0.25);
  return d === undefined ? 1 : 1 - 0.18 * Math.sin((Math.PI * (d + 0.05)) / 0.3);
}

// 2. The scene at zoom 1: the backdrop with the card, and the window chrome above the page.
const u = W / 1920;
const bare = wallpaper === "none";
if (bare && kind) die("--frame needs a background to sit on");
const [PAD, RADIUS] = bare ? [0, 0] : [Math.round(48 * u), Math.round(20 * u)]; // a thin margin of wallpaper: the page is the subject
const barCss = { safari: 38, chrome: 76 }[kind] ?? 0; // window chrome height, in the page's CSS pixels
const BAR = Math.round((barCss * (H - 2 * PAD)) / (vh + barCss));
const ch = H - 2 * PAD - BAR;
const cw = Math.round((ch * sw) / sh); // keep the page's shape
const left = Math.floor((W - cw) / 2);
const latest = (key, t) => [...(tl[key + "s"] ?? [])].reverse().find((x) => x.at <= t)?.[key] ?? "";

// 3. The camera moves over the whole scene (wallpaper, window and page, as laid out at zoom 1): one view, its centre and
// zoom in scene pixels, per beat, from the beat's shot.
const top = PAD + BAR; // the page's top edge in the scene
const css = cw / vw;   // scene pixels per CSS pixel
const WIDE = [W / 2, H / 2, 1];

function view(beat, n) {
  const f = beat.frame;
  if (!f) return WIDE;
  const [x0, y0, x1, y1] = [left + f[0] * css, top + f[1] * css, left + f[2] * css, top + f[3] * css];
  const z = Math.min(MAX_ZOOM, W / ((x1 - x0) * (1 + 2 * MARGIN)), H / ((y1 - y0) * (1 + 2 * MARGIN)));
  if (z < MIN_ZOOM) {
    console.error(`beat ${n}: ${beat.shot} nearly fills the frame (zoom ${z.toFixed(2)}); staying wide`);
    return WIDE;
  }
  return [Math.min(Math.max((x0 + x1) / 2, W / z / 2), W - W / z / 2), Math.min(Math.max((y0 + y1) / 2, H / z / 2), H - H / z / 2), z];
}

const cuts = []; // the camera moves only where the shot changes, starting with the beat's first line
let here = WIDE;
tl.beats.forEach((b, i) => {
  const there = view(b, i + 1);
  if (Math.hypot(here[0] - there[0], here[1] - there[1]) > 1 || Math.abs(Math.log(here[2] / there[2])) > 0.01) { // pixels and zoom apart
    cuts.push([b.said - 0.15, here, there, moveTime(here, there)]);
    here = there;
  }
});
console.error(`camera moves: ${cuts.length}`);

function camera(t) {
  let cam = WIDE;
  for (const [start, a, c, d] of cuts) {
    if (t < start) break;
    const k = ease((t - start) / d);
    const z = Math.exp(Math.log(a[2]) + (Math.log(c[2]) - Math.log(a[2])) * k); // zoom feels even in log space
    cam = [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, z];
  }
  return cam;
}

for (const p of tl.presses) { // a click the camera can't see is a screenplay bug
  const [cx, cy, z] = camera(p.at);
  if (Math.abs(left + p.x * css - cx) > W / z / 2 || Math.abs(top + p.y * css - cy) > H / z / 2)
    console.error(`warning: the click at ${p.at.toFixed(1)} s (${p.x}, ${p.y}) is out of frame; widen that beat's shot`);
}

function onScreen(t, x, y) { // a page point, in CSS pixels, where it lands on screen at time t
  const [cx, cy, z] = camera(t);
  return [(left + x * css - cx + W / z / 2) * z, (top + y * css - cy + H / z / 2) * z];
}

function frameState(t, frame) {
  const [cx, cy, z] = camera(t);
  const vx = cx - W / z / 2, vy = cy - H / z / 2; // the view's top-left, in scene pixels
  const at = (x, y) => [(x - vx) * z, (y - vy) * z];
  const [x0, wy] = at(left, PAD), [x1, y1] = at(left + cw, top + ch);
  const rings = tl.presses.filter((p) => t - p.at >= 0 && t - p.at <= RING).map((p) => {
    const k = (t - p.at) / RING, scale = css * z;
    return [...onScreen(t, p.x, p.y), (8 + 22 * (1 - (1 - k) ** 3)) * scale, 2.5 * scale, 1 - k];
  });
  let spots = [0, 1, 2, 3, 4].map((i) => t + (SHUTTER / FPS) * (i / 4 - 0.5)).map((ts) => onScreen(ts, ...pointer(ts)));
  if (Math.hypot(spots[0][0] - spots[4][0], spots[0][1] - spots[4][1]) < 1.5) spots = [spots[2]];
  const near = [0, 1, 2, 3, 4].map((i) => kindAt(t + MORPH * (i / 4 - 0.5)));
  const kinds = KINDS.map((k) => near.filter((n) => n === k).length / near.length);
  return { frame, view: [vx, vy, z], clip: [x0, wy, x1, y1, RADIUS * z], rings, spots, kinds,
           unit: (CURSOR * css * z * squash(t)) / 21, url: latest("url", t), title: latest("title", t) };
}

// The take's frames as images polish.html can show.
const frames = resolve(out, "polish-frames");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames);
// Only frames that change are kept (a still page repeats one), each with the second it starts.
const log = spawnSync(FFMPEG, ["-i", src, "-vf", "mpdecimate=hi=0:lo=0:frac=0,showinfo", "-fps_mode", "vfr", "-q:v", "2", join(frames, "%06d.jpg")],
                      { encoding: "utf8", maxBuffer: 1 << 28 });
if (log.status !== 0) die(`ffmpeg failed to read the take: ${log.stderr.slice(-500)}`);
const starts = [...log.stderr.matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
const frameAt = (t) => {
  let n = 0;
  while (n + 1 < starts.length && starts[n + 1] <= t + 1e-6) n++;
  return pathToFileURL(join(frames, `${String(n + 1).padStart(6, "0")}.jpg`)).href;
};

const AGENT = tool("agent-browser");
const shim = /\.(cmd|bat)$/i.test(AGENT), q = (x) => `"${x.replaceAll('"', '""')}"`; // a Windows .cmd shim only runs through the shell, quoted
const ab = (...a) => (shim ? execFileSync(q(AGENT), ["--session", "polish", ...a].map(q), { encoding: "utf8", shell: true })
                           : execFileSync(AGENT, ["--session", "polish", ...a], { encoding: "utf8" }));
// The video and poster are written as part files and renamed only once both are complete, so a run that stops early
// never touches the last good polished.mp4 or its poster.png. However polish ends, Ctrl-C or a timeout included, its
// Chrome closes and its frames and part files go.
const polished = join(out, "polished.mp4"), part = join(out, "polished.part.mp4"), poster = join(out, "poster.part.png");
process.on("exit", () => {
  try { ab("close"); } catch {} // a session already gone is fine
  enc?.kill();
  for (const p of [part, poster, frames]) try { rmSync(p, { recursive: true, force: true }); } catch {}
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));
let enc, closed; // the encoder, and its exit, watched from the start so an early one is never missed
ab("open", "about:blank");
ab("set", "viewport", String(W), String(H));
ab("open", pathToFileURL(join(import.meta.dirname, "polish.html")).href);
const ws = new WebSocket(ab("get", "cdp-url").trim());
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
let id = 0;
const replies = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); replies.get(m.id)?.(m); };
const call = (method, params = {}, sessionId) => new Promise((ok, fail) => {
  replies.set(++id, (m) => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
  ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
});
const page = (await call("Target.getTargets")).targetInfos.find((t) => t.type === "page" && t.url.endsWith("polish.html"));
const session = (await call("Target.attachToTarget", { targetId: page.targetId, flatten: true })).sessionId;
async function run(expression) {
  const r = await call("Runtime.evaluate", { expression, awaitPromise: true }, session);
  if (r.exceptionDetails) {
    const why = `polish.html: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`;
    enc?.kill(); // let go of the part file first: Windows won't delete an open file
    await closed;
    die(why);
  }
}
await run(`setup(${JSON.stringify({ W, H, PAD, RADIUS, BAR, barCss, cw, ch, left, u, kind, vw, bare,
                                    wallpaper: bare ? "" : pathToFileURL(resolve(wallpaper)).href })})`);

enc = spawn(FFMPEG, ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "faststart", part],
                  { stdio: ["pipe", "inherit", "inherit"] });
closed = new Promise((r) => enc.on("close", r));
enc.stdin.on("error", () => {}); // ffmpeg gone: its exit code below says so
const total = Math.floor(duration * FPS);
console.error(`filming ${total} frames`);
for (let n = 0; n < total; n++) {
  if (enc.exitCode !== null || enc.signalCode !== null) break; // ffmpeg stopped: the exit-code check below reports it
  const t = n / FPS;
  await run(`draw(${JSON.stringify(frameState(t, frameAt(t)))})`);
  const { data } = await call("Page.captureScreenshot", { format: "jpeg", quality: 95, optimizeForSpeed: true }, session);
  if (!enc.stdin.write(Buffer.from(data, "base64"))) await Promise.race([new Promise((r) => enc.stdin.once("drain", r)), closed]);
}
// The poster: the frame most people see first, as a thumbnail or a still in a PR. The end of the beat marked
// "poster" (the last by default), where its result has settled and the pointer has stepped aside.
const pb = tl.beats.findIndex((b) => b.poster) >= 0 ? tl.beats.findIndex((b) => b.poster) : tl.beats.length - 1;
const tp = (tl.beats[pb + 1]?.at ?? duration) - 0.4;
await run(`draw(${JSON.stringify(frameState(tp, frameAt(tp)))})`);
writeFileSync(poster, Buffer.from((await call("Page.captureScreenshot", { format: "png" }, session)).data, "base64"));
enc.stdin.end();
await closed;
ws.close();
rmSync(frames, { recursive: true });
if (enc.exitCode !== 0) die("ffmpeg failed to encode the polished video");
renameSync(part, polished);
renameSync(poster, join(out, "poster.png")); // the poster changes with the video it belongs to, never without it
console.log(polished);
