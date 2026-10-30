"""Give a recorded demo the finish of a screen-recording editor: a camera that frames what each beat's shot names,
moving only when the shot changes and starting with the beat's first line; a cursor drawn crisp at any zoom along a
hand's path, blurred while it moves, with a ring on each click; and the page as a rounded card with a shadow on a wallpaper, at 2560x1440 and 60 fps.

usage: uv run --with pillow python polish.py <out-dir> [--background <image> | --background none] [--frame safari|chrome]
Reads video.mp4 and timeline.json, writes polished.mp4. The wallpaper defaults to ../assets/wallpaper.png; none fills
the frame with the page edge to edge, with no card. --frame puts the page in a Safari or Chrome window whose address
bar (and Chrome's tab title) follows the page.
Timing is untouched, so narration.json still lines up with polished.mp4.
"""
import json, math, shutil, subprocess, sys
from pathlib import Path
try:
    from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps
except ImportError:
    sys.exit("needs Pillow: uv run --with pillow python polish.py <out-dir>, or pip install pillow")

W, H, FPS = 2560, 1440, 60  # a 4K take framed up to MAX_ZOOM still fills this card about pixel for pixel
MARGIN = 0.15     # room around a framed region, each side
MAX_ZOOM = 2.0
MIN_ZOOM = 1.25   # a frame that needs less than this isn't worth a camera move: it stays wide
CURSOR = 28       # pointer height in CSS pixels, a little larger than life so it reads in a video
SHUTTER = 0.5     # the pointer blurs over this share of a frame while it moves, like a camera's 180° shutter
RING = 0.45       # seconds a click's ring takes to spread and fade

def move_time(a, c):  # a deeper zoom travels further, so it takes longer: 0.7 s at 1.25x, about 1 s at 2x
    return 0.6 + 0.55 * math.log(max(a[2], c[2]))

def tool(name):
    return shutil.which(name) or sys.exit(f"{name} not found on PATH")

args = sys.argv[1:]
wallpaper = args.pop(args.index("--background") + 1) if "--background" in args else Path(__file__).parent.parent / "assets" / "wallpaper.png"
kind = args.pop(args.index("--frame") + 1) if "--frame" in args else ""  # a browser window around the page
if kind not in ("", "safari", "chrome"):
    sys.exit("--frame takes safari or chrome")
out = Path(args[0])
tl = json.loads((out / "timeline.json").read_text(encoding="utf-8"))
src = out / "video.mp4"
sw, sh = map(int, subprocess.check_output([tool("ffprobe"), "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height",
                                           "-of", "csv=p=0", str(src)], text=True).strip().split(","))
vw, vh = tl["viewport"]

def ease(u):
    u = min(1.0, max(0.0, u))
    return 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2

# 1. The pointer: each logged move along a gentle curve, with a minimum-jerk speed profile, like a hand.
def pointer(t):
    at = tl["pointer"]
    for m in tl["moves"]:
        if t < m["t0"]:
            break
        if t >= m["t1"]:
            at = m["to"]
            continue
        (x0, y0), (x1, y1) = m["from"], m["to"]
        u = (t - m["t0"]) / max(1e-3, m["t1"] - m["t0"])
        s = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5
        bx, by = (x0 + x1) / 2 - (y1 - y0) * m["bend"], (y0 + y1) / 2 + (x1 - x0) * m["bend"]  # control point off the line
        return ((1 - s) ** 2 * x0 + 2 * (1 - s) * s * bx + s * s * x1, (1 - s) ** 2 * y0 + 2 * (1 - s) * s * by + s * s * y1)
    return at

def squash(t):  # the cursor dips on a press and springs back
    d = [t - p["at"] for p in tl["presses"] if -0.05 <= t - p["at"] <= 0.25]
    return 1 - 0.18 * math.sin(math.pi * (d[0] + 0.05) / 0.3) if d else 1.0

# An arrow cursor drawn once, large: a near-black arrow in an even white rim, corners rounded, on a soft drop shadow;
# scaled per frame. The rim is a stroke around the arrow with round joins, so it stays even down the thin tail.
S, PAD_C, RIM = 16, 5, 1.25
ARROW = [(0, 0), (0, 16.4), (4.0, 12.7), (6.5, 18.6), (9.0, 17.5), (6.6, 11.8), (11.6, 11.8)]
pts = [((x + PAD_C) * S, (y + PAD_C) * S) for x, y in ARROW]
sprite = Image.new("RGBA", ((14 + 2 * PAD_C) * S, (21 + 2 * PAD_C) * S), (0, 0, 0, 0))

