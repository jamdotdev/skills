# jam-proof: several users in one Jam

Read this from `SKILL.md` when one flow needs two to four signed-in users at
once, such as a customer who asks for access and an admin who grants it.

- **One Chrome per user.** The default: the video shows both pages side by
  side, so the person watching sees the admin act while the customer waits.
  Launch each Chrome with its own `--user-data-dir` and debug port, and
  repeat `--cdp`:

```
jam record start --cdp 9222 --cdp 9223 --title "<the claim>" --json   # → { session, browsers: [{ cdpEndpoint, cdpProxy }, …] }
# drive each user through its own browsers[i].cdpProxy
jam record stop <session> --json
```

`browsers` is in `--cdp` order. When one script runs the whole flow, wrap
it with `jam record run --cdp 9222 --cdp 9223 … -- <script>` instead; the
script reads the proxies from `$JAM_CDP_PROXIES`, space-separated in
`--cdp` order (`$JAM_CDP_PROXY` is the first). The Console and Network
panels combine every browser on one timeline.

- **One Chrome, one browser context per user**, when only one Chrome can
  run. Each context has its own cookies and storage (Playwright:
  `browser.newContext()` on the browser from `connectOverCDP(cdpProxy)`),
  and one `--cdp` records every context. The video shows one page at a
  time: the page the driver acts in.

Limits:

- Each browser shows its visible tab, in `--cdp` order, under a
  `Browser N · host:port` label. Say in the Jam which browser is which user.
- Up to four `--cdp`: two or three in one row, four in a 2x2 grid. Give every
  browser the same viewport, 1040 pixels tall, so each labelled row is 1080p:
  1280x1040 for two or three users, 1920x1040 for four. Past 3840x2160 the
  video is scaled down.
- `stop` takes longer: it encodes the combined video once more.
- Older CLIs film the primary display for several `--cdp` with no selector.
  `jam record run --help` says which video several browsers get.
- If either browser quits, the recording is discarded with exit code 12.
