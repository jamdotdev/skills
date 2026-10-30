"""Voice a script line by line and, with --video, lay each line under the video at its moment.

usage: python3 voiceover.py <lines.json> <out-dir> [--video <in.mp4>]      (python on Windows)

<lines.json> is a list of {"say": "...", "at": seconds}, plain strings, or record-demo beats with ["say", "..."] actions.
Lines without "at" follow each other with a short breath between them. A line that would talk over the one
before is pushed later, with a warning. Each line is cached in <out-dir> by its text and voice, so a re-run
only voices what changed.

Writes <out-dir>/lines.json (each line with "at", "seconds" and "wav"), <out-dir>/voiceover.vtt and, with --video,
<out-dir>/narration.wav and <out-dir>/voiced.mp4: the video untouched, with the narration raised to peak at -1 dB.

The voice is the first that is set up:
  VOICEOVER_TTS       a command; per line {out} becomes a .wav path and {text} the line, also sent on stdin
  ELEVENLABS_API_KEY  ElevenLabs; ELEVENLABS_VOICE_ID and ELEVENLABS_MODEL_ID override the defaults
  Kokoro              a local model through kokoro.py next to this file, once `kokoro.py --install` has run and uv is on PATH
  say                 the macOS voice, for drafts
"""
import hashlib, json, os, shlex, shutil, subprocess, sys, urllib.error, urllib.request
from pathlib import Path

sys.stderr.reconfigure(errors="replace")  # lines may not fit a Windows console code page

def tool(name):
    # Full path, so Windows finds .cmd shims too.
    return shutil.which(name) or sys.exit(f"{name} not found on PATH")

FFMPEG, FFPROBE = tool("ffmpeg"), tool("ffprobe")
GAP = 0.6  # breath between lines
args = sys.argv[1:]
video = Path(args.pop(args.index("--video") + 1)) if "--video" in args else None
src, out = Path(args[0]), Path(args[1])
out.mkdir(parents=True, exist_ok=True)

data = json.loads(src.read_text(encoding="utf-8"))
if data and isinstance(data[0], dict) and "do" in data[0]:
    data = [c[1] for b in data for c in b["do"] if c[0] == "say"]
lines = [{"say": x} if isinstance(x, str) else dict(x) for x in data] or sys.exit(f"no lines to voice in {src}")

VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "iP95p4xoKVk53GoZ742B")
MODEL = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_v4")

def elevenlabs(text, wav, before, after):
    body = {"text": text, "previous_text": before, "next_text": after,  # neighbours keep one intonation across lines
            "model_id": MODEL,
            # v4 takes only these two; lower stability makes a voice laugh and drift between lines.
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "use_speaker_boost": True}}
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128",
                                 data=json.dumps(body).encode(),
                                 headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"})
    try:
        mp3 = urllib.request.urlopen(req, timeout=120).read()
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs {e.code}: {e.read().decode(errors='replace')}")
    Path(f"{wav}.mp3").write_bytes(mp3)
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", f"{wav}.mp3", "-ac", "1", wav], check=True)
    os.remove(f"{wav}.mp3")

def command(argv):
    return lambda text, wav, *_: subprocess.run([wav if a == "{out}" else text if a == "{text}" else a for a in argv],
                                            input=text, text=True, encoding="utf-8", check=True)

kokoro = Path(os.environ.get("KOKORO_DIR", Path.home() / ".cache" / "kokoro")) / "voices-v1.0.bin"
if os.environ.get("VOICEOVER_TTS"):
    engine = ["custom", os.environ["VOICEOVER_TTS"]]
    speak = command([a.strip('"') for a in shlex.split(os.environ["VOICEOVER_TTS"], posix=os.name != "nt")])
elif os.environ.get("ELEVENLABS_API_KEY"):
    engine = ["elevenlabs", VOICE, MODEL]
    speak = elevenlabs
elif shutil.which("uv") and kokoro.exists():
    engine = ["kokoro", os.environ.get("KOKORO_VOICE")]
    speak = command([tool("uv"), "run", "-q", "--python", "3.12", "--with", "kokoro-onnx", "--with", "soundfile",
                     "python", str(Path(__file__).with_name("kokoro.py")), "{out}"])
elif shutil.which("say"):
    engine = ["say"]
    speak = command([tool("say"), "-o", "{out}", "--data-format=LEI16@22050", "{text}"])
else:
    sys.exit("no voice: set ELEVENLABS_API_KEY or VOICEOVER_TTS, or run kokoro.py --install")
print(f"voice: {engine[0]}", file=sys.stderr)

def seconds(path):
    return float(subprocess.check_output([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]))

said = [l["say"] for l in lines]
for i, l in enumerate(lines):
    wav = out / f"{hashlib.sha1(json.dumps([engine, l['say']]).encode()).hexdigest()[:10]}.wav"
    if not wav.exists():
        print(f"voicing {i + 1}/{len(lines)}: {l['say']}", file=sys.stderr)
        speak(l["say"], str(wav), " ".join(said[max(0, i - 2):i]), " ".join(said[i + 1:i + 3]))
    l["wav"], l["seconds"] = wav.name, round(seconds(wav), 3)

free = 0.5  # when the voice may start again
for i, l in enumerate(lines):
    if l.get("at") is None:
        l["at"] = free
    elif i and l["at"] < free - GAP:
        print(f"line {i + 1} starts {free - l['at']:.1f} s late so it doesn't talk over line {i}; shorten one of them", file=sys.stderr)
        l["at"] = free
    l["at"] = round(l["at"], 3)
    free = l["at"] + l["seconds"] + GAP
(out / "lines.json").write_text(json.dumps(lines, indent=1), encoding="utf-8")

def ts(s):
    return f"{int(s // 3600):02d}:{int(s % 3600 // 60):02d}:{s % 60:06.3f}"
(out / "voiceover.vtt").write_text("WEBVTT\n\n" + "".join(f"{ts(l['at'])} --> {ts(l['at'] + l['seconds'])}\n{l['say']}\n\n" for l in lines),
                                   encoding="utf-8")

if video:
    if (end := lines[-1]["at"] + lines[-1]["seconds"]) > (length := seconds(video)):
        print(f"the narration runs {end - length:.1f} s past the video's end and is cut there", file=sys.stderr)
    inputs = [x for l in lines for x in ("-i", str(out / l["wav"]))]
    delays = [f"[{i}:a]aresample=48000,adelay={int(l['at'] * 1000)}:all=1[a{i}]" for i, l in enumerate(lines)]
    mix = "".join(f"[a{i}]" for i in range(len(lines))) + f"amix=inputs={len(lines)}:normalize=0"
    subprocess.run([FFMPEG, "-v", "error", "-y", *inputs, "-filter_complex", ";".join([*delays, mix]),
                    str(out / "narration.wav")], check=True)
    # One gain for the whole track, peaks at -1 dB. loudnorm and other dynamic levelers pump up each word's tail into an echo.
    peak = subprocess.run([FFMPEG, "-i", str(out / "narration.wav"), "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    gain = -1.0 - float(peak.split("max_volume:")[1].split()[0])
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(video), "-i", str(out / "narration.wav"), "-filter_complex", f"[1:a]volume={gain:.2f}dB,apad[aout]",
                    "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
                    "-movflags", "faststart", str(out / "voiced.mp4")], check=True)
    print(out / "voiced.mp4")
else:
    print(out / "lines.json")
