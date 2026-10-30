"""Play beats.json in agent-browser while recording a silent video, paced for the narration laid under it later.

usage: uv run --with websockets python record.py <beats.json> <url> <out-dir> [--voice <lines.json>]

A ["say", "..."] action starts its line once the last one has finished, and the actions after it run while it plays,
so a click lands on the words about it. --voice takes each line's real length from a voiced lines.json (a list of
{"say", "seconds"}); without it, a line lasts as long as it takes to read aloud at an even pace.
A beat's "shot" is "wide" or a selector the camera frames; a beat without one keeps the last. The take has no pointer:
polish.py draws it, along the moves logged here, and runs the camera the shots ask for.
The take comes straight from Chrome's screencast at 3x (3840x2160), so the camera can frame a region and keep text sharp.
Writes video.mp4, narration.json (each line with the second it starts) and timeline.json (beats with their framed
region, pointer moves and presses, for polish.py).
"""
import base64, json, random, shutil, subprocess, sys, threading, time
from pathlib import Path
try:
    from websockets.sync.client import connect
except ImportError:
    sys.exit("needs websockets: uv run --with websockets python record.py ..., or pip install websockets")

sys.stderr.reconfigure(errors="replace")  # narration may not fit a Windows console code page

def tool(name):
    # Full path, so Windows finds npm's .cmd shims too.
    return shutil.which(name) or sys.exit(f"{name} not found on PATH")

SCALE = 3  # device pixels per CSS pixel; a real device scale, since an emulated one screencasts at 1x
AB = [tool("agent-browser"), "--session", "demo", "--args", f"--force-device-scale-factor={SCALE}"]
FFMPEG = tool("ffmpeg")
args = sys.argv[1:]
voiced = json.loads(Path(args.pop(args.index("--voice") + 1)).read_text(encoding="utf-8")) if "--voice" in args else []
voiced = {l["say"]: l["seconds"] for l in voiced}
beats = json.loads(Path(args[0]).read_text(encoding="utf-8"))
url, out = args[1], Path(args[2])
out.mkdir(parents=True, exist_ok=True)

def ab(*args):
    r = subprocess.run([*AB, *args], capture_output=True, text=True)
    if r.returncode:
        subprocess.run([*AB, "close"], capture_output=True)
        sys.exit(f"agent-browser {' '.join(args)} failed: {r.stdout}{r.stderr}")
    return r.stdout

# Run JS on one element: CSS, or XPath after "xpath=".
def on(sel, body):
    find = "s.startsWith('xpath=') ? document.evaluate(s.slice(6), document, null, 9, null).singleNodeValue : document.querySelector(s)"
    return json.loads(ab("eval", f"(s => {{ const el = {find}; {body} }})({json.dumps(sel)})"))

pointer, moves, presses = [640, 520], [], []

def move(x, y, ms):
    # polish.py draws this move with its own bend; the real pointer only has to get there on the same schedule.
    t = time.monotonic() - t0
    # --duration only holds with --human; the wait makes sure the hand takes the time it was given either way.
    ab("mouse", "move", str(round(x)), str(round(y)), "--human", "--duration", str(round(ms)), "--steps", str(max(2, round(ms / 16))))
    time.sleep(max(0.0, t + ms / 1000 - (time.monotonic() - t0)))
    moves.append({"t0": t, "t1": time.monotonic() - t0, "from": [round(c, 1) for c in pointer], "to": [round(x, 1), round(y, 1)],
                  "bend": round(random.uniform(0.06, 0.14) * random.choice((-1, 1)), 3)})
    pointer[:] = x, y

def glide(sel):
    # A hand lands somewhere inside the target, rarely its centre, in one movement: farther takes longer, and it
    # rests a beat before pressing.
    bx, by, bw, bh = on(sel, "el.scrollIntoView({block: 'nearest'}); const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];")
    x = bx + bw * min(0.8, max(0.2, random.gauss(0.5, 0.13)))
    y = by + bh * min(0.7, max(0.3, random.gauss(0.5, 0.1)))
    reach = ((x - pointer[0]) ** 2 + (y - pointer[1]) ** 2) ** 0.5
    ms = min(1300, 450 + 0.9 * reach) * random.uniform(0.85, 1.2)
    move(x, y, ms)
    time.sleep(random.uniform(0.18, 0.35))
    presses.append({"at": time.monotonic() - t0, "x": round(x), "y": round(y)})
    ab("mouse", "down")
    time.sleep(random.uniform(0.06, 0.12))
    ab("mouse", "up")

def step_aside():
    # Once the hand is done for now, it drifts off the content so the cursor doesn't cover what changed.
    # Sideways, toward the roomier edge: content tends to grow downward, under where the hand just was.
    x = min(1240, max(40, pointer[0] + (1 if pointer[0] < 640 else -1) * random.uniform(260, 420)))
    y = min(680, max(40, pointer[1] + random.uniform(30, 90)))
    move(x, y, random.uniform(700, 1100))

