// Play beats.json in agent-browser while recording a silent video, paced for the narration laid under it later.
//
// usage: node record.mjs <beats.json> <url> <out-dir> [--voice <lines.json>]
//
// A ["say", "..."] action starts its line once the last one has finished, and the actions after it run while it plays,
// so a click lands on the words about it. --voice takes each line's real length from a voiced lines.json (a list of
// {"say", "seconds"}); without it, a line lasts as long as it takes to read aloud at an even pace.
// A beat's "shot" is "wide" or a selector the camera frames; a beat without one keeps the last. The take has no pointer:
// polish.mjs draws it, along the moves logged here, and runs the camera the shots ask for.
// The take comes straight from Chrome's screencast at 3x (3840x2160), so the camera can frame a region and keep text sharp.
// Writes video.mp4, narration.json (each line with the second it starts) and timeline.json (beats with their framed
// region, pointer moves and presses, for polish.mjs).
import { exec, execFile, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

const die = (msg) => { console.error(msg); process.exit(1); };

function which(name) {
  // Full path, so Windows finds npm's .cmd shims too.
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH || "").split(delimiter))
    for (const ext of exts) if (dir && existsSync(join(dir, name + ext))) return join(dir, name + ext);
}
const tool = (name) => which(name) || die(`${name} not found on PATH`);

const SCALE = 3; // device pixels per CSS pixel; a real device scale, since an emulated one screencasts at 1x
const AGENT = tool("agent-browser");
const AB = ["--session", "demo", "--args", `--force-device-scale-factor=${SCALE}`];
const FFMPEG = tool("ffmpeg");
const args = process.argv.slice(2);
const vi = args.indexOf("--voice");
const voiced = Object.fromEntries((vi >= 0 ? JSON.parse(readFileSync(args.splice(vi, 2)[1], "utf8")) : []).map((l) => [l.say, l.seconds]));
const [beatsFile, url, out] = args;
if (!out) die("usage: node record.mjs <beats.json> <url> <out-dir> [--voice <lines.json>]");
const beats = JSON.parse(readFileSync(beatsFile, "utf8"));
mkdirSync(out, { recursive: true });

// Every command is async: Chrome sends the next frame only once the last is acknowledged, so a blocking call drops frames.
const execFileP = promisify(execFile);
const shim = /\.(cmd|bat)$/i.test(AGENT); // a Windows .cmd shim only runs through the shell
async function ab(...a) {
  try {
    const argv = [...AB, ...a];
    const { stdout } = shim
      ? await execFileP(`"${AGENT}"`, argv.map((x) => `"${x.replaceAll('"', '""')}"`), { shell: true, maxBuffer: 1 << 26 })
      : await execFileP(AGENT, argv, { maxBuffer: 1 << 26 });
    return stdout;
  } catch (e) {
    spawnSync(AGENT, [...AB, "close"], { shell: shim });
    die(`agent-browser ${a.join(" ")} failed: ${e.stdout ?? ""}${e.stderr ?? e.message}`);
  }
}

// Run JS on one element: CSS, or XPath after "xpath=".
async function on(sel, body) {
  const find = "s.startsWith('xpath=') ? document.evaluate(s.slice(6), document, null, 9, null).singleNodeValue : document.querySelector(s)";
  return JSON.parse(await ab("eval", `(s => { const el = ${find}; ${body} })(${JSON.stringify(sel)})`));
}

const sleep = (s) => new Promise((r) => setTimeout(r, Math.max(0, s) * 1000));
const mono = () => performance.now() / 1000;
const uniform = (a, b) => a + Math.random() * (b - a);
const gauss = (mu, sigma) => mu + sigma * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

let t0, wall0;
const pointer = [640, 520], moves = [], presses = [];
const busy = []; // [from, to] spans where something moves or speaks, to find dead air

