# Writing the deck

A deck is one HTML page at 1920x1080. `runtime.js` computes every element's state from the time, so the renderer can capture any frame. Never use CSS transitions, CSS animations or timers: they do not render.

## Skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="theme.css">
<!-- <link rel="stylesheet" href="brand.css">  another brand: redefine the :root tokens here -->
<style>/* deck-only layout: diagram positions */</style>
</head>
<body>
<div class="frame">
  <header class="brandbar"><img src="logo.png" alt=""><b>owner/repo #123</b><span>PR title</span><span class="sp"></span><span>abc1234</span></header>

  <section class="scene" data-scene="why" data-title="Why">
    <div class="kicker" data-in="@0">Why this change</div>
    <div class="title" data-in="@0.15">A headline that states the <em>point</em></div>
    ...
  </section>
</div>
<script src="timeline.js"></script>
<script src="pele.js"></script>
<script src="runtime.js"></script>
</body>
</html>
```

The content area is x 140 to 1780 and y 130 to 960. The chapter rail sits below 960. Keep titles to one line, about 40 characters.

## Timing attributes

| Attribute | Meaning |
| --- | --- |
| `data-in="cue"` | Enter when the line with that `cue` starts. `cue+0.6` or `cue-0.3` shifts it. `@1.2` is seconds after the scene starts. Default `@0.2`. |
| `data-anim` | `rise` (default), `fade`, `pop`, `left`, `wipe`, `draw` (SVG paths and lines stroke in; arrowheads land at the end), `type` (types the text, for terminal lines), `count` (counts the first number up to `data-count`), `none` (no entrance, for elements already on screen). |
| `data-dur="0.6"` | Entrance length in seconds. `type` defaults to the text's length. |
| `data-out="cue"` | Fades out when that line starts. |
| `data-focus="a b"` | Lit while line `a` or `b` is spoken. While a line lights something, every other `data-focus` element in the scene dims. After the scene's last line the focus releases. |
| `data-camera="cue:scale,x,y; cue2:1,0,0"` | On a `.stage`: eases the view to that zoom and offset when the line starts. Return to `1,0,0` before the scene ends. |

Time the entrance a beat after the word that names the thing: `data-in="cue+1.2"` when the noun comes mid-line. Check with `render.mjs --at <seconds>`.

## Color keeps one meaning

The theme has three states, and color means nothing else:

| State | Looks | Use for |
| --- | --- | --- |
| default | ink on white, hairline border | what exists and stays as it is |
| `.new` | solid lime | what this change adds or chose |
| `.risk` | accent border or text | what goes wrong, or a risk left over |
| `.mute` (`.ghost` on boxes) | grey, dashed | the old way, the road not taken |

A title's `<em>` gets a lilac marker: emphasis on the key words, not a fourth meaning. Never set a color, background or fill in the deck; `--stills` reports any inline color. Keep the accent rare: the problem in the why scene, the cost of each decision, the gap in the proof. Focus uses the same lilac: what the voice is on gets a flush lilac halo (a card, a box, a node) or a lilac fill (a decision column) and full ink, and the rest of the scene dims. It never competes with the accent.

## Components (theme.css)

- Type: `.kicker` (chapter eyebrow), `.title` (`.xl` for a hero; `em` for the one phrase that is the problem), `.label` (small caps heading inside a card), `.lede`, `.small`, `code` (only for things you would type or grep).
- Layout: `.row`, `.col`, `.grow`, `.mt`, `.abs` (position with inline `left`/`top`).
- `.card` with `h3` and `p`, in any state. `.chip` and `.step` (a box in a flow, with `.arrow` between) take the same states. `.num` is a numbered square. `ul.checks` lists verified facts with a check mark.
- `.adr`: a decision as one card with a column per part: `div.chose`, `div.rejected`, `div.cost`, `div.checked` (a `ul` of findings, each with its `path:line` in a `code`). Each opens with a `.label`. Put `data-focus` on the column and `data-in` on a `div` around its body, so the four labels show from the start and each body arrives on the line that says it.
- `.term`: a terminal; children `div.cmd` (prompt), `.err`, `.ok`, `.dim`. Use `data-anim="type"` on `.cmd` lines.
- `.code`: a code card; `div.file` header, `div.ln` lines with `.add`, `.del`, `.hl`; spans `.c`, `.k`, `.s`.
- Diagrams, inside `<div class="stage">`: `.box` (process or module; `.new`, `.risk`, `.ghost`), `.zone` with a `span` label, `.boundary` (a dashed divider; inline `left`, `top`, `height`), `.packet` (a JSON message; spans `.k`, `.s`, `.n`, `.err`), `.tag` (a label; `.new`, `.risk`, `.mute`), `.cross` (where something is lost). Wires go in `<svg class="wires" viewBox="0 0 1640 640" width="1640" height="640">` as `path.wire` (`.new`, `.risk`, `.mute`) with `marker-end="url(#arrow)"`.
- A `.box` is a node card. In a system diagram give each one a kind and an icon: `<span class="ico"><svg viewBox="0 0 24 24">…</svg></span><div><div class="eb">Service worker</div><h4>Routing</h4><div class="sub">once, at start</div></div>`. The icon is a 24-grid outline icon pasted inline (Lucide, ISC, fits); keep only its `viewBox` and child elements, and the theme strokes it. The kind (`.eb`) says what sort of thing it is, so the title can stay a short name. One kind word per real thing: the same process gets the same kind in every scene.

## A decision scene

Title the scene with the decision in active voice. Above, the smallest picture that shows what the decision does, usually the shape diagram again. Below, the `.adr` card:

```html
<div class="adr">
  <div class="chose" data-in="chose" data-focus="chose"><span class="label">Chosen</span>Fail with exit 13 and the details. Stop there.</div>
  <div class="rejected" data-in="alt" data-focus="alt"><span class="label">Rejected</span>Fall back to screen capture on its own. The issue leaves that to the caller.</div>
  <div class="cost" data-in="cost" data-focus="cost"><span class="label">Cost</span>An unattended agent recovers by itself.</div>
  <div class="checked" data-in="check" data-focus="check"><span class="label">We checked</span><ul><li>No fallback exists in code<code>screencast.ts:279</code></li></ul></div>
