// Voice a script line by line and, with --video, lay each line under the video at its moment.
//
// usage: node voiceover.mjs <lines.json> <out-dir> [--video <in.mp4>]
//
// <lines.json> is a list of {"say": "...", "at": seconds}, plain strings, or record-demo beats with ["say", "..."] actions.
// Lines without "at" follow each other with a short breath between them. A line that would talk over the one
// before is pushed later, with a warning. Each line is cached in <out-dir> by its text and voice, so a re-run
// only voices what changed.
//
// Writes <out-dir>/lines.json (each line with "at", "seconds" and "wav"), <out-dir>/voiceover.vtt and, with --video,
// <out-dir>/narration.wav and <out-dir>/voiced.mp4: the video untouched, with the narration raised to peak at -1 dB.
//
// The voice is the first that is set up:
//   VOICEOVER_TTS       a command; per line {out} becomes a .wav path and {text} the line, also sent on stdin
//   ELEVENLABS_API_KEY  ElevenLabs; ELEVENLABS_VOICE_ID and ELEVENLABS_MODEL_ID override the defaults
//   Kokoro              a local model through kokoro.py next to this file, once `kokoro.py --install` has run and uv is on PATH
//   say                 the macOS voice, for drafts
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const die = (msg) => { console.error(msg); process.exit(1); };

function which(name) {
  // Full path, so Windows finds .cmd shims too.
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH || "").split(delimiter))
    for (const ext of exts) if (dir && existsSync(join(dir, name + ext))) return join(dir, name + ext);
}
const tool = (name) => which(name) || die(`${name} not found on PATH`);

function run(file, args, opts = {}) {
  // A Windows .cmd shim only runs through the shell. ponytail: plain double quotes, enough for paths and lines.
  const shell = /\.(cmd|bat)$/i.test(file);
  const r = spawnSync(shell ? `"${file}"` : file, shell ? args.map((a) => `"${a.replaceAll('"', '""')}"`) : args,
                      { encoding: "utf8", shell, ...opts });
  if (r.status !== 0 && !opts.ok) die(`${file} failed: ${r.stderr || r.error || ""}`);
  return r;
}

const FFMPEG = tool("ffmpeg"), FFPROBE = tool("ffprobe");
const GAP = 0.6; // breath between lines
const args = process.argv.slice(2);
const vi = args.indexOf("--video");
const video = vi >= 0 ? args.splice(vi, 2)[1] : null;
const [src, out] = args;
if (!out) die("usage: node voiceover.mjs <lines.json> <out-dir> [--video <in.mp4>]");
mkdirSync(out, { recursive: true });

let data = JSON.parse(readFileSync(src, "utf8"));
if (data.length && data[0]?.do) data = data.flatMap((b) => b.do.filter((c) => c[0] === "say").map((c) => c[1]));
const lines = data.map((x) => (typeof x === "string" ? { say: x } : { ...x }));
if (!lines.length) die(`no lines to voice in ${src}`);

const VOICE = process.env.ELEVENLABS_VOICE_ID || "iP95p4xoKVk53GoZ742B";
const MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_v4";

async function elevenlabs(text, wav, before, after) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text, previous_text: before, next_text: after, // neighbours keep one intonation across lines
      model_id: MODEL,
      // Lower stability makes a voice laugh and drift between lines.
      voice_settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) die(`ElevenLabs ${r.status}: ${await r.text()}`);
  writeFileSync(`${wav}.mp3`, Buffer.from(await r.arrayBuffer()));
  run(FFMPEG, ["-v", "error", "-y", "-i", `${wav}.mp3`, "-ac", "1", wav]);
  rmSync(`${wav}.mp3`);
}

const command = (argv) => (text, wav) => run(argv[0], argv.slice(1).map((a) => a.replaceAll("{out}", () => wav).replaceAll("{text}", () => text)), { input: text });

const kokoro = join(process.env.KOKORO_DIR || join(homedir(), ".cache", "kokoro"), "voices-v1.0.bin");
let engine, speak;
if (process.env.VOICEOVER_TTS) {
  engine = ["custom", process.env.VOICEOVER_TTS];
  // Shell-style words: quotes group, even mid-word, so --voice="Jane Doe" stays one argument. Backslash escapes are not read.
  speak = command(process.env.VOICEOVER_TTS.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g).map((a) => a.replace(/"([^"]*)"|'([^']*)'/g, "$1$2")));
} else if (process.env.ELEVENLABS_API_KEY) {
  engine = ["elevenlabs", VOICE, MODEL];
  speak = elevenlabs;
} else if (which("uv") && existsSync(kokoro)) {
  engine = ["kokoro", process.env.KOKORO_VOICE ?? null];
  speak = command([tool("uv"), "run", "-q", "--python", "3.12", "--with", "kokoro-onnx", "--with", "soundfile",
                   "python", join(import.meta.dirname, "kokoro.py"), "{out}"]);
} else if (which("say")) {
  engine = ["say"];
  speak = command([tool("say"), "-o", "{out}", "--data-format=LEI16@22050", "{text}"]);
} else {
  die("no voice: set ELEVENLABS_API_KEY or VOICEOVER_TTS, or run kokoro.py --install");
}
console.error(`voice: ${engine[0]}`);