// The element the hand is over, as a box and the cursor the page asks for there: polish.mjs switches to it as the
// pointer crosses the box's edge. A move that leaves the box keeps it, so the switch back happens on the way out.
let target = {};

async function move(x, y, ms) {
  // polish.mjs draws this move with its own bend; the real pointer only has to get there on the same schedule.
  const t = mono() - t0;
  // --duration only holds with --human; the wait makes sure the hand takes the time it was given either way.
  await ab("mouse", "move", String(Math.round(x)), String(Math.round(y)), "--human", "--duration", String(Math.round(ms)), "--steps", String(Math.max(2, Math.round(ms / 16))));
  await sleep(t + ms / 1000 - (mono() - t0));
  moves.push({ t0: t, t1: mono() - t0, from: pointer.map(r1), to: [r1(x), r1(y)],
               bend: r3(uniform(0.06, 0.14) * (Math.random() < 0.5 ? -1 : 1)), ...target });
  busy.push([t, mono() - t0]);
  pointer.splice(0, 2, x, y);
}

async function glide(sel) {
  // A hand lands inside the target in one movement (farther takes longer) and rests a beat before pressing. It
  // presses off the label, so the viewer can still read what was clicked: in the padding right of the text when
  // there is room, else right of centre and a little low.
  const ux = clamp(gauss(0.5, 0.15), 0.2, 0.8), fx = clamp(gauss(0.75, 0.06), 0.62, 0.88), fy = clamp(gauss(0.6, 0.06), 0.45, 0.72);
  const [x, y, bx, by, bw, bh, kind] = await on(sel, `el.scrollIntoView({block: 'nearest'}); const r = el.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(el); const tr = range.getBoundingClientRect();
    const room = r.right - tr.right, x = tr.width && room >= 12 ? tr.right + room * ${ux} : r.x + r.width * ${fx}, y = r.y + r.height * ${fy};
    const at = document.elementFromPoint(x, y) || el, c = getComputedStyle(at).cursor;
    const field = at.isContentEditable || at.tagName === 'TEXTAREA' || (at.tagName === 'INPUT' && /^(text|search|email|url|tel|password|number|)$/.test(at.type));
    return [x, y, r.x, r.y, r.width, r.height, c === 'pointer' ? 'hand' : c === 'text' || (c === 'auto' && field) ? 'ibeam' : 'arrow'];`);
  target = { box: [bx, by, bx + bw, by + bh].map(r1), kind }; // ponytail: the box as it was before the press; a page that reflows after it switches late
  const reach = Math.hypot(x - pointer[0], y - pointer[1]);
  await move(x, y, Math.min(1300, 450 + 0.9 * reach) * uniform(0.85, 1.2));
  await sleep(uniform(0.18, 0.35));
  presses.push({ at: mono() - t0, x: Math.round(x), y: Math.round(y) });
  await ab("mouse", "down");
  await sleep(uniform(0.06, 0.12));
  await ab("mouse", "up");
}

async function stepAside() {
  // Once the hand is done for now, it drifts off the content so the cursor doesn't cover what changed.
  // Sideways, toward the roomier edge: content tends to grow downward, under where the hand just was.
  const x = clamp(pointer[0] + (pointer[0] < 640 ? 1 : -1) * uniform(260, 420), 40, 1240);
  const y = clamp(pointer[1] + uniform(30, 90), 40, 680);
  await move(x, y, uniform(700, 1100));
}