def film(stop, shots, frames, urls, titles):
    # Chrome sends a frame whenever the page repaints; each is saved with the moment it was painted. The address is
    # kept too, as it changes, for a browser frame around the video.
    with connect(ab("get", "cdp-url").strip(), max_size=None) as ws:
        def call(id, method, params=None, session=None):
            ws.send(json.dumps({"id": id, "method": method, "params": params or {}, **({"sessionId": session} if session else {})}))
            while (m := json.loads(ws.recv())).get("id") != id:
                pass  # events before the reply
            return m["result"]
        page = next(t for t in call(1, "Target.getTargets")["targetInfos"] if t["type"] == "page" and t["attached"] and not t["url"].startswith("chrome"))
        session = call(2, "Target.attachToTarget", {"targetId": page["targetId"], "flatten": True})["sessionId"]
        main = call(3, "Page.getFrameTree", {}, session)["frameTree"]["frame"]
        urls.append((0.0, main["url"]))
        titles.append((0.0, page["title"]))
        call(4, "Page.enable", {}, session)
        call(5, "Page.startScreencast", {"format": "jpeg", "quality": 95, "maxWidth": 1280 * SCALE, "maxHeight": 720 * SCALE}, session)
        call(6, "Target.setDiscoverTargets", {"discover": True})  # title changes arrive as target updates
        n = 6
        while not stop.is_set():
            try:
                m = json.loads(ws.recv(timeout=0.5))
            except TimeoutError:
                continue
            p = m.get("params", {})
            if m.get("method") == "Page.frameNavigated" and p["frame"]["id"] == main["id"]:
                urls.append((time.time(), p["frame"]["url"]))
            elif m.get("method") == "Page.navigatedWithinDocument" and p["frameId"] == main["id"]:
                urls.append((time.time(), p["url"]))
            elif m.get("method") == "Target.targetInfoChanged" and p["targetInfo"]["targetId"] == page["targetId"] and p["targetInfo"]["title"] != titles[-1][1]:
                titles.append((time.time(), p["targetInfo"]["title"]))
            if m.get("method") == "Page.screencastFrame":
                n += 1
                ws.send(json.dumps({"id": n, "method": "Page.screencastFrameAck", "params": {"sessionId": m["params"]["sessionId"]}, "sessionId": session}))
                path = shots / f"{len(frames):06d}.jpg"
                path.write_bytes(base64.b64decode(m["params"]["data"]))
                frames.append((m["params"]["metadata"]["timestamp"], path))

def length(text):
    return voiced.get(text) or 0.4 + len(text.split()) / 2.6  # ponytail: even reading pace until the line is voiced

GAP = 0.6  # breath between lines
SETTLE = 0.5  # a person looks at what a click or key did before moving on
ab("set", "viewport", "1280", "720")
ab("open", url)
ab("wait", "--load", "networkidle")  # open the take on the settled page, not a loading state
ab("mouse", "move", "640", "520")
shots, frames, urls, titles, stop = out / "frames", [], [], [], threading.Event()
shutil.rmtree(shots, ignore_errors=True)
shots.mkdir()
camera = threading.Thread(target=film, args=(stop, shots, frames, urls, titles), daemon=True)
camera.start()
while not frames and camera.is_alive():
    time.sleep(0.05)
