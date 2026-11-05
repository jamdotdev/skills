---
name: explain-pr-as-video
description: "Make a narrated video that walks a reviewer through the decisions in a pull request: the problem, the shape of the system, each decision with its rejected alternatives and its costs, the facts checked for it, what is proven, and the calls only the reviewer can make. Built as an animated HTML deck, voiced line by line, rendered to MP4 with a browser preview. Use when the user asks for a PR video, a review video, a video walkthrough or explainer of a pull request, a stack of PRs, a branch or a diff, or wants to help reviewers understand a big change."
---

# Explain a PR as a video

The video teaches; it does not sell. Code review is mostly judging decisions: was this the right choice, and is its trade-off acceptable? So the video is built around the PR's decisions, each told like an architecture decision record: what forced it, what was chosen, what was rejected and why, and what it costs. Everything with a factual answer is checked before the reviewer sees it. What is left for the reviewer is judgment, and the video ends by asking for it: one decision at a time, approve or push back.

Needs Node 22+, `ffmpeg`, Chrome or Chromium (`CHROME_PATH` if it is not found), the Inter and JetBrains Mono fonts (without them the fallbacks wrap text differently, so check the stills on the machine that renders), and the `add-voiceover` skill installed next to this one for the voice. Scripts are in this skill's folder: `scripts/render.mjs`, `assets/runtime.js`, `assets/theme.css`, `assets/pele.js` (Pele, MIT, draws Mermaid; license in `assets/pele.LICENSE`), `assets/logo.png`.

## 1. Learn the change before writing a word

Read the PR body, the linked issue, the whole diff and the CI state. Note with `path:line` for each fact:

- **The one thing**: what changed and why it matters, in one line, and the one sentence the reviewer should remember after the video, in their words. Everything else serves it.
- **The symptom**: what went wrong for a person or a program, with any real number from the PR or issue. Never invent a figure.
- **The shape**: the 3 to 5 parts the change runs through (processes, services, modules) and the one boundary or flow it changes.
- **The decisions**: 2 to 4 choices the PR makes that a reasonable engineer could have made differently. For each: the context that forced it, the decision in active voice, the alternatives rejected and why (from the PR, the issue, code comments; say so when no reason is given), and the consequences, the downside included. A change with no real alternative is not a decision; it gets a line, not a scene.
- **Proof**: what was verified and how, CI per platform as of today, and what the PR says is not verified.
- **Doubts about each decision, settled.** Every doubt with a factual answer is yours to settle: does anything depend on the old behavior, what can this value contain, does the alert still fire. Each answer is a finding with its `path:line`, attached to the decision it informs. Look hardest for consequences the PR does not mention.
- **The reviewer's calls**: for each decision, the trade-off in one sentence the reviewer can approve or push back on, with the findings that inform it. Never ask the reviewer something you could have checked.

- **One name per thing.** Pick one word for each part and concept (`recorder`, not "daemon" in one scene and "recorder" in the next) and use it in the voice, on screen and in the text map.

- **A worked example.** One real datum (a click, a field, a request) that you can follow through every part of the change, with the real field and event names from the diff. It becomes the spine of the video.

Do not confuse proposed, merged and released. Do not present tests or refactors as features.

### A stack of PRs

Make one video for the whole stack, not one per PR. Read every PR body, the ADRs they link and the head of the stack; a body often carries its own diagram blocks and review map, so reuse their names and order. The home stage is the system diagram with a chip per PR on the part it touches. Then follow the worked example through the PRs in order, give the 2 or 3 decisions that cut across the stack a scene each, and end with the calls and the reading and deploy order. Aim for 4 to 5 minutes for a large stack.

## 2. Write the script for the ear

**Who is listening:** an engineer on the team who knows the codebase but not this change. Talk to them like a teammate walking them through it at their desk: casual, direct, no lecture. Name modules, files and commands without defining them; explain only what this PR adds or what a teammate could not know (a monitor, an incident number, a decision made in the issue). Recap the shape in a few quick lines, as a refresher, not a tutorial.

Make a work folder outside the repo. Write `lines.json`, one spoken line per entry, grouped by scene:

```json
[
  {"scene": "why",   "cue": "err",   "say": "An agent starts a recording, and Chrome sends no picture."},
  {"scene": "shape", "cue": "ready", "say": "It answers the CLI with one line of JSON. The ready line."},
  {"scene": "shape", "cue": "lost",  "say": "Before this change, whatever the recorder knew stopped here.", "pause": 0.4}
]
```

