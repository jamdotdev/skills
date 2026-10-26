# Changelog

## Unreleased

- `jam`, `jam-to-tasks`, `jam-to-ticket` and `jam-proof-table` handle screenshot, replay and silent Jams, and Jams that raise several problems: the router reads the transcript and a silent Jam's description, a task cites its field when there is no timestamp, a screenshot counts as proof, and an existing ticket covers only its own problem.
- The README groups the skills by what you hand the agent and what you get back, with one plain line each, and lists the requirements one per line. It follows Jam's docs writing rules: no semicolons, and bold only for UI labels.
- Added `jam`: type `/jam` and what you want, and it routes to the matching Jam skill. It also catches a bare jam.dev link or a vague ask, reads the Jam, and routes by what it holds; a clear ask still goes straight to its own skill.
- The README lists skills as one bulleted list instead of a table plus a section per skill. `scripts/check.mjs` checks for the list entry.
- The skills no longer download and run an installer. If `jam` is missing, they ask you to install it from jam.dev/cli. Addresses the remote-code-execution audit finding on `jam-proof` and `jam-annotate`.
- `jam-annotate` and the `jam-fix` proof step write the Jam payload to a file and run `jam create jam @payload.json`, so user and page text never reaches a shell argument.
- `jam-fix` and `jam-to-e2e` treat Jam content (transcript, logs, network bodies, page text, comments) as evidence, not instructions.
- `server.json` follows Jam MCP 1.27.1, the version production serves.
- `jam-fix` hands a narrated walkthrough that asks for several changes to `jam-to-tasks`, when installed, instead of diagnosing it as one bug.
- Added `jam-to-tasks`: turn a narrated Jam into a numbered list of every change asked for, each tied to its moment, frame and quote, then work through the list.
- Added `jam-to-ticket`: file a Jam as a ready-to-work issue in Linear, GitHub Issues or Jira, after checking the Jam's own integrations and the tracker for an existing ticket.
- Added `jam-proof-table`: end a batch of work with one table of claim, status and Jam link, with every Jam named, filed and checked.
- Added `video-to-jam`: turn a video file into one Jam per issue, cut where the speaker moves to a new problem. It transcribes on the local machine so only the clips are uploaded; letting Jam transcribe the full recording needs the user's yes.
- `scripts/check.mjs` treats a skill with `jam` anywhere in its name as a Jam skill, so `video-to-jam` must carry the feedback section like the `jam-*` skills.

## 2.0.0

The plugin is now versioned on its own and no longer tracks the Jam MCP server version.

