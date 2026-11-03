# AGENTS.md

Guidance for coding agents working in this repository. Humans: see [CONTRIBUTING.md](./CONTRIBUTING.md), which holds the rules every skill follows.

## Layout

- `skills/<name>/SKILL.md`: the skills. Each folder also has `agents/openai.yaml`.
- `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `gemini-extension.json`: plugin manifests. `mcp.json` is the shared MCP server entry; `.mcp.json` is the Codex/OpenAI copy of it.
- `server.json`: the MCP Registry entry `dev.jam/jam`. Its `version` is the Jam MCP server's. `.codex-plugin/plugin.json` tracks that version; the other plugin manifests do not. Pushing an `mcp-v*` tag publishes it, and a published version is permanent. Never push a tag unless asked.
- `rules/`: a Cursor rule that guards the Jam MCP delete tools.
- `scripts/package-chatgpt.mjs`: the ChatGPT directory package. A skill that reads a Jam over MCP alone goes into its `SKILLS` list (`jam`, `jam-fix`, `jam-to-e2e`, `jam-to-tasks`, `jam-to-ticket`).
- `docs/plugin.md`: plugin sign-in, what the MCP server can do, permissions. The tool list itself lives at https://jam.dev/docs/jam-mcp; do not copy it here.
- `scripts/check.mjs`: repo checks, run by CI.

## Invariants

Run `node scripts/check.mjs` after any change. It prints each rule it finds broken, with the file.

Also:

- When you add, rename or remove a skill, update its README card, the CHANGELOG, and any skill that names it.
- `jam-proof` and `jam-annotate` are also bundled in the Jam CLI. This repo is the source; tell the user the bundle needs a resync when you change them.
- Only name `jam` CLI commands and MCP tools that ship today. Check with `jam agent-context`.
- Skills are public. No internal paths, repo names, staging hosts or customer data.