t0, wall0 = time.monotonic(), time.time()  # video time 0, on both clocks
time.sleep(1.2)  # let the viewer take in the page before the first word
RECT = "if (!el) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom];"
POINTING = lambda c: c[0] == "humantype" or (c[0] == "click" and "--human" in c)
lines, talking, shot = [], 0.0, "wide"
cuts = []
for i, b in enumerate(beats):
    print(f"beat {i + 1}/{len(beats)}", file=sys.stderr)
    b["at"] = time.monotonic() - t0
    shot = b["shot"] = b.get("shot", shot)
    frame = None if shot == "wide" else on(shot, RECT)
    for j, cmd in enumerate(b["do"]):
        last = not any(POINTING(c) for c in b["do"][j + 1:])  # a hand only steps aside once it's done for the beat
        if cmd[0] == "say":
            time.sleep(max(0.0, talking + GAP - (time.monotonic() - t0)))
            lines.append({"at": time.monotonic() - t0, "say": cmd[1]})
            talking = lines[-1]["at"] + length(cmd[1])
        elif cmd[0] == "scrollto":
            # Smooth, leaving the target a fifth of the way down the viewport.
            on(cmd[1], "scrollTo({top: el.getBoundingClientRect().top + scrollY - innerHeight / 5, behavior: 'smooth'}); return 0;")
            time.sleep(0.9)
        elif cmd[0] == "cut":  # a wait nobody needs to watch, like a page loading, is cut from the take
            c0 = time.time()
            ab(*cmd[1:])
            cuts.append((c0, time.time()))
            t0 += cuts[-1][1] - c0
        elif cmd[0] == "click" and "--human" in cmd:
            glide(cmd[1])
            if j + 1 < len(b["do"]) and b["do"][j + 1][0] == "cut":
                time.sleep(0.15)  # the press shows, then the cut
                continue
            time.sleep(SETTLE)
            if last:
                step_aside()
        elif cmd[0] == "humantype":
            if not on(cmd[1], "return document.activeElement === el;"):  # nobody clicks a field they're already typing in
                glide(cmd[1])
                time.sleep(random.uniform(0.15, 0.3))
                step_aside()  # out of the way of the text
            text = cmd[2]
            if text.startswith("$ "):  # a value only known now, like an emailed code; the wait for it is cut from the take
                c0 = time.time()
                text = subprocess.run(text[2:], shell=True, capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
                cuts.append((c0, time.time()))
                t0 += cuts[-1][1] - c0
            for ch in text:
                ab("keyboard", "type", ch)
                time.sleep(random.uniform(0.07, 0.16))
            time.sleep(SETTLE)
        else:
            ab(*cmd)
            if cmd[0] in ("click", "press", "dblclick"):
                time.sleep(SETTLE)
    time.sleep(max(0.0, talking + 1.0 - (time.monotonic() - t0)))  # let the result sit before the next beat
    if shot != "wide":  # the camera frames the region as it was at the start and the end, so a growing list stays in shot
        seen = [r for r in (frame, on(shot, RECT)) if r] or sys.exit(f"beat {i + 1}: shot {shot} matches nothing on the page")
        b["frame"] = [min(r[0] for r in seen), min(r[1] for r in seen), max(r[2] for r in seen), max(r[3] for r in seen)]
    b["said"] = next((l["at"] for l in lines if l["at"] >= b["at"]), b["at"])
time.sleep(1.5)  # hold the last frame so the end does not cut mid-thought
end = time.time()
stop.set()
camera.join()
ab("close")
if not frames:
    sys.exit("Chrome sent no frames; is the demo session's page open?")

def uncut(ts):
    return ts - sum(b - a for a, b in cuts if b <= ts)
# A cut keeps the last frame painted inside it, shown from where the cut lands, since a page that has settled sends no more.
inside = {max((i for i, (ts, _) in enumerate(frames) if a < ts < b), default=None): b for a, b in cuts
          if not any(b <= ts < b + 0.2 for ts, _ in frames)}
frames = [(uncut(inside[i]) if i in inside else uncut(ts), p) for i, (ts, p) in enumerate(frames)
          if i in inside or not any(a < ts < b for a, b in cuts)]
end = uncut(end)
# Each frame lasts until the next repaint; a frame painted before time 0 opens the video.
first = max(i for i, (ts, _) in enumerate(frames) if ts <= wall0) if frames[0][0] <= wall0 else 0
held = []
for ts, p in frames[first:]:
    ts = max(ts, wall0)
    if ts >= end:
        break
    if held and ts - held[-1][0] < 0.001:  # ffmpeg reads a zero duration as unset and holds that frame far too long
        held[-1] = (held[-1][0], p)
    else:
        held.append((ts, p))
held.append((end, held[-1][1]))
(shots / "list.txt").write_text("".join(f"file '{a[1].name}'\nduration {b[0] - a[0]:.4f}\n" for a, b in zip(held, held[1:]))
                                + f"file '{held[-1][1].name}'\n", encoding="utf-8")
video = out / "video.mp4"
subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "concat", "-i", str(shots / "list.txt"), "-vf", "fps=60",
                "-t", f"{end - held[0][0]:.3f}", "-c:v", "libx264",  # without -t, fps holds the last frame as long as the gap before it
                "-preset", "fast", "-crf", "12", "-pix_fmt", "yuv420p", str(video)], check=True)
shutil.rmtree(shots)
for x in [*beats, *lines, *presses]:
    x["at"] = round(x["at"], 3)
for b in beats:
    b["said"] = round(b["said"], 3)
for m in moves:
    m["t0"], m["t1"] = round(m["t0"], 3), round(m["t1"], 3)
(out / "narration.json").write_text(json.dumps(lines, indent=1), encoding="utf-8")
(out / "timeline.json").write_text(json.dumps({"video": str(video), "viewport": [1280, 720], "pointer": [640, 520],
    "beats": [{k: b[k] for k in ("at", "said", "shot", "frame") if k in b} for b in beats], "moves": moves, "presses": presses,
    "urls": [{"at": round(max(0.0, ts - wall0), 3), "url": u} for ts, u in urls],
    "titles": [{"at": round(max(0.0, ts - wall0), 3), "title": u} for ts, u in titles]}, indent=1), encoding="utf-8")
print(video)