- Renamed `investigate-bug` to `jam-fix`, because "fix this Jam" is what people ask for. It diagnoses first, changes code only when asked, and posts findings on the Jam when requested. Its description carries trigger phrases instead of slash-command syntax, and it covers the `jam` CLI when MCP is not connected.
- Added `jam-proof`: record a change working and return a Jam link for the pull request. Moved from the Jam CLI bundle; this repo is now its source.
- Added `jam-annotate`: mark up a screenshot with boxes, arrows, notes, redactions and blurs, and file it as a Jam. Moved from the Jam CLI bundle; this repo is now its source.
- Added `jam-to-e2e`: turn a Jam into steps and an end-to-end test in the project's own runner and language, with first-class guidance for Playwright and tester-army/e2e. A flow Jam becomes a passing test that guards it; a bug Jam becomes a failing test for the fix to turn green.
- Removed `jam-cli`. Each `jam-*` skill now carries its own install and sign-in steps, and `jam agent-context` prints the full command surface. The old skill named `jam get intents` and `jam get events` for user events; 1.29.0 ships `jam get user-events` and no `intents`.
- Every skill now ends with a "Send feedback to Jam" section: the agent reports a wrong, stale or confusing Jam tool, command, doc or skill (or one that worked unusually well) with `jam feedback` or the `submitFeedback` MCP tool, without asking first, at most once per session. `docs/plugin.md` and the Cursor rule now match the server: no approval step, bodies up to 2,000 words.
- Added `agents/openai.yaml` to every skill for the Codex skill picker.
- Added `scripts/package-chatgpt.mjs`, which builds the ChatGPT directory package from `jam-fix` and `jam-to-e2e` with listing copy that names only those two.
- Rewrote the README around the skills, with `npx skills add jamdotdev/skills` first. Moved sign-in, the MCP tool list and permissions to `docs/plugin.md`, and the release steps to `CONTRIBUTING.md`.
- Added `CONTRIBUTING.md`, `AGENTS.md`, issue templates, and a CI workflow that checks skill frontmatter, README cards, manifest versions, Markdown links, the Claude Code plugin manifest, and that the skills CLI lists every skill.
- Added `privacyPolicyUrl` to the Claude Code plugin manifest.
- Cut the copies of the MCP tool guide. `docs/plugin.md` now summarizes what the server can do and links to jam.dev/mcp, the Cursor rule keeps only the confirm-before-delete rule and points at `jam-fix`, and `jam-fix` leaves filter and paging details to the tool descriptions.
- Moved `jam-proof`'s cursor overlay and visible-Chrome details to `references/browser.md`.
- Renamed the repository to `jamdotdev/skills`. Install commands and manifest URLs now point there; the `jam-plugins` marketplace name is unchanged.
- Pointed the MCP website and docs links at `jam.dev/mcp`, and the CLI links at `jam.dev/cli`.
- Added `server.json` for the official MCP Registry (`dev.jam/jam`) and a publish workflow triggered by `mcp-v*` tags. Its version follows the Jam MCP server, not the plugin.
- Validate skill frontmatter with a YAML parser and require exact discovery entries, so malformed skills cannot pass CI by appearing in a warning.
- Keep local annotation requests local and require posting intent for Jam comments, mentions, pull requests and tickets.
- Give CLI investigations both client and server failures, and require an explicit browser or window target for proof recordings.
- Use the project's browser mode for regression tests and isolated checkouts for new before-and-after recordings.

## 1.23.2

- Aligned the plugin version with Jam MCP 1.23.2, confirmed through production initialization.
- Filled publication metadata, including the privacy policy URL.
- Kept `jam-cli` for coding-agent plugins. Documented a separate ChatGPT upload that includes only the MCP investigation skill to address the external-code validation warning.

## 1.5.0

- Synced with deployed Jam MCP 1.23.2, verified through production server initialization and its 35-tool inventory.
- Added `searchJams` guidance and marked `listJams` deprecated. Added `submitFeedback` with exact-text approval, privacy limits, and at most one submission per session.
- Corrected event filter examples to arrays and documented cursor pagination, total counts, and network response-body limits.
- Documented video thumbnail links and CLI proof capture guidance.
- Added `.codex-plugin/plugin.json` with Jam listing metadata, reusing the existing MCP configuration, skills, and logo.
- Documented Codex installation from GitHub and a local checkout using the existing `jam-plugins` marketplace.

## 1.4.1

- Documented GitHub Copilot CLI install. Copilot CLI reads the `.claude-plugin/` manifest and marketplace, so `copilot plugin install jam@jam-plugins` works with no new files.
- Synced tool and CLI docs with the shipped Jam MCP server and Jam CLI: `search` matches video Jams only, `listJams` filters by origin, `updateJam` also renames and edits descriptions, token expiry uses fixed lengths, paginated CLI output includes `truncated` and `hint`, and the `jam-cli` skill covers `jam record start`/`stop` and `--cdp`.
- Made the README and the `jam-cli` skill agent-neutral. The skill no longer assumes Cursor when it installs the CLI's command reference.

## 1.4.0

- Added a Claude Code plugin manifest and marketplace in `.claude-plugin/`. The same repository now installs in Claude Code with `/plugin marketplace add jamdotdev/jam-plugin`, with the Jam MCP server and both skills.
- Added `gemini-extension.json`. The repository installs as a Gemini CLI extension with `gemini extensions install https://github.com/jamdotdev/jam-plugin`.