async function film(shots, frames, urls, titles) {
  // Chrome sends a frame whenever the page repaints; each is saved with the moment it was painted. The address is
  // kept too, as it changes, for a browser frame around the video.
  const ws = new WebSocket((await ab("get", "cdp-url")).trim());
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0, page, session, main;
  const replies = new Map();
  const call = (method, params = {}, sessionId) => new Promise((ok) => {
    replies.set(++id, ok);
    ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
  });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data), p = m.params ?? {};
    if (m.id) return replies.get(m.id)?.(m.result);
    if (m.method === "Page.screencastFrame") {
      ws.send(JSON.stringify({ id: ++id, method: "Page.screencastFrameAck", params: { sessionId: p.sessionId }, sessionId: session }));
      const path = join(shots, `${String(frames.length).padStart(6, "0")}.jpg`);
      writeFileSync(path, Buffer.from(p.data, "base64"));
      frames.push([p.metadata.timestamp, path]);
    } else if (m.method === "Page.frameNavigated" && p.frame.id === main?.id) urls.push([Date.now() / 1000, p.frame.url]);
    else if (m.method === "Page.navigatedWithinDocument" && p.frameId === main?.id) urls.push([Date.now() / 1000, p.url]);
    else if (m.method === "Target.targetInfoChanged" && p.targetInfo.targetId === page?.targetId && p.targetInfo.title !== titles.at(-1)[1])
      titles.push([Date.now() / 1000, p.targetInfo.title]);
  };
  page = (await call("Target.getTargets")).targetInfos.find((t) => t.type === "page" && t.attached && !t.url.startsWith("chrome"));
  session = (await call("Target.attachToTarget", { targetId: page.targetId, flatten: true })).sessionId;
  main = (await call("Page.getFrameTree", {}, session)).frameTree.frame;
  urls.push([0, main.url]);
  titles.push([0, page.title]);
  await call("Page.enable", {}, session);
  // Quality 80 looks the same as 95 at 1:1 but keeps up with Chrome at about 55 fps; 95 drops to about 43, unevenly.
  await call("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 1280 * SCALE, maxHeight: 720 * SCALE }, session);
  await call("Target.setDiscoverTargets", { discover: true }); // title changes arrive as target updates
  return ws;
}

const length = (text) => voiced[text] || 0.4 + text.trim().split(/\s+/).length / 2.6; // ponytail: even reading pace until the line is voiced