def rounded(m, r):  # blur, then cut at the middle: rounds every corner by about r
    return m.filter(ImageFilter.GaussianBlur(r * S)).point(lambda v: 255 if v > 127 else 0)

core = Image.new("L", sprite.size, 0)
ImageDraw.Draw(core).polygon(pts, fill=255)
rim = core.copy()
d = ImageDraw.Draw(rim)
d.line(pts + [pts[0]], fill=255, width=round(2 * RIM * S), joint="curve")
for x, y in pts:
    d.ellipse((x - RIM * S, y - RIM * S, x + RIM * S, y + RIM * S), fill=255)
rim, core = rounded(rim, 0.3), rounded(core, 0.3)
shade = Image.new("L", sprite.size, 0)
shade.paste(rim, (round(0.3 * S), round(0.9 * S)))
sprite.paste((0, 0, 0, 255), (0, 0), shade.filter(ImageFilter.GaussianBlur(1.3 * S)).point(lambda v: v * 95 // 255))
sprite.paste((255, 255, 255, 255), (0, 0), rim)
sprite.paste((18, 18, 20, 255), (0, 0), core)

# 2. The scene at zoom 1: the backdrop with the card's shadow, and the window chrome, drawn once (per address).
u = W / 1920
bare = str(wallpaper) == "none"
if bare and kind:
    sys.exit("--frame needs a background to sit on")
PAD, RADIUS = (0, 0) if bare else (round(48 * u), round(20 * u))  # a thin margin of wallpaper: the page is the subject
BAR_CSS = {"safari": 38, "chrome": 76}.get(kind, 0)  # window chrome height, in the page's CSS pixels
BAR = round(BAR_CSS * (H - 2 * PAD) / (vh + BAR_CSS))
ch = H - 2 * PAD - BAR
cw = round(ch * sw / sh)  # keep the page's shape
left = (W - cw) // 2
# The wallpaper's colours only, smoothed, then fresh grain at this size: scaled-up grain looks smeared, and a bare
# gradient bands. bleed trims edge rows, which can be dark.
if bare:
    bg = Image.new("RGB", (W, H))
else:
    bg = ImageOps.fit(Image.open(wallpaper).convert("RGB"), (W, H), Image.LANCZOS, bleed=0.02).filter(ImageFilter.GaussianBlur(W / 100))
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((left, PAD + round(16 * u), left + cw, PAD + BAR + ch + round(16 * u)), RADIUS, fill=80)
    bg.paste((0, 0, 0), (0, 0), shadow.filter(ImageFilter.GaussianBlur(28 * u)))

def font(size):
    for f in ("/System/Library/Fonts/SFNS.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/segoeui.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default(size)

def fit(f, text, room):
    if f.getlength(text) > room:
        while text and f.getlength(text + "…") > room:
            text = text[:-1]
        text += "…"
    return text

GREY, DIM = (95, 99, 104), (60, 64, 67)
bars = {}
def window(url, title):
    # Drawn three times larger and scaled down, so circles and strokes come out smooth. Sizes are CSS pixels.
    if (url, title) in bars:
        return bars[url, title]
    s = 3
    q = ch / vh * s  # output pixels per CSS pixel, supersampled
    img = Image.new("RGB", (cw * s, BAR * s), (236, 236, 236) if kind == "safari" else (222, 226, 231))
    d = ImageDraw.Draw(img)
    width = cw * s / q  # the window's width in CSS pixels
    lights = 19 if kind == "safari" else 18
    for i, (fill, edge) in enumerate((((255, 95, 87), (226, 70, 63)), ((254, 188, 46), (223, 158, 32)), ((40, 200, 64), (30, 170, 50)))):
        x = (20 + 20 * i) * q
        d.ellipse((x - 6 * q, lights * q - 6 * q, x + 6 * q, lights * q + 6 * q), fill=fill, outline=edge, width=round(q * 0.5))
    host, _, rest = url.split("://", 1)[-1].partition("/")
    rest = ("/" + rest).rstrip("/") if rest else ""
    if kind == "safari":
        d.rectangle((0, BAR * s - q * 0.6, cw * s, BAR * s), fill=(214, 214, 214))
        pw = width * 0.42
        d.rounded_rectangle(((width - pw) / 2 * q, 7 * q, (width + pw) / 2 * q, 31 * q), 6 * q, fill=(255, 255, 255))
        f = font(round(12.5 * q))
        text = fit(f, host + rest, (pw - 50) * q)
        lock = 12 * q if url.startswith("https") else 0
        x = width / 2 * q - (f.getlength(text) + lock) / 2
        if lock:  # a padlock: body and shackle
            d.rounded_rectangle((x, 18 * q, x + 7 * q, 24 * q), q, fill=(110, 110, 110))
            d.arc((x + 1.2 * q, 13.5 * q, x + 5.8 * q, 20 * q), 180, 360, fill=(110, 110, 110), width=round(1.3 * q))
        d.text((x + lock, 19 * q), text, font=f, fill=(70, 70, 70), anchor="lm")
    else:
        # Tab strip: the one tab, its favicon, title and close, then a new-tab plus.
        d.rounded_rectangle((80 * q, 6 * q, 320 * q, 44 * q), 8 * q, fill=(255, 255, 255), corners=(True, True, False, False))
        d.ellipse((92 * q, 14 * q, 106 * q, 28 * q), outline=GREY, width=round(1.2 * q))  # a globe for the favicon
        d.ellipse((96.5 * q, 14 * q, 101.5 * q, 28 * q), outline=GREY, width=round(1.0 * q))
        d.line((92 * q, 21 * q, 106 * q, 21 * q), fill=GREY, width=round(1.0 * q))
        f = font(round(12 * q))
        d.text((114 * q, 21 * q), fit(f, title or host, 170 * q), font=f, fill=(31, 31, 31), anchor="lm")
        for a, b in (((300, 17), (308, 25)), ((308, 17), (300, 25))):
            d.line((a[0] * q, a[1] * q, b[0] * q, b[1] * q), fill=GREY, width=round(1.3 * q))
        d.line((334 * q, 21 * q, 346 * q, 21 * q), fill=GREY, width=round(1.4 * q))
        d.line((340 * q, 15 * q, 340 * q, 27 * q), fill=GREY, width=round(1.4 * q))
        # Toolbar: back, forward, reload, the address box, the menu.
        d.rectangle((0, 36 * q, cw * s, BAR * s), fill=(255, 255, 255))
        d.rectangle((0, BAR * s - q * 0.6, cw * s, BAR * s), fill=(218, 220, 224))
        for x, ink, sign in ((20, GREY, -1), (52, (190, 192, 196), 1)):  # forward is greyed out: nothing to go forward to
            d.line(((x - 7) * q, 56 * q, (x + 7) * q, 56 * q), fill=ink, width=round(1.6 * q))
            tip = x + 7 * sign
            d.line((tip * q, 56 * q, (tip - 6 * sign) * q, 50 * q), fill=ink, width=round(1.6 * q))
            d.line((tip * q, 56 * q, (tip - 6 * sign) * q, 62 * q), fill=ink, width=round(1.6 * q))
        # Reload: a circle open at the top right, its top end an arrowhead pointing clockwise.
        d.arc((77.5 * q, 49.5 * q, 90.5 * q, 62.5 * q), 330, 270, fill=GREY, width=round(1.6 * q))
        d.polygon(((83.5 * q, 46.2 * q), (87.6 * q, 50 * q), (83.5 * q, 53.8 * q)), fill=GREY)
        d.rounded_rectangle((104 * q, 41 * q, (width - 44) * q, 71 * q), 15 * q, fill=(239, 241, 244))
        for y, dot in ((52.5, 124), (59.5, 119)):  # the site-settings icon: two sliders
            d.line((116 * q, y * q, 128 * q, y * q), fill=DIM, width=round(1.3 * q))
            d.ellipse(((dot - 2.2) * q, (y - 2.2) * q, (dot + 2.2) * q, (y + 2.2) * q), fill=(239, 241, 244), outline=DIM, width=round(1.2 * q))
        f = font(round(13.5 * q))
        host_t = fit(f, host, (width - 200) * q)
        d.text((140 * q, 56 * q), host_t, font=f, fill=(31, 31, 31), anchor="lm")
        if rest and host_t == host:
            d.text((140 * q + f.getlength(host), 56 * q), fit(f, rest, (width - 200) * q - f.getlength(host)), font=f, fill=GREY, anchor="lm")
        for y in (50, 56, 62):  # the menu
            d.ellipse(((width - 22) * q, (y - 1.6) * q, (width - 18.8) * q, (y + 1.6) * q), fill=DIM)
    bars[url, title] = img.resize((cw * 2, BAR * 2), Image.LANCZOS)  # twice the size, so it stays sharp zoomed in
    return bars[url, title]

def latest(key, t):
    return next((x[key] for x in reversed(tl.get(key + "s", [])) if x["at"] <= t), "")

# 3. The camera moves over the whole scene (wallpaper, window and page, as laid out at zoom 1): one view, its centre and
# zoom in scene pixels, per beat, from the beat's shot.
top = PAD + BAR  # the page's top edge in the scene
css = cw / vw    # scene pixels per CSS pixel
WIDE = (W / 2, H / 2, 1.0)

def view(beat, n):
    f = beat.get("frame")
    if not f:
        return WIDE
    x0, y0, x1, y1 = left + f[0] * css, top + f[1] * css, left + f[2] * css, top + f[3] * css
    z = min(MAX_ZOOM, W / ((x1 - x0) * (1 + 2 * MARGIN)), H / ((y1 - y0) * (1 + 2 * MARGIN)))
    if z < MIN_ZOOM:
        print(f"beat {n}: {beat['shot']} nearly fills the frame (zoom {z:.2f}); staying wide", file=sys.stderr)
        return WIDE
    return (min(max((x0 + x1) / 2, W / z / 2), W - W / z / 2), min(max((y0 + y1) / 2, H / z / 2), H - H / z / 2), z)

cuts, here = [], WIDE  # the camera moves only where the shot changes, starting with the beat's first line
for n, b in enumerate(tl["beats"], 1):
    there = view(b, n)
    if max(abs(a - c) for a, c in zip(here, there)) > 1:
        cuts.append((b["said"] - 0.15, here, there, move_time(here, there)))
        here = there
print(f"camera moves: {len(cuts)}", file=sys.stderr)

def camera(t):
    cam = WIDE
    for start, a, c, d in cuts:
        if t < start:
            break
        u = ease((t - start) / d)
        z = math.exp(math.log(a[2]) + (math.log(c[2]) - math.log(a[2])) * u)  # zoom feels even in log space
        cam = (a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u, z)
    return cam

for p in tl["presses"]:  # a click the camera can't see is a screenplay bug
    cx, cy, z = camera(p["at"])
    if abs(left + p["x"] * css - cx) > W / z / 2 or abs(top + p["y"] * css - cy) > H / z / 2:
        print(f"warning: the click at {p['at']:.1f} s ({p['x']}, {p['y']}) is out of frame; widen that beat's shot", file=sys.stderr)

def blit(dst, src, x0, y0, x1, y1):
    # Stretch src over the output rectangle x0,y0-x1,y1, resampling only the part on screen.
    ix0, iy0, ix1, iy1 = round(max(0, x0)), round(max(0, y0)), round(min(W, x1)), round(min(H, y1))
    if ix1 <= ix0 or iy1 <= iy0:
        return
    fx, fy = src.width / (x1 - x0), src.height / (y1 - y0)
    box = (max(0, (ix0 - x0) * fx), max(0, (iy0 - y0) * fy), min(src.width, (ix1 - x0) * fx), min(src.height, (iy1 - y0) * fy))
    dst.paste(src.resize((ix1 - ix0, iy1 - iy0), Image.BICUBIC, box=box), (ix0, iy0))  # box clamped: rounding can overshoot a hair

def on_screen(t, x, y):  # a page point, in CSS pixels, where it lands on screen at time t
    cx, cy, z = camera(t)
    return (left + x * css - cx + W / z / 2) * z, (top + y * css - cy + H / z / 2) * z

def rings(layer, t, scale):
    # Each click sends out a ring that spreads and fades: dark on a white halo, so it reads on light and dark pages.
    for p in tl["presses"]:
        if not 0 <= t - p["at"] <= RING:
            continue
        u = (t - p["at"]) / RING
        r, w, a = (8 + 22 * (1 - (1 - u) ** 3)) * scale, 2.5 * scale, 1 - u
        s, half = 3, math.ceil(r + 2 * w) + 2  # drawn three times larger and scaled down, so the circle is smooth
        img = Image.new("RGBA", (2 * half * s, 2 * half * s), (0, 0, 0, 0))
        d, box = ImageDraw.Draw(img), [(half - r) * s, (half - r) * s, (half + r) * s, (half + r) * s]
        d.ellipse([v + (-w if i < 2 else w) * s * 0.5 for i, v in enumerate(box)], outline=(255, 255, 255, round(140 * a)), width=round(2 * w * s))
        d.ellipse(box, outline=(30, 30, 30, round(160 * a)), width=round(w * s))
        img = img.resize((2 * half, 2 * half), Image.LANCZOS)
        x, y = on_screen(t, p["x"], p["y"])
        layer.paste(img, (round(x) - half, round(y) - half), img)

def draw_pointer(layer, t, cur, off):
    # The pointer where it is at a few instants across the shutter, averaged, so a fast move blurs along its path
    # (camera moves included) instead of stepping from frame to frame. Still, it is one crisp paste.
    spots = [on_screen(ts, *pointer(ts)) for ts in (t + SHUTTER / FPS * (i / 4 - 0.5) for i in range(5))]
    if math.dist(spots[0], spots[-1]) < 1.5:
        x, y = spots[2]
        layer.paste(cur, (round(x - off), round(y - off)), cur)
        return
    x0, y0 = min(x for x, _ in spots), min(y for _, y in spots)
    size = (math.ceil(max(x for x, _ in spots) - x0) + cur.width + 1, math.ceil(max(y for _, y in spots) - y0) + cur.height + 1)
    pm, acc = cur.convert("RGBa"), None  # premultiplied, so the average has no dark fringe
    for i, (x, y) in enumerate(spots):
        one = Image.new("RGBa", size, (0, 0, 0, 0))
        one.paste(pm, (round(x - x0), round(y - y0)))
        acc = one if acc is None else Image.blend(acc, one, 1 / (i + 1))
    acc = acc.convert("RGBA")
    layer.paste(acc, (round(x0 - off), round(y0 - off)), acc)

grain = Image.effect_noise((W, H), 5).convert("RGB")  # on the screen, not the scene: it keeps its size at any zoom

dec = subprocess.Popen([tool("ffmpeg"), "-v", "error", "-i", str(src), "-r", str(FPS), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                       stdout=subprocess.PIPE)
enc = subprocess.Popen([tool("ffmpeg"), "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "faststart",
                        str(out / "polished.mp4")], stdin=subprocess.PIPE)
n = 0
while len(raw := dec.stdout.read(sw * sh * 3)) == sw * sh * 3:
    t = n / FPS
    cx, cy, z = camera(t)
    vx, vy = cx - W / z / 2, cy - H / z / 2  # the view's top-left, in scene pixels
    def at(x, y):
        return (x - vx) * z, (y - vy) * z
    canvas = bg.resize((W, H), Image.BICUBIC, box=(vx, vy, vx + W / z, vy + H / z))
    if not bare:
        canvas = ImageChops.add(canvas, grain, offset=-128)
    layer = Image.new("RGB", (W, H))
    (x0, y0), (x1, y1), wy = at(left, top), at(left + cw, top + ch), at(0, PAD)[1]
    blit(layer, Image.frombytes("RGB", (sw, sh), raw), x0, y0, x1, y1)
    if kind:
        blit(layer, window(latest("url", t), latest("title", t)), x0, wy, x1, y0)
    rings(layer, t, css * z)
    size = CURSOR * css * z * squash(t) / 21 / S
    cur = sprite.resize((max(1, round(sprite.width * size)), max(1, round(sprite.height * size))), Image.LANCZOS)
    draw_pointer(layer, t, cur, PAD_C * S * size)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((x0, wy, x1 - 1, y1 - 1), RADIUS * z, fill=255)
    canvas.paste(layer, (0, 0), mask)
    enc.stdin.write(canvas.tobytes())
    n += 1
enc.stdin.close()
enc.wait()
dec.wait()
print(out / "polished.mp4")
