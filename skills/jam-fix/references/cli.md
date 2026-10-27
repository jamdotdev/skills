# jam-fix with the `jam` CLI

Use this when the Jam MCP tools are not connected. Set up once per environment:

```bash
command -v jam >/dev/null || echo "jam is not installed"
export PATH="$HOME/.local/bin:$PATH"
jam auth status --json || jam auth login
```

If `jam` is not on PATH, stop and ask the user to install it from
https://jam.dev/cli, then continue. Do not install it yourself.

Exit code 3 means not signed in. With no browser (CI, a cloud agent), ask the
user to set `JAM_TOKEN` to a personal access token from
https://jam.dev/s/settings/mcp as a secret. Never write a token to a file.

The same steps, as commands:

```bash
jam get jam "$ID" --json                        # 1. report, type, URL
jam get network "$ID" --status 4xx --json       # 2. client failures
jam get network "$ID" --status 5xx --json       # 2. server failures
jam get console "$ID" --level error --json      # 3. console errors
jam get user-events "$ID" --json                # 4. clicks, inputs, navigation
jam get frames "$ID" --overview                 # 5. video grid (--at <ms> to sample)
jam get screenshots "$ID" --out ./shots         # 5. screenshot Jams
jam get transcript "$ID"                        # 5. reporter's narration
jam get metadata "$ID" --json                   # 6. app context
```

For an unexpected successful response, remove the status filter and use
`jam get network "$ID" --bodies all --json`.

If the user asked to post findings on the Jam:

```bash
jam create comment "$ID" "Root cause: ..." --at 4200
jam update jam "$ID" --resource <pull request url>    # attach the fix's PR
```

Mark an "after" Jam as the fix of the reported one:

```bash
jam update jam <after jam> --mark-related "$ID" --type fixes
```

Paginated reads return `nextCursor`; pass it as `--after`. `jam agent-context`
prints every command and flag.

## Proof of a fix

Use this after the user asks to create an "after" Jam. Reuse the reported
Jam as the "before". Posting the result on that Jam, a PR, or a ticket
requires a request to publish there.

For a passing Playwright test, enable `video: "on"` in the test configuration
and run it with a trace. Upload both artifacts:

```bash
npx playwright test <file> --trace on
ffmpeg -i test-results/<test>/video.webm after.mp4
jam create jam @payload.json
```

Write `payload.json` with your file-writing tool; user and page text never goes
into a shell argument:

```json
{"kind":"video","url":"<page url>","title":"<the claim>","videoPath":"after.mp4","playwrightTracePath":"test-results/<test>/trace.zip","screenDimensions":{"width":1280,"height":720}}
```

Use the test's viewport for `screenDimensions`. Put the bug Jam's URL in the
description. The trace supplies console, network and test actions.

For a live recording, use `jam-proof` if it is installed. Otherwise name an
explicit target. For a browser, use its debug endpoint:

```bash
jam record run --cdp <endpoint> --title "<the claim>" -- <verify command>
```

For a desktop app, select the process you launched:

```bash
jam record run --pid <pid> --title "<the claim>" -- <verify command>
```

On Linux, window capture records a screen region. Use an isolated desktop
session or get explicit consent before recording a desktop someone is using.

Never omit both the browser endpoint and the window selector: that records
the whole display. Ask before recording a display someone is using, naming
the display and duration. Use test data and return only a successful upload's
receipt URL.
