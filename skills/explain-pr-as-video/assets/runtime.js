// Deck runtime: turns window.TIMELINE (written by render.mjs) into a pure function of time.
// Every visual state is computed from t in seek(t), so the renderer can capture any frame in any order.
// CSS transitions and animations never render; animate with the data attributes below instead.
//
//   <section class="scene" data-scene="id" data-title="Chapter name">   one scene per voiced scene id
//   data-in="cue" | "cue+0.4" | "@1.2"   when the element enters: a cue's first word, plus an offset,
//                                         or seconds after the scene starts (default "@0.2")
//   data-anim="rise|fade|pop|left|wipe|draw|type|count|none"   how it enters (default rise)
//   data-dur="0.6"                        enter length in seconds
//   data-count="20"                       target number for data-anim="count"
//   data-out="cue"                        fades out when that cue starts
//   data-focus="cueA cueB"                lit while one of those cues is spoken; while any element in the
//                                         scene is lit, the scene's other data-focus elements dim
//   data-camera="cue:scale,x,y; cue2:..." on a scene's .stage: eases the camera there when the cue starts
//   data-to="cue:left,top[,width]; ..."   moves an absolutely placed element to a new place on a cue
//   data-travel="pathId"                  a .token rides that SVG path from data-in for data-dur seconds,
//                                         then parks at its end (path and token share a positioned parent)
//   data-strike="cue"                     strikes the element through when the cue starts
//   data-link="#from -> #to"              on an SVG path: drawn from the right edge of #from to the left edge
//                                         of #to (or the reverse when #to is on the left), wherever layout put them
//   class="wire stream"                   once drawn, dashes keep flowing along the wire
//   marker-end="url(#arrow)" on a wire    any marker-end becomes the chevron in the wire's color, with a source dot
//   data-on="wireId" on a .tag            the tag becomes a pill centered on that wire
//   <pre class="mermaid">                 any Mermaid diagram, drawn by Pele; see layoutMermaid below
//   <pre class="lanes">                   a sequence diagram laid out from text; see layoutLanes below
//   .track data-span="0 24"               a time axis: children with data-t="2" (and data-t2="7" for a span)
//                                         are placed along it; data-sweep="cue:0; cue2:12" on a child moves it
//                                         along the axis between those cues, at an even speed
(() => {
  const T = window.TIMELINE;
  const RENDER = new URLSearchParams(location.search).has("render");
  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const out3 = (p) => 1 - (1 - p) ** 3;
  const inOut = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
  const back = (p) => 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2;
  const problems = [];
  const sceneEls = [...document.querySelectorAll(".scene")];

  // <pre class="lanes" style="height:560px"> holds one statement per line, the grammar PR bodies use for
  // diagrams, plus cues:
  //   node: Service worker @cue                       a lane, left to right in order
  //   arrow: Offscreen -> Service worker "VOICE PIECE" @cue ~outcue .new   one row each, top to bottom
  //   frame: loop "[each 5 s piece]" 2-4 @cue        a box around arrows 2 to 4 (1-based)
  //   token: "aria-label" 3 @cue                      a chip that rides arrow 3 when the cue starts
  //   gap @cue                                         an empty row
  // Anything after " | " (a path:line) is ignored. Arrows get ids <pre id>-a<n> for data-travel.
  const esc = (x) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  function layoutLanes(pre) {
    const id = pre.id || `lanes${Math.random().toString(36).slice(2, 7)}`;
    const W = pre.clientWidth || 1640, H = pre.clientHeight || 600;
    const nodes = [], rows = [], frames = [], tokens = [];
    for (let line of pre.textContent.split("\n")) {
      line = line.replace(/\s+\|\s+\S+$/, "").trim();
      const at = line.match(/\s@([\w+.@-]+)/)?.[1], out = line.match(/\s~([\w+.-]+)/)?.[1];
      const cls = [...line.matchAll(/\s\.([\w-]+)/g)].map((m) => m[1]).join(" ");
      const label = line.match(/"([^"]*)"/)?.[1] ?? ""; // labels cannot contain double quotes; use ' instead
      let m;
      if ((m = line.match(/^node:\s*(.+?)(\s+[@~.]|$)/))) nodes.push({ name: m[1].trim(), at, cls });
      else if ((m = line.match(/^arrow:\s*(.+?)\s*->\s*(.+?)(\s+["@~.]|$)/))) rows.push({ from: m[1].trim(), to: m[2].trim(), label, at, out, cls });
      else if (/^gap\b/.test(line)) rows.push({ gap: true });
      else if ((m = line.match(/^frame:\s*(\w+)\s*"[^"]*"\s*(\d+)-(\d+)/))) frames.push({ kind: m[1], label, a: +m[2], b: +m[3], at, out });
      else if ((m = line.match(/^token:\s*"[^"]*"\s*(\d+)/))) tokens.push({ label, n: +m[1], at, cls });
    }
    const x = (name) => {
      const i = nodes.findIndex((n) => n.name === name);
      if (i < 0) problems.push(`lanes ${id}: arrow names unknown node "${name}"`);
      return (W * (Math.max(i, 0) + 0.5)) / nodes.length;
    };
    const headH = 92, top = headH + 70, step = Math.min(96, (H - top - 30) / Math.max(rows.length - 0.5, 1));
    if (step < 62) problems.push(`lanes ${id}: ${rows.length} rows need about ${Math.ceil(top + 62 * rows.length)}px of height; give it more or split it`);
    const colW = Math.min(W / nodes.length - 36, 380);
    const attr = (o) => `${o.at ? ` data-in="${o.at}"` : ""}${o.out ? ` data-out="${o.out}"` : ""}`;
    let svg = "", html = "", under = "";
    nodes.forEach((n, i) => {
      const cx = (W * (i + 0.5)) / nodes.length;
      html += `<div class="box lane-head ${n.cls}" style="left:${cx - colW / 2}px;top:0;width:${colW}px"${attr(n)} data-anim="${n.at ? "rise" : "none"}"><h4>${esc(n.name)}</h4></div>`;
      svg += `<path class="lifeline" d="M${cx} ${headH} V${H}"${attr(n)} data-anim="${n.at ? "draw" : "none"}"/>`;
    });
    const n0 = (k) => rows.slice(0, k).length;
    rows.forEach((r, k) => {
      if (r.gap) return;
      const y = top + k * step, x1 = x(r.from), x2 = x(r.to), aid = `${id}-a${k + 1}`;
      const d = x1 === x2 ? `M${x1} ${y - 22} h64 v34 h-56` : `M${x1 + Math.sign(x2 - x1) * 6} ${y} H${x2 - Math.sign(x2 - x1) * 10}`;
      svg += `<path id="${aid}" class="wire ${r.cls}" d="${d}" marker-end="url(#${id}-ah${/risk/.test(r.cls) ? "r" : ""})" data-anim="draw" data-dur="0.6"${attr(r)}/>`;
      const lx = x1 === x2 ? x1 + 84 : (x1 + x2) / 2;
      html += `<div class="tag lane-label ${r.cls}" style="left:${lx}px;top:${y - (x1 === x2 ? 20 : 44)}px;${x1 === x2 ? "" : "transform:translateX(-50%)"}" data-anim="fade" data-in="${r.at ? `${r.at}+0.3` : "@0.2"}"${r.out ? ` data-out="${r.out}"` : ""}>${esc(r.label)}</div>`;
    });
    for (const f of frames) {
      const y1 = top + (f.a - 1) * step - step * 0.55, y2 = top + (f.b - 1) * step + step * 0.45;
      under += `<div class="zone lane-frame" style="left:12px;top:${y1}px;width:${W - 24}px;height:${y2 - y1}px" data-anim="fade"${attr(f)}><span>${esc(f.kind)} ${esc(f.label)}</span></div>`;
    }
    for (const tk of tokens) {
      html += `<div class="token ${tk.cls}" data-travel="${id}-a${tk.n}" data-dur="1.1"${attr(tk)}>${esc(tk.label)}</div>`;
    }
    const div = document.createElement("div");
    div.className = `lanes ${pre.className.replace("lanes", "")}`.trim();
    div.id = id;
    div.style.cssText = pre.style.cssText;
    for (const k of ["in", "out", "focus", "anim"]) if (pre.dataset[k]) div.dataset[k] = pre.dataset[k];
    div.innerHTML = `<svg class="wires" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>
      <marker id="${id}-ah" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker>
      <marker id="${id}-ahr" class="risk" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker>
      </defs>${svg}</svg>${html}`;
    div.insertAdjacentHTML("afterbegin", under); // frames sit under the wires
    pre.replaceWith(div);
  }
  // <pre class="mermaid" id="rt"> is a Mermaid diagram, drawn by Pele (pele.js, loaded before this file).
  // Cues ride along as Mermaid comments, so the source still renders anywhere Mermaid does:
  //   %% R: in=chose focus=chose class=new          a node, by its Mermaid id (class: new, risk, ghost)
  //   %% R->T: in=chose+0.8 class=new out=api       an edge (class: new, risk, mute); its path gets the id
  //                                                 "rt-R-T", for a token's data-travel
  function layoutMermaid(pre) {
    if (!window.pele) return problems.push("a pre.mermaid needs <script src=\"pele.js\"> before runtime.js");
    const css = getComputedStyle(document.documentElement);
    // Right-angled wires with rounded corners, and names that stay on one line, unless the diagram says otherwise.
    let src = pre.textContent;
    const defaults = ['"curve": "step"', '"wrappingWidth": 420'].filter((d) => !src.includes(d.split(":")[0])).join(", ");
    if (defaults)
      src = /%%\{init:[^\n]*"flowchart":\s*\{/.test(src) ? src.replace(/("flowchart":\s*\{)/, `$1${defaults}, `) : `%%{init: {"flowchart": {${defaults}}}}%%\n${src}`;
    let el;
    try {
      // Render once, then again at the font size that fills the stage, so text stays crisp and wires stay
      // in pixels (a token's data-travel reads path coordinates as pixels).
      const box = pre.parentElement, W = box.clientWidth, H = box.clientHeight - 60;
      const draw = (fontSize) => pele.render(src, { fontSize, fontFamily: css.getPropertyValue("--font"), fontFamilyMono: css.getPropertyValue("--mono"), padding: 8 });
      let out = draw(26);
      const k = Math.min(W / out.width, H / out.height);
      if (k > 1.05 || k < 1) out = draw(Math.max(16, Math.min(34, Math.floor(26 * k))));
      const host = document.createElement("div");
      host.className = "pele-host";
      host.innerHTML = out.svg;
      el = host.firstElementChild;
      pre.replaceWith(host);
    } catch (e) {
      return problems.push(`pre.mermaid#${pre.id}: ${e.message}`);
    }
    // Colors come from the theme's --pele-* tokens alone: drop Pele's own fallbacks and inline color.
    el.setAttribute("style", el.getAttribute("style").replace(/,\s*#[0-9a-f]{3,8}\)/gi, ")"));
    el.style.removeProperty("color");
    // Pele's arrowheads go: the wires get the deck's own chevrons and source dots below.
    // Each wire is extended to where Pele's arrowhead tip was, so the chevron touches the node.
    for (const m of el.querySelectorAll(".pele-marker")) {
      const tip = m.getAttribute("d").match(/^M\s*([-\d.]+)[ ,]([-\d.]+)/), line = m.parentNode.querySelector("path:not(.pele-marker)");
      if (tip && line) line.setAttribute("d", `${line.getAttribute("d")} L${tip[1]},${tip[2]}`);
      m.remove();
    }
    for (const p of el.querySelectorAll(".pele-edge path")) (p.classList.add("wire"), p.setAttribute("marker-end", "url(#arrow)"));
    // Wires and their pills draw over the nodes, so a lit node's halo never hides an arrowhead.
    for (const layer of [".pele-edges", ".pele-edge-labels"]) {
      const g = el.querySelector(layer);
      if (g) el.append(g);
    }
    // Room around each label pill's text.
    for (const r of el.querySelectorAll(".pele-edge-label rect")) {
      const pad = 10, x = +r.getAttribute("x"), y = +r.getAttribute("y"), w = +r.getAttribute("width"), h = +r.getAttribute("height");
      r.setAttribute("x", x - pad); r.setAttribute("width", w + pad * 2); r.setAttribute("y", y - 3); r.setAttribute("height", h + 6);
    }
    const used = new Set(), svgNS = "http://www.w3.org/2000/svg";
    for (const m of src.matchAll(/^\s*%%\s*([\w-]+(?:->[\w-]+)?):\s*(.+)$/gm)) {
      const a = Object.fromEntries([...m[2].matchAll(/([\w-]+)=("[^"]*"|\S+)/g)].map(([, k, v]) => [k, v.replace(/^"|"$/g, "")]));
      const cls = a.class?.split(",") ?? [];
      let g, label;
      if (m[1].includes("->")) {
        const [from, to] = m[1].split("->");
        g = [...el.querySelectorAll(`.pele-edge[data-id^="L_${from}_${to}_"]`)].find((x) => !used.has(x));
        if (!g) {
          problems.push(`pre.mermaid#${pre.id}: no edge ${m[1]}`);
          continue;
        }
        used.add(g);
        const path = g.querySelector("path");
        path.id = `${pre.id}-${from}-${to}`;
        path.classList.add(...cls);
        g.dataset.anim = a.anim ?? "draw";
        label = el.querySelector(`.pele-edge-label[data-id="${g.dataset.id}"]`);
      } else {
        const node = el.querySelector(`.pele-node[data-id="${m[1]}"]`);
        if (!node) {
          problems.push(`pre.mermaid#${pre.id}: no node ${m[1]}`);
          continue;
        }
        node.classList.add(...cls);
        // A lilac halo behind the card for focus, and a wrapper the runtime can move without losing translate().
        const shape = node.querySelector("rect,polygon,path,circle,ellipse");
        if (shape) {
          const halo = shape.cloneNode();
          halo.setAttribute("class", "pele-focus");
          node.insertBefore(halo, shape);
        }
        g = document.createElementNS(svgNS, "g");
        node.replaceWith(g);
        g.append(node);
      }
      for (const k of ["in", "out", "focus", "anim", "dur"]) if (a[k]) g.dataset[k] = a[k];
      if (label) {
        label.classList.add(...cls);
        label.dataset.anim = "fade";
        if (a.in) label.dataset.in = `${a.in}+0.4`;
        if (a.out) label.dataset.out = a.out;
      }
    }
  }
  document.querySelectorAll("pre.mermaid").forEach(layoutMermaid);
  document.querySelectorAll("pre.lanes").forEach(layoutLanes);

  // Wires that follow their ends: computed once, from where layout actually put the two elements.
  for (const path of document.querySelectorAll("svg path[data-link]")) {
    const svg = path.ownerSVGElement, box = svg.getBoundingClientRect();
    const k = svg.viewBox.baseVal.width / box.width || 1;
    const [a, b] = path.dataset.link.split("->").map((sel) => document.querySelector(sel.trim()));
    if (!a || !b) {
      problems.push(`data-link "${path.dataset.link}" names an element that does not exist`);
      continue;
    }
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const right = rb.left >= ra.right - 1;
    const x1 = ((right ? ra.right : ra.left) - box.left) * k + (right ? 8 : -8), y1 = ((ra.top + ra.bottom) / 2 - box.top) * k;
    const x2 = ((right ? rb.left : rb.right) - box.left) * k + (right ? -10 : 10), y2 = ((rb.top + rb.bottom) / 2 - box.top) * k;
    const c = Math.max(40, Math.abs(x2 - x1) * 0.5) * (right ? 1 : -1);
    path.setAttribute("d", `M${x1} ${y1} C${x1 + c} ${y1} ${x2 - c} ${y2} ${x2} ${y2}`);
  }

  // One arrowhead per wire class, so a deck never draws its own: any wire with a marker-end gets the chevron
  // in its own color and a dot where it leaves its source.
  const kinds = { "": "--wire", new: "--new-line", risk: "--accent", mute: "--wire-mute" };
  const css = getComputedStyle(document.documentElement);
  document.body.insertAdjacentHTML("afterbegin", `<svg width="0" height="0" style="position:absolute"><defs>${Object.entries(kinds).map(([k, v]) => {
    const c = css.getPropertyValue(v).trim();
    return `<marker id="arrow${k && "-" + k}" viewBox="0 0 12 12" refX="10" refY="6" markerUnits="userSpaceOnUse" markerWidth="18" markerHeight="18" orient="auto-start-reverse"><path d="M3 2L10 6L3 10" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`
      + `<marker id="dot${k && "-" + k}" viewBox="0 0 12 12" refX="6" refY="6" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12"><circle cx="6" cy="6" r="4" fill="${css.getPropertyValue("--panel").trim()}" stroke="${c}" stroke-width="2"/></marker>`;
  }).join("")}</defs></svg>`);
  for (const path of document.querySelectorAll("svg path.wire[marker-end]")) {
    const k = ["new", "risk", "mute"].find((c) => path.classList.contains(c)) ?? (path.classList.contains("accent") ? "risk" : path.classList.contains("thin") ? "mute" : "");
    path.setAttribute("marker-end", `url(#arrow${k && "-" + k})`);
    path.setAttribute("marker-start", `url(#dot${k && "-" + k})`);
  }
  // A .tag with data-on="wireId" sits centered on the middle of that wire.
  for (const tag of document.querySelectorAll(".tag[data-on]")) {
    const path = document.getElementById(tag.dataset.on);
    if (!path) {
      problems.push(`data-on "${tag.dataset.on}" names no wire`);
      continue;
    }
    const svg = path.ownerSVGElement, k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width || 1;
    // the middle of the wire's longest straight run, or of the whole wire when it is all curve
    const len = path.getTotalLength(), pts = Array.from({ length: 121 }, (_, i) => path.getPointAtLength((len * i) / 120));
    let best = [0, 0], from = 0;
    for (let i = 1; i <= pts.length; i++) {
      const dir = (j) => (Math.abs(pts[j].x - pts[j - 1].x) < 0.5 ? "v" : Math.abs(pts[j].y - pts[j - 1].y) < 0.5 ? "h" : j);
      if (i === pts.length || i - 1 === from || dir(i) !== dir(i - 1)) {
        if (i - 1 - from > best[1] - best[0]) best = [from, i - 1];
        from = i - 1;
      }
    }
    const pt = best[1] - best[0] > 6 ? pts[Math.round((best[0] + best[1]) / 2)] : pts[60];
    const box = svg.getBoundingClientRect(), host = tag.offsetParent.getBoundingClientRect();
    tag.style.left = `${(box.left - host.left) / k + pt.x - tag.offsetWidth / 2}px`;
    tag.style.top = `${(box.top - host.top) / k + pt.y - tag.offsetHeight / 2}px`;
  }

  const tracks = [...document.querySelectorAll(".track[data-span]")].map((el) => {
    const [t0, t1] = el.dataset.span.split(/\s+/).map(Number);
    const pct = (t) => `${((t - t0) / (t1 - t0)) * 100}%`;
    for (const c of el.querySelectorAll("[data-t]")) {
      c.style.left = pct(Number(c.dataset.t));
      if (c.dataset.t2) c.style.width = `calc(${pct(Number(c.dataset.t2))} - ${pct(Number(c.dataset.t))})`;
    }
    return { el, t0, t1, pct };
  });

  if (!T) {
    document.body.insertAdjacentHTML("beforeend", '<p class="no-timeline">No timeline.js yet. Run render.mjs once.</p>');
    window.deck = { ready: true, seek() {}, problems: () => ["no timeline.js next to the deck"] };
    return;
  }

  const scenes = T.scenes.map((s, index) => {
    const el = document.querySelector(`.scene[data-scene="${s.id}"]`);
    if (!el) problems.push(`timeline scene "${s.id}" has no <section class="scene" data-scene="${s.id}">`);
    const lines = T.lines.filter((l) => l.scene === s.id);
    return { ...s, index, el, lines };
  });
  for (const el of sceneEls) {
    if (!T.scenes.some((s) => s.id === el.dataset.scene)) problems.push(`scene "${el.dataset.scene}" has no voiced lines`);
  }

  // "cue", "cue+0.4", "@1.2" → absolute seconds
  const when = (scene, spec, fallback) => {
    if (!spec) return fallback;
    spec = spec.trim();
    if (/^@[\d.]+$/.test(spec)) return scene.start + Number(spec.slice(1));
    const m = spec.match(/^([\w-]+)((?:\s*[+-]\s*[\d.]+)*)$/);
    if (!m) return problems.push(`bad time "${spec}" in scene ${scene.id}`), fallback;
    const line = scene.lines.find((l) => l.cue === m[1]);
    if (!line) return problems.push(`cue "${m[1]}" is not a line in scene ${scene.id}`), fallback;
    return line.at + [...m[2].matchAll(/([+-])\s*([\d.]+)/g)].reduce((sum, [, sign, n]) => sum + (sign === "-" ? -n : +n), 0);
  };

  const items = [];
  for (const scene of scenes) {
    if (!scene.el) continue;
    for (const el of scene.el.querySelectorAll("[data-in],[data-anim],[data-focus],[data-out],[data-to],[data-travel],[data-strike],[data-sweep]")) {
      const anim = el.dataset.anim ?? "rise";
      const item = {
        el,
        scene,
        anim,
        at: when(scene, el.dataset.in, scene.start + 0.2),
        dur: Number(el.dataset.dur ?? (anim === "draw" ? 0.9 : 0.6)),
        out: el.dataset.out ? when(scene, el.dataset.out, Infinity) : Infinity,
        focus: el.dataset.focus?.split(/\s+/).filter(Boolean),
      };
      if (el.dataset.travel) {
        item.path = document.getElementById(el.dataset.travel);
        if (!item.path) problems.push(`scene ${scene.id}: data-travel names no path "${el.dataset.travel}"`);
        if (!el.dataset.dur) item.dur = 1.1;
        item.anim = "travel";
      }
      if (el.dataset.to) {
        item.moves = el.dataset.to.split(";").map((k) => k.trim()).filter(Boolean).map((k) => {
          const [cue, v] = k.split(":");
          const [left, top, width] = v.split(",").map(Number);
          return { at: when(scene, cue, scene.start), left, top, width };
        });
        item.home = { left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0, width: parseFloat(el.style.width) || undefined };
      }
      if (el.dataset.strike) item.strike = when(scene, el.dataset.strike, Infinity);
      if (el.dataset.sweep) {
        item.track = tracks.find((tr) => tr.el.contains(el));
        item.sweep = el.dataset.sweep.split(";").map((k) => k.trim()).filter(Boolean).map((k) => {
          const [cue, v] = k.split(":");
          return { at: when(scene, cue, scene.start), v: Number(v) };
        });
      }
      if (anim === "type") {
        item.text = el.textContent;
        if (!el.dataset.dur) item.dur = Math.min(2.4, Math.max(0.4, item.text.length * 0.03));
      }
      if (anim === "count") item.text = el.textContent;
      if (anim === "draw") {
        item.paths = el.matches("path,line,polyline,circle,rect") ? [el] : [...el.querySelectorAll("path,line,polyline")];
        for (const p of item.paths) {
          p.dataset.len = p.getTotalLength();
          p.style.strokeDasharray = p.dataset.len;
        }
      }
      for (const cue of item.focus ?? []) when(scene, cue, 0);
      items.push(item);
    }
    const stage = scene.el.querySelector("[data-camera]");
    if (stage) {
      scene.stage = stage;
      scene.camera = stage.dataset.camera
        .split(";")
        .map((k) => k.trim())
        .filter(Boolean)
        .map((k) => {
          const [cue, v] = k.split(":");
          const [s, x, y] = v.split(",").map(Number);
          return { at: when(scene, cue, scene.start), s, x, y };
        });
    }
  }

  // Cues that light something in their scene; while one is spoken, the scene's other data-focus elements dim.
  for (const s of scenes) s.lit = new Set(items.filter((i) => i.scene === s).flatMap((i) => i.focus ?? []));

  // Chapter rail: one segment per titled scene, the current one filled as it plays.
  const rail = document.createElement("nav");
  rail.className = "rail";
  rail.innerHTML = scenes
    .filter((s) => s.el?.dataset.title)
    .map((s) => `<div class="rail-seg" data-for="${s.id}"><i></i><span>${s.el.dataset.title}</span></div>`)
    .join("");
  document.querySelector(".frame")?.append(rail);
  const segs = [...rail.children].map((el) => ({ el, fill: el.firstChild, s: scenes.find((s) => s.id === el.dataset.for) }));

  function seek(t) {
    for (const s of scenes) {
      if (!s.el) continue;
      const v = clamp((t - s.start) / 0.45) * (s.index === scenes.length - 1 ? 1 : clamp((s.end - t) / 0.35));
      s.el.style.opacity = v;
      s.el.style.visibility = v > 0 ? "visible" : "hidden";
      s.el.style.transform = `scale(${1.012 - 0.012 * out3(clamp((t - s.start) / 0.6))})`;
      // The cue being spoken: the latest line started, a beat early so the eye arrives with the word.
      // The line being spoken, a beat early so the eye arrives with the word. After the scene's last
      // line the focus lets go, so the whole picture holds before the cut.
      const k = s.lines.findLastIndex((l) => t >= l.at - 0.12);
      const last = s.lines.at(-1);
      const released = k === s.lines.length - 1 && t > last.at + last.seconds + 0.2;
      s.cue = released ? undefined : s.lines[k]?.cue;
      s.prevCue = released ? last.cue : s.lines[k - 1]?.cue;
      s.ramp = k < 0 ? 0 : out3(clamp((t - (released ? last.at + last.seconds + 0.2 : s.lines[k].at - 0.12)) / 0.35));
      if (s.camera) {
        let cam = { s: 1, x: 0, y: 0 };
        for (const k of s.camera) {
          const p = inOut(clamp((t - k.at) / 0.9));
          cam = { s: cam.s + (k.s - cam.s) * p, x: cam.x + (k.x - cam.x) * p, y: cam.y + (k.y - cam.y) * p };
        }
        s.stage.style.transform = `translate(${-cam.x}px, ${-cam.y}px) scale(${cam.s})`;
      }
    }
    for (const i of items) {
      if (i.scene.el.style.visibility === "hidden") continue;
      const raw = clamp((t - i.at) / i.dur);
      const p = out3(raw);
      let opacity = i.anim === "none" ? 1 : p;
      let transform = "";
      if (i.anim === "rise") (transform = `translateY(${(1 - p) * 12}px)`), (i.el.style.filter = p < 1 ? `blur(${(1 - p) * 4}px)` : "");
      if (i.anim === "left") transform = `translateX(${(1 - p) * -34}px)`;
      if (i.anim === "pop") transform = `scale(${0.82 + 0.18 * back(raw)})`;
      if (i.anim === "wipe") i.el.style.clipPath = `inset(-20px ${(1 - p) * 100}% -20px -20px)`;
      if (i.anim === "draw") {
        opacity = raw > 0 ? 1 : 0;
        for (const path of i.paths) {
          const flowing = raw >= 1 && path.classList.contains("stream");
          // once drawn, a wire hands its dashes back to CSS (.risk is dashed)
          path.style.strokeDasharray = flowing ? "14 12" : raw >= 1 ? "" : path.dataset.len;
          path.style.strokeDashoffset = flowing ? -((t - i.at - i.dur) * 70) % 26 : raw >= 1 ? "" : path.dataset.len * (1 - inOut(raw));
          path.style.markerEnd = raw < 0.9 ? "none" : ""; // the arrowhead lands with the line
          path.style.markerStart = raw > 0 ? "" : "none";
        }
      }
      if (i.anim === "travel" && i.path) {
        // Ride the path, easing in and out; the token fades in at the start and stays parked at the end.
        const len = i.path.getTotalLength(), pt = i.path.getPointAtLength(len * inOut(raw));
        opacity = clamp((t - i.at) / 0.15);
        transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%)`;
      }
      if (i.moves) {
        let pos = { ...i.home };
        for (const m of i.moves) {
          const q = inOut(clamp((t - m.at) / 0.8));
          pos = { left: pos.left + (m.left - pos.left) * q, top: pos.top + (m.top - pos.top) * q, width: m.width && pos.width ? pos.width + (m.width - pos.width) * q : pos.width };
        }
        i.el.style.left = `${pos.left}px`;
        i.el.style.top = `${pos.top}px`;
        if (pos.width) i.el.style.width = `${pos.width}px`;
      }
      if (i.sweep && i.track) {
        const k = i.sweep.findLastIndex((key) => t >= key.at);
        const a = i.sweep[Math.max(k, 0)], b = i.sweep[k + 1];
        const v = k < 0 ? a.v : b ? a.v + (b.v - a.v) * clamp((t - a.at) / (b.at - a.at)) : a.v;
        i.el.style.left = i.track.pct(v);
      }
      if (i.strike !== undefined) i.el.style.setProperty("--strike", out3(clamp((t - i.strike) / 0.45)));
      if (i.anim === "type") {
        opacity = raw > 0 ? 1 : 0;
        i.el.textContent = i.text.slice(0, Math.round(i.text.length * raw));
        i.el.classList.toggle("typing", raw > 0 && raw < 1);
      }
      if (i.anim === "count") {
        const n = Number(i.el.dataset.count);
        i.el.textContent = i.text.replace(/\d+/, Math.round(n * p));
      }
      opacity *= 1 - clamp((t - i.out) / 0.4);
      if (i.focus) {
        // Ease from the previous line's focus state to this one's: lit elements get --hl, the rest dim.
        const s = i.scene;
        const state = (cue) => (i.focus.includes(cue) ? [1, 0] : [0, s.lit.has(cue) ? 1 : 0]);
        const [hl0, dim0] = state(s.prevCue), [hl1, dim1] = state(s.cue);
        i.el.style.setProperty("--hl", hl0 + (hl1 - hl0) * s.ramp);
        opacity *= 1 - 0.7 * (dim0 + (dim1 - dim0) * s.ramp);
      }
      i.el.style.opacity = opacity;
      if (transform) i.el.style.transform = transform;
    }
    for (const { el, fill, s } of segs) {
      fill.style.transform = `scaleX(${clamp((t - s.start) / (s.end - s.start))})`;
      el.classList.toggle("on", t >= s.start && t < s.end);
    }
  }

  // Layout checks the renderer prints: text that overflows its box, or content off the frame.
  function check() {
    const found = [...problems];
    for (const s of scenes) {
      if (!s.el) continue;
      seek(s.end - 0.35);
      for (const el of s.el.querySelectorAll("*")) {
        if (/(^|;)\s*(color|background|border-color|fill|stroke)\s*:|#[0-9a-f]{3,8}\b/i.test(el.getAttribute("style") ?? "")) {
          found.push(`scene ${s.id}: inline color on .${el.className?.baseVal ?? el.className ?? el.tagName}; use .new, .risk or .mute so color keeps one meaning`);
        }
        if (el.closest("svg") || el.closest("[data-camera]")) continue;
        const style = getComputedStyle(el);
        if (el.scrollWidth > el.clientWidth + 2 && style.overflowX !== "visible" && el.clientWidth) {
          found.push(`scene ${s.id}: text overflows .${el.className || el.tagName}: "${el.textContent.trim().replace(/\s+/g, " ").slice(0, 40)}"`);
        }
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > 1920 - 60 || r.bottom > 1080 - 120 || r.left < 60 || r.top < 60) && style.opacity !== "0") {
          found.push(`scene ${s.id}: .${el.className || el.tagName} "${el.textContent.trim().replace(/\s+/g, " ").slice(0, 30)}" leaves the safe area (the chapter rail sits below y=960)`);
        }
      }
    }
    seek(0);
    return [...new Set(found)];
  }

  window.deck = { ready: true, duration: T.duration, seek, problems: check };
  seek(0);
  if (RENDER) return;

  // In a browser: scale the frame to the window and play it with the narration, if it has been mixed.
  document.documentElement.classList.add("preview");
  const fit = () => document.documentElement.style.setProperty("--fit", Math.min(innerWidth / 1920, (innerHeight - 56) / 1080));
  addEventListener("resize", fit);
  fit();
  const bar = document.createElement("div");
  bar.className = "player";
  bar.innerHTML = `<button>Play</button><input type="range" min="0" max="${T.duration}" step="0.01" value="0"><output>0.0</output>`;
  document.body.append(bar);
  const [btn, range, outp] = bar.children;
  const audio = new Audio("voiceover/narration.wav");
  let playing = false, clock = 0, last = 0;
  // The narration is the clock while it plays; without it (not mixed yet, or autoplay blocked) a timer is.
  const now = () => (!audio.paused && !audio.error ? audio.currentTime : clock);
  const show = (t) => {
    seek(t);
    range.value = t;
    outp.textContent = t.toFixed(1);
  };
  const loop = (ms) => {
    if (!playing) return;
    clock = audio.paused ? clock + (ms - last) / 1000 : audio.currentTime;
    last = ms;
    const t = now();
    show(t);
    if (t >= T.duration) toggle();
    requestAnimationFrame(loop);
  };
  const toggle = () => {
    playing = !playing;
    btn.textContent = playing ? "Pause" : "Play";
    if (playing) {
      audio.currentTime = clock = Number(range.value) >= T.duration ? 0 : Number(range.value);
      audio.play().catch(() => {});
      last = performance.now();
      requestAnimationFrame(loop);
    } else {
      clock = now();
      audio.pause();
    }
  };
  btn.onclick = toggle;
  range.oninput = () => {
    clock = audio.currentTime = Number(range.value);
    show(clock);
  };
  addEventListener("keydown", (e) => {
    if (e.code === "Space") (e.preventDefault(), toggle());
    if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
      const t = clamp((Number(range.value) + (e.code === "ArrowRight" ? 5 : -5)) / T.duration) * T.duration;
      clock = audio.currentTime = t;
      show(t);
    }
  });
})();