const GAP = 0.6; // breath between lines
const SETTLE = 0.5; // a person looks at what a click or key did before moving on
await ab("set", "viewport", "1280", "720");
await ab("open", url);
await ab("wait", "--load", "networkidle"); // open the take on the settled page, not a loading state
await ab("mouse", "move", "640", "520");
const shots = join(out, "frames"), frames = [], urls = [], titles = [];
rmSync(shots, { recursive: true, force: true });
mkdirSync(shots);
const ws = await film(shots, frames, urls, titles);
while (!frames.length) await sleep(0.05);
t0 = mono(); wall0 = Date.now() / 1000; // video time 0, on both clocks
await sleep(1.2); // let the viewer take in the page before the first word
const RECT = "if (!el) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom];";
const pointing = (c) => c[0] === "humantype" || (c[0] === "click" && c.includes("--human"));
const lines = [], cuts = [];
let talking = 0, shot = "wide";
const cut = (c0) => { cuts.push([c0, Date.now() / 1000]); t0 += cuts.at(-1)[1] - c0; };
for (const [i, b] of beats.entries()) {
  console.error(`beat ${i + 1}/${beats.length}`);
  b.at = mono() - t0;
  shot = b.shot = b.shot ?? shot;
  const frame = shot === "wide" ? null : await on(shot, RECT);
  let left = null; // the shot as it was when a cut left the page
  for (const [j, cmd] of b.do.entries()) {
    const last = !b.do.slice(j + 1).some(pointing); // a hand only steps aside once it's done for the beat
    const c0 = mono() - t0;
    if (cmd[0] === "say") {
      await sleep(talking + GAP - (mono() - t0));
      lines.push({ at: mono() - t0, say: cmd[1] });
      talking = lines.at(-1).at + length(cmd[1]);
      busy.push([lines.at(-1).at, talking]);
    } else if (cmd[0] === "scrollto") {
      // Eased like a hand on a trackpad, farther takes longer, leaving the target a fifth of the way down the
      // viewport. The browser's own smooth scroll is too quick to follow on video.
      const ms = await on(cmd[1], `const y0 = scrollY, d = Math.min(el.getBoundingClientRect().top - innerHeight / 5,
          document.scrollingElement.scrollHeight - innerHeight - y0), ms = Math.min(4000, 1000 + 0.8 * Math.abs(d)), t = performance.now();
        const f = now => { const p = Math.min(1, (now - t) / ms);
          scrollTo({top: y0 + d * (p < 0.5 ? 4 * p ** 3 : 1 - (2 - 2 * p) ** 3 / 2), behavior: 'instant'}); if (p < 1) requestAnimationFrame(f); };
        requestAnimationFrame(f); return ms;`);
      await sleep(ms / 1000 + 0.2);
      busy.push([c0, mono() - t0]);
    } else if (cmd[0] === "cut") { // a wait nobody needs to watch, like a page loading, is cut from the take
      if (cmd[1] === "open") { // leaving the page: the line finishes and the camera measures its shot first
        await sleep(talking + 0.3 - (mono() - t0));
        if (shot !== "wide" && left === null) left = await on(shot, RECT);
      }
      const c0 = Date.now() / 1000;
      await ab(...cmd.slice(1));
      cut(c0);
    } else if (cmd[0] === "click" && cmd.includes("--human")) {
      await glide(cmd[1]);
      if (b.do[j + 1]?.[0] === "cut") {
        await sleep(0.15); // the press shows, then the cut
        continue;
      }
      await sleep(SETTLE);
      if (last) await stepAside();
    } else if (cmd[0] === "humantype") {
      if (!(await on(cmd[1], "return document.activeElement === el;"))) { // nobody clicks a field they're already typing in
        await glide(cmd[1]);
        await sleep(uniform(0.15, 0.3));
        await stepAside(); // out of the way of the text
      }
      let text = cmd[2];
      if (text.startsWith("$ ")) { // a value only known now, like an emailed code; the wait for it is cut from the take
        const c0 = Date.now() / 1000;
        text = (await promisify(exec)(text.slice(2))).stdout.trim().split("\n").at(-1).trim();
        cut(c0);
      }
      const k0 = mono() - t0;
      for (const ch of text) {
        await ab("keyboard", "type", ch);
        await sleep(uniform(0.07, 0.16));
      }
      busy.push([k0, mono() - t0]);
      await sleep(SETTLE);
    } else {
      await ab(...cmd);
      if (["click", "press", "dblclick"].includes(cmd[0])) {
        busy.push([c0, c0 + SETTLE]); // the page answers the press
        await sleep(SETTLE);
      }
    }
  }
  await sleep(talking + 1 - (mono() - t0)); // let the result sit before the next beat
  if (shot !== "wide") { // the camera frames the region as it was at the start and the end, so a growing list stays in shot
    const seen = [frame, left ?? (await on(shot, RECT))].filter(Boolean);
    if (!seen.length) die(`beat ${i + 1}: shot ${shot} matches nothing on the page`);
    b.frame = [Math.min(...seen.map((r) => r[0])), Math.min(...seen.map((r) => r[1])), Math.max(...seen.map((r) => r[2])), Math.max(...seen.map((r) => r[3]))];
  }
  b.said = lines.find((l) => l.at >= b.at)?.at ?? b.at;
}
const hold = mono() - t0;
await sleep(2); // the payoff holds two seconds, so the end does not cut mid-thought
let end = Date.now() / 1000;
// Nothing on screen should sit still and silent for more than 3 s; the opening look and the final hold are meant to.
busy.sort((a, b) => a[0] - b[0]);
let reach = 1.2;
for (const [a, b] of busy) {
  if (a - reach > 3) console.error(`warning: nothing moves or speaks from ${reach.toFixed(1)} s to ${a.toFixed(1)} s; cut the wait or give it a line`);
  reach = Math.max(reach, b);
}
if (hold - reach > 3) console.error(`warning: nothing moves or speaks from ${reach.toFixed(1)} s to ${hold.toFixed(1)} s; cut the wait or give it a line`);
ws.close();
await ab("close");
if (!frames.length) die("Chrome sent no frames; is the demo session's page open?");