const seconds = (path) => parseFloat(run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout);
const round = (x) => Math.round(x * 1000) / 1000;

// The cache key is Python's json.dumps of [engine, line], so lines voiced by the earlier Python script are reused.
// ElevenLabs hears the lines around each one too, so for it they are part of the key: editing a line re-voices its neighbours.
const pyjson = (v) => (Array.isArray(v) ? `[${v.map(pyjson).join(", ")}]`
  : JSON.stringify(v).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`));

const said = lines.map((l) => l.say);
for (const [i, l] of lines.entries()) {
  const before = said.slice(Math.max(0, i - 2), i).join(" "), after = said.slice(i + 1, i + 3).join(" ");
  const key = engine[0] === "elevenlabs" ? [engine, l.say, before, after] : [engine, l.say];
  const wav = join(out, `${createHash("sha1").update(pyjson(key)).digest("hex").slice(0, 10)}.wav`);
  if (!existsSync(wav)) {
    console.error(`voicing ${i + 1}/${lines.length}: ${l.say}`);
    const part = wav.replace(/\.wav$/, ".part.wav"); // only a finished line is cached: an interrupted one is voiced again
    await speak(l.say, part, before, after);
    renameSync(part, wav);
  }
  l.wav = wav.split(/[\\/]/).pop();
  l.seconds = round(seconds(wav));
}

let free = 0.5; // when the voice may start again
for (const [i, l] of lines.entries()) {
  if (l.at == null) l.at = free;
  else if (i && l.at < free - GAP) {
    console.error(`line ${i + 1} starts ${(free - l.at).toFixed(1)} s late so it doesn't talk over line ${i}; shorten one of them`);
    l.at = free;
  }
  l.at = round(l.at);
  free = l.at + l.seconds + GAP;
}
writeFileSync(join(out, "lines.json"), JSON.stringify(lines, null, 1));

const ts = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${(s % 60).toFixed(3).padStart(6, "0")}`;
writeFileSync(join(out, "voiceover.vtt"), "WEBVTT\n\n" + lines.map((l) => `${ts(l.at)} --> ${ts(l.at + l.seconds)}\n${l.say}\n\n`).join(""));

if (video) {
  const end = lines.at(-1).at + lines.at(-1).seconds, length = seconds(video);
  if (end > length) console.error(`the narration runs ${(end - length).toFixed(1)} s past the video's end and is cut there`);
  const narration = join(out, "narration.wav");
  const delays = lines.map((l, i) => `[${i}:a]aresample=48000,adelay=${Math.floor(l.at * 1000)}:all=1[a${i}]`);
  const mix = lines.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${lines.length}:normalize=0`;
  run(FFMPEG, ["-v", "error", "-y", ...lines.flatMap((l) => ["-i", join(out, l.wav)]), "-filter_complex", [...delays, mix].join(";"), narration]);
  // One gain for the whole track, peaks at -1 dB. loudnorm and other dynamic levelers pump up each word's tail into an echo.
  const peak = run(FFMPEG, ["-i", narration, "-af", "volumedetect", "-f", "null", "-"], { ok: true }).stderr;
  const gain = -1 - parseFloat(peak.split("max_volume:")[1]);
  // A video with its own sound keeps it, at its own level, under the narration, to the video's end however short it is.
  const sound = run(FFPROBE, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", video]).stdout.trim();
  let voice = `[1:a]volume=${gain.toFixed(2)}dB,apad${sound ? "[n];[0:a][n]amix=inputs=2:normalize=0:duration=longest" : ""}[aout]`;
  if (sound) { // the two together can peak over 0 dB: one more fixed gain brings the mix back to -1 dB
    const both = run(FFMPEG, ["-i", video, "-i", narration, "-filter_complex", voice.replace("[aout]", ",volumedetect[aout]"),
                              "-map", "[aout]", "-t", String(length), "-f", "null", "-"], { ok: true }).stderr;
    const over = parseFloat(both.split("max_volume:")[1]) + 1;
    if (over > 0) voice = voice.replace("[aout]", `,volume=${(-over).toFixed(2)}dB[aout]`);
  }
  run(FFMPEG, ["-v", "error", "-y", "-i", video, "-i", narration, "-filter_complex", voice,
               "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
               "-movflags", "faststart", join(out, "voiced.mp4")]);
  console.log(join(out, "voiced.mp4"));
} else {
  console.log(join(out, "lines.json"));
}