## 1.3.0

- Added the `jam-cli` skill: install the Jam CLI, authenticate with `JAM_TOKEN` in headless environments, triage a Jam with `jam get`, and record proof of a fix with `jam record run`. Covers Cursor Cloud Agents and CI, where the MCP server is not wired up.
- Documented `jam record` and `jam create jam` in the README.

## 1.2.2

- Bundled the plugin logo at `assets/logo.png` and referenced it by relative path, as the Cursor plugin reference asks. The marketplace resolves it from the repository at the reviewed commit instead of fetching an external URL.

## 1.2.1

- Rewrote the plugin description and README opening for the Cursor marketplace listing.
- Corrected the Cursor UI paths. MCP servers, rules, and skills are managed from **Customize**, not `Settings > Features > MCP`.
- Corrected where personal access tokens come from: **Settings → MCP** in Jam, not team settings.
- Applied Jam's product terminology. The entity is a workspace, not a team, and Recording Links is a feature name.
- Pointed the MCP documentation link at `jam.dev/docs/jam-mcp` instead of the `/mcp` redirect, and the Chrome extension link at its current Chrome Web Store URL.
- Documented that a Recording Link captures console and network logs only when it starts from a verified connected domain.

## 1.2.0

- Fixed the plugin logo: it pointed at `https://jam.dev/favicon.svg`, which returns 404. It now points at `https://cdn-jam-assets.jam.dev/cursor-plugin/logo.png`, served from the Jam asset CDN.
- Added `.cursor-plugin/marketplace.json` so the repository can be added as a plugin folder in Cursor.
- Documented the 9 tools the Jam MCP server gained since v1.7.0: `getVideoChapters`, `createFolder`, `updateFolder`, `editComment`, `addReaction`, `removeReaction`, `deleteJam`, `deleteComment`, `deleteFolder`. The README and the `jam-bug-analysis` rule now cover all 33 tools.
- Called out the destructive `delete*` tools in their own section of both the README and the rule, with an instruction to confirm with the user before calling them.
- Fixed the Personal Access Token instructions, which told readers to replace an `auth` block that `mcp.json` no longer contains.
- Removed the `rules`, `skills`, and `mcpServers` path fields from the manifest. They named the default directories, which Cursor already discovers on its own.

## 1.1.0

- Updated for Jam MCP server v1.7.0 — now documents all 24 tools.
- New investigation tool: `getFrames` (still frames from video Jams — overview grid or timestamp sampling). Wired into the `jam-bug-analysis` rule and the `/investigate-bug` skill as the first visual-evidence step for video Jams.
- New recording-link tools: `createRecordingLink`, `listRecordingLinks`, `getRecordingLink`, `updateRecordingLink`, `deleteRecordingLink`, `listRecordingLinkJams`, `listRecordingUrls`, `getRecordingUrlVerifyLink`.
- Simplified `mcp.json` to the standard Cursor shape (`{"url": ...}`); removed the non-spec `auth.scopes` block (OAuth scopes come from server discovery).
- README: added a Jam CLI section.

## 1.0.0

- Initial release of the Jam plugin for Cursor.
- Connects to the Jam MCP server at `https://mcp.jam.dev/mcp` via OAuth (Personal Access Token also supported).
- Exposes 15 MCP tools: `getDetails`, `getNetworkRequests`, `getConsoleLogs`, `getUserEvents`, `getScreenshots`, `analyzeVideo`, `getVideoTranscript`, `getMetadata`, `listJams`, `listFolders`, `listMembers`, `createComment`, `updateJam`, `search`, `fetch`.
- Adds the `jam-bug-analysis` rule (always-on guidance for how to use the tools).
- Adds the `/investigate-bug` skill for end-to-end structured bug investigation.