const uncut = (ts) => ts - cuts.reduce((s, [a, b]) => s + Math.min(b, Math.max(a, ts)) - a, 0); // a moment inside a cut lands where the cut does
// A cut keeps the last frame painted inside it, shown from where the cut lands, since a page that has settled sends no more.
const inside = new Map();
for (const [a, b] of cuts) {
  if (frames.some(([ts]) => b <= ts && ts < b + 0.2)) continue;
  const k = frames.findLastIndex(([ts]) => a < ts && ts < b);
  if (k >= 0) inside.set(k, b);
}
let kept = frames.flatMap(([ts, p], k) => (inside.has(k) ? [[uncut(inside.get(k)), p]]
  : cuts.some(([a, b]) => a < ts && ts < b) ? [] : [[uncut(ts), p]]));
end = uncut(end);
// Each frame lasts until the next repaint; a frame painted before time 0 opens the video.
const first = kept[0][0] <= wall0 ? kept.findLastIndex(([ts]) => ts <= wall0) : 0;
const held = [];
for (let [ts, p] of kept.slice(first)) {
  ts = Math.max(ts, wall0);
  if (ts >= end) break;
  if (held.length && ts - held.at(-1)[0] < 0.001) held.at(-1)[1] = p; // ffmpeg reads a zero duration as unset and holds that frame far too long
  else held.push([ts, p]);
}
held.push([end, held.at(-1)[1]]);
// Each image needs a fine timebase: by default ffmpeg reads one at 25 fps and rounds every frame's time to 40 ms.
const name = (p) => p.split(/[\\/]/).pop();
const fine = "option framerate 1000\n";
writeFileSync(join(shots, "list.txt"), held.slice(0, -1).map(([a, p], k) => `file '${name(p)}'\n${fine}duration ${(held[k + 1][0] - a).toFixed(4)}\n`).join("")
                                        + `file '${name(held.at(-1)[1])}'\n${fine}`);
const video = join(out, "video.mp4");
// Chrome sends 3x frames as fast as it can encode them, 35 to 55 a second and unevenly; an even 30 reads smoother
// than a page that moves on frames 1, 2 and 5. polish.mjs still draws the camera and pointer at 60. "option" lines
// above need -safe 0.
const enc = spawnSync(FFMPEG, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(shots, "list.txt"), "-vf", "fps=30",
                               "-t", (end - held[0][0]).toFixed(3), "-c:v", "libx264", // without -t, fps holds the last frame as long as the gap before it
                               "-preset", "fast", "-crf", "12", "-pix_fmt", "yuv420p", video], { stdio: "inherit" });
if (enc.status !== 0) die("ffmpeg failed to encode the take");
rmSync(shots, { recursive: true });
for (const x of [...beats, ...lines, ...presses]) x.at = r3(x.at);
for (const b of beats) b.said = r3(b.said);
for (const m of moves) { m.t0 = r3(m.t0); m.t1 = r3(m.t1); }
const pick = (b) => Object.fromEntries(["at", "said", "shot", "frame", "poster"].filter((k) => k in b).map((k) => [k, b[k]]));
writeFileSync(join(out, "narration.json"), JSON.stringify(lines, null, 1));
writeFileSync(join(out, "timeline.json"), JSON.stringify({
  video, viewport: [1280, 720], pointer: [640, 520], beats: beats.map(pick), moves, presses,
  urls: urls.map(([ts, u]) => ({ at: r3(Math.max(0, uncut(ts) - wall0)), url: u })),
  titles: titles.map(([ts, u]) => ({ at: r3(Math.max(0, uncut(ts) - wall0)), title: u })),
}, null, 1));
console.log(video);