- `scene` groups lines; keep each scene's lines together. `cue` names the line so the deck can react to it. `pause` adds seconds of silence before a line.
- Default arc, 6 to 8 scenes: **why** (the symptom) → **shape** (build the system diagram one part per line) → one scene per **decision**: what it does on the diagram, then chosen, rejected and why, the cost, and what you checked → a short scene for changes that are not decisions → **proof** (verified, CI per platform, not verified) → **your call** (one approve-or-push-back line per decision, then the reading order). Fold scenes for a small PR.
- **The hook**: the first line shows the failure itself, or the moment that needs the change, never the repo name or "this PR". Frame 0 is the thumbnail, so the first scene has something on screen at time zero.
- Casual spoken English: contractions ("it's", "doesn't"), short sentences mixed with longer ones, natural openers ("Okay, so", "Here's the catch", "So, your call"). Present tense, one idea per line, 6 to 20 words. Say numbers and symbols as spoken: "exit code thirteen", "record dot ts".
- No pitch: no "robust", "seamless", "great work", no closing thanks. State limits as plainly as wins.
- The screen never repeats the spoken sentence word for word. The voice explains; the screen shows the picture, the name or the number it is about.
- Budget about 2.7 words per second of video. Aim for 90 to 180 seconds; a 700-line PR fits in about 450 words. Count with `jq -r '.[].say' lines.json | wc -w`.

Voice it once to get each line's length (the add-voiceover skill picks the voice; its default order is the team's command, ElevenLabs, then Kokoro):

```bash
python3 <skill-dir>/../add-voiceover/scripts/voiceover.py lines.json voiceover
```

To draft without spending ElevenLabs credits, run it with `env -u ELEVENLABS_API_KEY` so the free local Kokoro voice is used. Voice the final cut with the user's voice, or with a conversational ElevenLabs voice so it sounds like a person talking, not a voiceover.

## 3. Build the deck

Copy `assets/runtime.js`, `assets/theme.css`, `assets/pele.js` and `assets/logo.png` into the work folder and write `deck.html`. Read `references/deck.md` before the first scene: it has the page skeleton, every component, and the animation attributes. The essentials:

- One `<section class="scene" data-scene="<id>" data-title="Chapter">` per scene id. The title feeds the chapter rail at the bottom.
- `data-in="cue"` makes an element enter when that line starts (`cue+0.6` for later, `@0.2` for seconds into the scene). `data-anim` picks the entrance: `rise`, `fade`, `pop`, `left`, `wipe`, `draw` for SVG wires, `type` for terminal text, `count` for numbers.
- `data-focus="cueA cueB"` lights an element while one of those lines is spoken and dims the scene's other `data-focus` elements. At the end of each scene the focus lets go and the whole picture holds before the cut. This is the pointer that follows the voice: use it on every scene with more than two parts.
- **Draw with the primitives, not by hand.** Messages between parts are a `pre.lanes` sequence diagram, and a sequence diagram from a PR body usually pastes straight in. Time (windows, latency, retries) goes on a `.track` with a playhead. A page is a `.browser`, and rows landing in a table are `table.rows`. The worked example rides the wires as a `.token`. `references/deck.md` has each one.
- **Pick the shape of each line, then its picture.** Most lines are one of a few shapes: a flow through the system, before and after, one choice out of several, a number that lands, a wrong idea struck through, steps in order, a real log or screenshot with the detail circled. Similar lines get different pictures; each line gets the one that shows it.
- **One home stage.** The shape diagram is home. Each decision scene returns to it and moves into the part the decision changes, so the viewer never loses where they are. Keep the decision card (`.adr`) the same in every decision scene: it is the reviewer's form, and the same form makes decisions easy to compare.
- Build diagrams up. Draw the system on the shape scene one part per line, then copy that diagram into each change scene and add only what the change adds. Each scene redraws the last and adds one idea.
- Show code only as evidence for a spoken claim: 2 to 4 short hunks in the whole video, each at most 4 lines, never a whole file.
- Avoid what looks generated: bullet slides, three cards in a row, side-by-side panels standing in for a picture, a whole diagram dropped on at once, every scene entering the same way, titles that keep moving after they land.
- Label anything made up for illustration, such as a sample log, as an illustration.

