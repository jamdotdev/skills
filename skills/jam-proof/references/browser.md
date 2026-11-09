# jam-proof: browser details

Read this from `SKILL.md` when the video needs a readable cursor, a size other than 1920x1080, a visible Chrome window, or Playwright response interception.

## Intercept responses with Playwright

`route.fetch()` and `route.fulfill()` work through `cdpProxy` with both
`page.route()` and `context.route()`. Connect with
`chromium.connectOverCDP(cdpProxy)`, then register the route before navigating
or triggering the request. With `jam record run`, the proxy address is in
`JAM_CDP_PROXY`.

If the handler does not run, check whether the browser sends a matching
request. A Next.js prefetch may fill the app's client-side cache before the
route is installed, so a later click may send no new request. Reload with the
route installed or use a fresh browser context. Match the actual URL,
including query parameters, and count handler calls rather than inferring
interception from the page alone.

Playwright routing disables the browser's HTTP cache, not an app's
client-side cache. Routes do not intercept requests handled by a service
worker. Use `browser.newContext({ serviceWorkers: "block" })` when the app
does not require one, and sign in again if the fresh context needs it. See
[Playwright's routing reference](https://playwright.dev/docs/api/class-browsercontext#browser-context-route)
for its routing constraints and the
[response interception example](https://jam.dev/docs/cli-record-browser#intercept-responses-with-playwright)
for setup.

Label mocked responses in the proof's title or description. A mocked response
proves the page's behavior with that response, not that the backend returned
it. Do not present a mock-backed run as an end-to-end backend check.

## Readable cursor video

What makes a headless video readable is agent-browser's cursor overlay, which
needs agent-browser 0.38 or later:

- `--cursor` draws the pointer into the page as an inert overlay, so the
  screencast shows where each click landed and the hover state it triggered.
  Without it the video cuts from one state to the next and a viewer cannot
  tell what was pressed. The overlay is hidden from accessibility snapshots
  and removed on stop. Its own `/tmp/discard.webm` is a side effect of
  turning the overlay on — the Jam is the deliverable, so throw the file
  away.
- `--input-mode human` moves the pointer along a curve at human speed, but
  only for `mouse move <x> <y>`. `hover`/`click` on a selector snap the
  pointer to the element in a single frame, so a video built from them cuts
  from place to place with nothing to follow. Drive a cursor proof with
  `mouse move` to the target, then `mouse down` and `mouse up` to click it.
  Read the target's centre first, for example
  `agent-browser eval '(() => { const r = document.querySelector("<sel>").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()'`.
- The overlay stops following the pointer after a navigation in the middle of
  a recording: it stays frozen wherever the last click left it, on every page
  that follows. Keep a cursor proof on one page, and set the page up before
  `record start`. When the proof has to cross pages, record it without the
  overlay and say in the description what was clicked.
- **Record at 1920x1080 unless the proof calls for another size.** It is the
  size a reader expects and the size anything posted elsewhere wants, and a
  headless page has no window to constrain it. Set it with `agent-browser set
  viewport 1920 1080` **before** recording and reload, because the setting
  does not apply to the page already open. Use another size only when the
  claim is about that size — a mobile layout, a customer's reported window —
  and say which in the description. The frame rate is not yours to pick: the
  screencast is 30 fps, and agent-browser's own `--fps` only governs the
  `/tmp/discard.webm` you discard. Keep it low (`--fps 5`): at 1920x1080
  agent-browser's encoder can fall behind and abort its recording, which
  takes the overlay with it.

## Visible Chrome (rung 2)

When the proof needs the address bar, a Chrome dialog or the real OS cursor,
that is rung 2: run Chrome visible and name its window, so the video is a
screen capture of the window instead of the page screencast. Keep `--cdp`
so console, network and actions still land.

With agent-browser, add `--headed`; it opens its own "Google Chrome for
Testing" window with a fresh profile, so nothing of the person's appears:

```
agent-browser --session proof --headed --input-mode human open <url>
agent-browser --session proof get cdp-url
jam record start --app "Google Chrome for Testing" --cdp <cdp-url> --title "<the claim>" --json
```

`jam record windows --json` lists the window if the app name differs on your
machine; pass its id as `--window-id` instead of `--app`.

With any other driver, launch Chrome yourself with a debug port and its own
data dir, since Chromium 136 and later refuses `--remote-debugging-port` on
the default profile, and select it by pid:

```
<chrome binary> --remote-debugging-port=9222 --user-data-dir=/tmp/jam-chrome about:blank &
jam record start --pid <chrome pid> --cdp 9222 --title "<the claim>" --json
```

A driver that moves the real mouse instead of speaking CDP leaves no
actions in the Jam; console and network still land from the tap.
