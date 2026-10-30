---
name: record-demo
description: "Record a narrated, human-paced demo video of a web feature with agent-browser: a smooth pointer, typing a viewer can read, no dead air, clicks paced to land on the narration, and a camera directed shot by shot from a screenplay, as a sharp 2560x1440 60 fps MP4. Use when the user asks to demo a feature, record a walkthrough, make a demo or screen recording for a PR, docs or release notes, or show someone what changed in the UI."
---

# Record a demo

A demo shows a person what changed in under a minute. Dead air comes from you thinking between commands, so never record while exploring. Explore first, write a screenplay of beats, then let the bundled player run it with no model in the loop.

Needs `agent-browser` (0.38.1 or later), `ffmpeg`, Python 3 and `uv` (or `pip install pillow websockets`) on macOS, Linux or Windows (`python` instead of `python3` there). The player is `scripts/record.py` in this skill's folder. The narration comes from the `add-voiceover` skill, in the folder next to this one (`<skill-dir>/../add-voiceover`); without it, record a silent video. Install it with `npx skills add jamdotdev/skills --skill add-voiceover`.

## 1. Rehearse without recording

Open the page, run `agent-browser snapshot -i`, and run every action once. Pick CSS selectors that still match after earlier steps change the page; refs like `@e3` go stale.

If the app needs sign-in or seed data, set that up now, in the session the player uses, launched the way it launches it: `agent-browser --session demo --args "--force-device-scale-factor=3" open <url>`. The flag renders the page at 3x for a sharp take; a session started without it keeps its 1x screen.

## 2. Write the screenplay, `beats.json`

At most six beats. A beat shows one thing: a `shot` for the camera, and in `do` the commands that show it, with the lines that say it as `["say", "..."]` actions. The voice leads, like a person recording: a line starts once the one before has finished, and the commands after it run while it plays, so a click lands on the words about it. A full example is `beats.example.json` in this skill's folder.

```json
[
  {"shot": "wide",
   "do": [["say", "This is TodoMVC. Let's add the first thing to do."],
          ["click", ".new-todo", "--human"], ["humantype", ".new-todo", "Buy oat milk"], ["press", "Enter"]]},
  {"shot": ".todoapp",
   "do": [["say", "Every item lands in the list the moment you press Enter."],
          ["humantype", ".new-todo", "Book flights to Lisbon"], ["press", "Enter"]]},
  {"do": [["say", "Done with one? Tick its checkbox."],
          ["click", ".todo-list li:nth-child(1) .toggle", "--human"]]}
]
```

Direct the camera before you write a command. A camera move is a cut the viewer has to follow, so each one needs a reason:

1. Open `wide`, so the viewer knows where they are.
2. Frame a region (`"shot": "<selector>"`) only to make readable what the line is about: the list that grows, the message that appears, the number that changed. The frame holds for the whole beat and must contain every control the beat clicks.
3. At most one move per beat. It starts with the beat's first line, so the voice and the camera arrive together. A beat without `shot` keeps the last one, and the camera stays still.
4. Stay framed across beats in the same area. Never zoom out and back in between them.
5. Go `wide` when the page changes under the viewer, and for the last beat.

The camera never follows clicks on its own. A frame that would zoom in less than 1.25x stays wide, and `polish.py` warns about a click outside its beat's frame.

- Write the lines with the rules in `add-voiceover`: short, spoken, one idea each, naming what the viewer should notice, not what the mouse does. Put a line just before the command it describes.
- `do` entries are agent-browser commands. `humantype <selector> <text>` types one key at a time; plain `type` and `fill` put the whole text in one frame.
- Use `click <sel> --human` so the pointer travels there like a hand and the press shows. A plain `click` happens with no pointer on screen.
- `["scrollto", "<sel>"]` scrolls smoothly until the element sits a fifth of the way down the screen. Plain `scroll` jumps in one frame. Selectors are CSS, or XPath after `xpath=` to match by text: `xpath=//button[contains(., 'Save')]`.
- Add `["wait", "900"]` after a change the viewer needs a moment to read.
- `["cut", <agent-browser command>]` runs the command and cuts its time from the video, for a wait nobody needs to watch: `["cut", "wait", "--text", "Welcome"]` skips a loading screen. After `click <sel> --human`, the press shows and the cut follows straight away.
- A `humantype` text that starts with `$ ` is a shell command run at that moment. Its last output line is typed and the wait for it is cut, for a value only known mid-take, like an emailed sign-in code: `["humantype", "#code", "$ python3 fetch_code.py"]`. Never put the value itself in `beats.json`.