</div>
```

Arrowheads need no `<defs>`: the runtime gives every wire with a `marker-end` a chevron in the wire's color and a dot where it leaves its source.

Label a wire with a pill on it, not text floating near it: `<div class="tag new" data-on="wireId">on</div>` sits on the middle of the wire's longest straight run. Keep pill text to a word or a short value, so the pill fits the gap between two boxes. Leave columns about 170 px apart where wires carry pills.

## A diagram from Mermaid

Draw any box-and-wire picture (a system, a flow, states) as Mermaid in a `<pre class="mermaid">` inside the `.stage`; Pele (`pele.js`) lays it out and the runtime animates it. Write cues as Mermaid comments, so the same source still renders on GitHub:

```html
<pre class="mermaid" id="rt">
flowchart LR
  R["`**Routing**
  once, at start`"] -- on --> T["`**Text path**
  new renderer`"]
  T -- mode --> O["`**Offscreen**
  older build`"]
%% R: in=chose focus=chose
%% T: in=chose+0.8 focus="chose old" class=new
%% O: in=old out=api focus=old class=risk
%% R->T: in=chose+0.8 class=new
%% T->O: in=old out=api
</pre>
<div class="token" data-travel="rt-T-O" data-in="old+0.2">mode: pieces</div>
```

- A node's first line in `**bold**` is its name, the next line its `.sub`.
- `%% <node>:` and `%% <from>-><to>:` take `in`, `out`, `focus`, `anim`, `dur` and `class` (nodes `new`, `risk`, `ghost`; edges `new`, `risk`, `mute`). An edge draws itself and its label pill fades in after it.
- An edge's path id is `<pre id>-<from>-<to>`, for a token's `data-travel`.
- Mermaid's own `:::class`, `classDef` and `style` set colors; leave them out and use `class=` in a cue comment, so color keeps its meaning.
- Prefer it to placing `.box`es by hand. Place by hand only what Mermaid cannot say: a box that changes text mid-scene, a note pinned to a node.

## A sequence diagram from text

For anything that is messages between parts (processes, services, workers), write a `<pre class="lanes">` instead of placing boxes. It reads a small `node:` / `arrow:` grammar, so a sequence diagram already written in a PR description usually pastes in and only needs cues:

```html
<div class="stage mt" style="height:640px">
<pre class="lanes" id="after" style="position:absolute;inset:0;height:640px" data-in="flag" data-anim="fade">
node: Recorder .new
node: Worker
node: Transcribe API .new
node: Answer API
arrow: Worker -> Recorder "START" @start .new
arrow: Recorder -> Worker "AUDIO PIECE" @piece .new
arrow: Worker -> Transcribe API "AUDIO" @tx .new
arrow: Transcribe API -> Worker "TEXT" @tx+0.9 .new
gap
arrow: Worker -> Answer API "TEXT + VOICE" @answer .new
frame: loop "[each 5 s piece]" 2-4 @piece+0.6
token: "5 s audio" 3 @tx+0.1
</pre>
</div>
```

- `node:` adds a lane, left to right. `arrow: A -> B "LABEL"` adds a row, top to bottom; `A -> A` loops back. `gap` leaves a row empty. `frame: loop "[label]" 2-4` boxes arrows 2 to 4. `token: "label" 3` sends a chip along arrow 3.
- Each statement takes `@cue` (enter, with offsets like `@tx+0.9`), `~cue` (leave) and classes (`.new`, `.risk`, `.mute`). A trailing `| path:line` is ignored. Labels cannot contain `"`.
- Before and after on one stage: two `pre.lanes` in the same place, the first with `data-out="flag"`, the second with `data-in="flag" data-anim="fade"`. Lanes in the same position cross-fade, so a renamed or replaced part reads as a change, not a new picture.
- Keep it to 4 or 5 lanes and about 8 rows; `--stills` says when the rows need more height.

## Time, pages and tables

- **Time** goes on a track. `.track[data-span="0 14"]` holds `.tk-row` rows (a `b` label on the left), and any child with `data-t="2"` sits at 2 s; add `data-t2="7"` for a span. Inside it, `.tk-dot` (`.new`, `.risk`, `.mute`), `.tk-note`, `.tk-mark` (above the axis), `.tk-tick` (below) and `.tk-span` (a window or a bar). A `.playhead` with `data-sweep="cueA:0; cueB:7.5"` moves to that time as each cue starts, at an even speed, so the voice and the clock agree. Use it for windows, timeouts, retries and latency races.
- **A page** is `.browser` (absolutely placed) with `.bar` (the URL) and `.page` holding `h5`, `.field` (label text plus an `i` for the value), `.btn`, `.txt` and cards. Use it for the worked example's starting point; say on screen that the page is an illustration.
- **Rows that land** are a `table.rows` with a `caption`; give each `tr` a `data-in` so rows arrive as the voice names them. `tr.new` marks what the change adds, and `tr.mute` what it does not cover.

## Motion that carries meaning

- `data-travel="<path id>"` on a `.token` (inside the same positioned parent as the SVG): the token rides the path from `data-in` for `data-dur` seconds and parks at its end. Lanes arrows have ids `<lanes id>-a<n>`. Use it for the one real datum the video follows: a click, a field's text, a request.
- `data-link="#from -> #to"` on an SVG `path` instead of `d`: the runtime draws the wire from the right edge of one element to the left edge of the other, wherever layout put them. Prefer it over hand-written coordinates for anything that points at text (a field, a button, a log line): a caption added later moves the text, and a hand-drawn wire then points at the wrong line.
- `data-to="cue:left,top[,width]; cue2:…"` on an absolutely placed element: it moves there on the cue. Use it so a part changes place or size instead of being redrawn.
- `data-strike="cue"`: a line sweeps through the element; for what is dropped or rejected.
- `class="wire stream"`: once drawn, the dashes keep flowing; for a continuous stream (a capture, a live socket), not for a one-off call.

## A diagram that builds up

```html
<div class="stage mt">
  <svg class="wires" viewBox="0 0 1640 640" width="1640" height="640">
    <path id="spawn" class="wire" d="M400 200 H612" marker-end="url(#arrow)" data-anim="draw" data-in="rec"/>
  </svg>
  <div class="box" style="left:0;top:150px;width:400px" data-in="cli" data-focus="cli"><h4>CLI</h4><div class="sub">what the agent runs</div></div>
  <div class="box" style="left:620px;top:150px;width:400px" data-in="rec" data-focus="rec"><h4>recorder</h4><div class="sub">background process</div></div>
  <div class="tag" data-on="spawn" data-anim="fade" data-in="rec+0.6">spawns</div>
</div>
```

In the next scene, copy the same boxes and wires with `data-anim="none"` and give only the new parts an entrance.

## Checklist before the full render

- `render.mjs --stills` prints no problems.
- Every still reads at phone size: nothing overlaps, no text is cut, one highlighted phrase per title.
- Every scene with three or more parts uses `data-focus`, so the eye follows the voice.
- Motion was checked mid-flight, not only in the end-of-scene stills: `--at` frames during each token's ride and each move.
- Every colored element is `.new`, `.risk` or `.mute` for the reason the table above gives.
- Illustrative content (sample logs, example values) says so on screen.