**Branding.** `theme.css` and `logo.png` carry the default brand. For another one, add a stylesheet after `theme.css` that sets the `:root` tokens (colors, `--font`, `--mono`) and replace `logo.png`.

## 4. Check the frames, then render

```bash
node <skill-dir>/scripts/render.mjs deck.html voiceover/lines.json --stills
```

This writes `timeline.js` and `timed.json`, prints any deck problems (unknown cues, text that overflows, content in the rail's area), and writes `stills/NN-<scene>.png`, each scene once it has fully built. `--at <seconds>` renders one frame mid-scene, to check a camera move or a focus state. The automatic check skips diagrams inside a camera stage, so read every still as an image:

1. Describe each still in one sentence as a stranger would, naming every object. Anything you would have to explain ("the green line is the new reason") is a problem.
2. Cover the words: do the stills alone, in order, tell the story?
3. Write each problem as `scene · where · problem → change`, ranked: **P0** breaks the read (wrong, clipped, unreadable, overlapping), **P1** weakens it (crowding, two focal points, a scene that looks like the last), **P2** polish. Fix every P0, then the P1s worth it, and re-run.

Stills only show where each scene ends. Check the motion too, with 12 frames per scene on one sheet:

```bash
ffmpeg -v error -ss <scene start> -t <scene length> -i voiceover/voiced.mp4 -vf "fps=12/<scene length>,scale=640:-1,tile=4x3" -frames:v 1 motion-<scene>.png
```

Look for a token that parks on a label, a dimmed panel that turns into a grey block, and a before-diagram that vanishes too fast to read.

When you can start a sub-agent, give it `lines.json`, the stills, the motion sheets and your fact notes, and ask for P0 and P1 lines in that format, with a score. Ask two different models if you can: in practice they catch different mistakes, one the overstated claims, the other the facts slightly off. Fix what holds up, then ask again.

Then render and mix the voice:

```bash
node <skill-dir>/scripts/render.mjs deck.html voiceover/lines.json
python3 <skill-dir>/../add-voiceover/scripts/voiceover.py timed.json voiceover --video video.mp4
```

The render takes about half the video's length on a laptop. The second voiceover pass reuses every voiced line from the first, so it only mixes. Output: `voiceover/voiced.mp4`, plus `voiceover/voiceover.vtt` for players that show subtitles.

Check sync: take a frame 1.5 seconds after a few lines' `at` in `voiceover/lines.json` and confirm it shows what the line names:

```bash
ffmpeg -v error -ss <at+1.5> -i voiceover/voiced.mp4 -frames:v 1 check.png
```

Opening `deck.html` in a browser plays the deck with the narration and a scrubber: space plays, arrows jump 5 seconds.

## A/B test the whole video or a scene

Copy the work folder once per variant (`a/`, `b/`) and change one thing in each copy: a scene's lines or section, or the voice (`KOKORO_VOICE`, `ELEVENLABS_VOICE_ID`). Voice, render and mix every copy as in step 4, then:

```bash
node <skill-dir>/scripts/ab.mjs compare a b
```

Give the user `compare.html`. It plays any scene of any variant, the number keys switch variant at the same point in the scene, and blind mode hides which variant is which. Once they pick a variant per scene, or one for the whole video, they copy `picks.json` from the page. A scene marked "cut" is dropped. Then:

```bash
node <skill-dir>/scripts/ab.mjs merge picks.json merged
```

`merged/` holds the picked scenes' lines and sections on top of the first variant's deck, plus every voiced line, so voicing it again only voices what changed. Run step 4 there.

## 5. Share it with a text map

The video never carries anything the reviewer must act on that the text lacks. Write a short description to go with it: one line per scene with its time, the findings with their evidence, the reading order with `path:line` links pinned to the head commit, and the open calls. Give the user the MP4 path and that text, and tell them in two lines what you only looked at rather than checked (the voice is measured for sync, not heard) and the weakest scene. Do not post to the PR unless the user asks.

With Jam: upload the MP4 with that text as a shareable recording, as `references/share.md` shows, and return its link.

## When it goes wrong

- **`Chrome not found`**: set `CHROME_PATH` to a Chrome or Chromium binary.
- **A line warns it starts late**: an earlier line is too long for its scene; shorten it.
- **An element never appears**: its cue name has a typo; the `--stills` run prints `cue "x" is not a line in scene y`.
- **Motion that works in the browser is frozen in the video**: it uses a CSS transition or animation. Every motion must come from the data attributes, which the renderer drives frame by frame.