## 3. Record

Voice the lines first, so each beat waits for its real narration, then record, then lay the voice under the video:

```bash
python3 <add-voiceover-dir>/scripts/voiceover.py beats.json ./voice
uv run --with websockets python <skill-dir>/scripts/record.py beats.json <url> ./demo-out --voice voice/lines.json
uv run --with pillow python <skill-dir>/scripts/polish.py demo-out
python3 <add-voiceover-dir>/scripts/voiceover.py demo-out/narration.json ./voice --video demo-out/polished.mp4
```

`polish.py` gives the raw take the finish of a screen-recording editor: the camera runs the screenplay's shots over the whole composed shot, window and wallpaper included, easing between them in 0.7 to 1 s (a deeper zoom takes longer), and draws the pointer crisp at any zoom, blurred along its path while it moves, with a small squash and a fading ring on each press. The page sits as a rounded card with a shadow on the wallpaper in `assets/wallpaper.png` (`--background <image>` picks another; `--background none` fills the frame with the page edge to edge, for docs or side-by-side comparisons). `--frame safari` or `--frame chrome` puts the page in that browser's window, its address bar (and Chrome's tab title) following the page as it changes; use it when where you are in the app is part of the story. It renders at 2560x1440 and 60 fps, so text stays sharp even zoomed in. Timing does not change, so the narration still lines up. The last command reuses the lines the first one voiced and writes `voice/voiced.mp4`. Pick the voice as `add-voiceover` says before the first command, and keep it for both voice commands: the first command voices the final cut, and a different voice changes each line's length, which moves the clicks off their words. To rehearse cheaply, run them all with Kokoro, then again with the real voice. For a silent video, skip both voice commands and drop `--voice`; lines are then timed at reading pace and the voice can be added later.

The page loads before recording starts, the viewport is 1280x720, and the player takes the frames straight from Chrome's screencast at 3x (agent-browser's own recorder captures at 1x), so the take is a true 3840x2160 at up to 60 fps. The take has no pointer; `polish.py` draws it, so always run it. The pointer moves like a hand: each path bends its own way and eases in and out in one movement to a point inside the target, rarely its centre, where it presses; and once the beat is done with it, it drifts sideways off the content. A field that already has focus is typed into without another click. The player writes `video.mp4`, `narration.json` with the second each line started, and `timeline.json` with each beat's shot and framed region, and the pointer's moves and presses.

If a command fails, the player stops and prints the agent-browser output. Fix the selector in `beats.json` and run it again.

## 4. Check before you share

Read what `polish.py` printed: the number of camera moves should match the shot changes you wrote, with no out-of-frame warning. Then extract one frame per beat, a second and a half after its `said` in `timeline.json`, and look at each:

```bash
ffmpeg -v error -ss <said + 1.5> -i voice/voiced.mp4 -frames:v 1 beat.png
```

Re-record when a frame shows the wrong state or the frame cuts off what the line names; change the shot and run `polish.py` again when only the camera is wrong. Never edit the video to hide a failed step. Then run the checks in `add-voiceover`.

## Share

Attach the MP4 to the pull request (GitHub takes videos up to 10 MB on free plans) or the ticket.

**With Jam:** when `command -v jam` (`where jam` on Windows) finds the CLI, ask the user once whether to upload the video; it becomes one link to comment on, with a synced transcript of the narration and frames the next agent can read. Upload only on a yes, with `jam create jam '{"kind": "video", "url": "<url>", "videoPath": "voice/voiced.mp4", "screenDimensions": {"width": 2560, "height": 1440}}'`. Exit code 3 means signed out: run `jam auth login`, then retry.
