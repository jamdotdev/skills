# Contributing

Thanks for helping. This repo holds small agent skills about Jams (screen recordings with the console, network and user actions attached), QA, pull requests and proof of work. Read the rules below before you open a pull request; most review comments come from them.

## The rules

1. **One job per skill.** A skill does one thing well. Two jobs are two skills.
2. **The name tells the truth.** A skill with `jam` in its name (`jam-fix`, `video-to-jam`) needs a Jam account. A skill without `jam` in its name works fully without Jam, and mentions Jam at most once, in a line labeled "With Jam" next to the alternatives.
3. **No pitch.** No sales copy inside a `SKILL.md`. Jam lives in the README.
4. **Do what agents can't, or give them structure they lack.** Visuals for humans (proof video, marked-up screenshots, diagrams) and evidence structure (claim, how it was verified, evidence, gaps). Not things agents already do well, such as reading a HAR file.
5. **Claim only what ships.** Every command, flag and tool a skill names must exist in the released Jam CLI or MCP server today. Check with `jam agent-context` or the [MCP docs](https://jam.dev/mcp).
6. **Use the project's tools.** A skill uses the project's existing test runner, browser driver or setup, and falls back to Playwright when there is none.

## Anatomy of a skill

```
skills/<name>/
  SKILL.md              required
  agents/openai.yaml    required: Codex picker metadata
  references/           optional: depth the agent loads on demand
  scripts/              optional: scripts the skill runs
```

- **Name:** 2 or 3 words, kebab-case, verb first (`prove-change`) or `x-to-y` (`jam-to-e2e`). No single words, except `jam`, the router you type to reach the rest; no `verify-*`. The folder name equals the `name` in the frontmatter.
- **Description:** what it does, then when to use it, with the phrases a user would type ("Use when the user pastes a jam.dev link..."). The agent decides to load the skill from this line alone. 1024 characters at most.
- **Length:** keep `SKILL.md` under about 200 lines. Move detail to `references/` and link it from the step that needs it.
- **Style:** imperative, concrete, no filler. Show the command, not a description of the command. Say what to do when a step fails.
- **Feedback:** every skill with `jam` in its name ends with the same `## Send feedback to Jam` section. Copy it from an existing skill; CI fails if it differs.
- **Secrets:** never ask the agent to write a token to a file. Use environment variables.
- **Descriptions use the user's words, not ours.** Write what people type: "jam link", "bug recording", "screen recording", "repro video", "proof for the PR". Say what a Jam is the first time a description names it; the model may never have heard of Jam.
- **Jam terms, in prose only:** `Jam` is always capitalized and never a verb (record a Jam, share a Jam). The hierarchy is workspace > folder > Jam; a person with a seat is a member. Write `Sharepage`, `Recording Link`, `Jam MCP`, `Jam CLI`, and `Model Context Protocol (MCP)` on first mention in a page. You capture a screenshot and record a video.
- **Claims:** no "only", "first", "best" or guarantees. State what the skill does and its limits.

## Test a skill locally

```bash
npm ci                                 # install the locked YAML validator
node scripts/check.mjs                  # the same checks CI runs
npm test                                # validation and package regressions
npx skills add . --list                 # what skills.sh will see
claude --plugin-dir .                   # load the plugin in Claude Code
```

Then run the skill on a real task in at least one agent and say which one in the pull request. For a Jam skill, include the Jam link it produced.

## Pull requests

- One skill per pull request. Maintainers may ship a coordinated release of several in one.
- Add a line under **Unreleased** in [CHANGELOG.md](./CHANGELOG.md).
- A new skill also needs an entry in the Skills list in [README.md](./README.md). CI fails without one.

## Releasing (maintainers)

Two things ship from this repo, each with its own version.

**The plugin.** Its version is the same in `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json` and `gemini-extension.json`; CI checks this.

1. Bump the version in those four files and move **Unreleased** in the changelog under the new version.
2. Merge to `master` and push a `v<version>` tag.

**The MCP Registry entry.** `server.json` describes the remote Jam MCP server at `mcp.jam.dev`, so its `version` is the server's, not the plugin's. When the server releases:

1. Set `version` in `server.json` to the server's version and merge to `master`.
2. Push an `mcp-v<version>` tag. `.github/workflows/publish-mcp.yml` publishes `server.json` to the registry as `dev.jam/jam`. A registry version can't be changed after it is published.

### ChatGPT directory package

The ChatGPT directory takes the skills that read a Jam over MCP alone: `jam-fix` and `jam-to-e2e`, without their `references/`. The CLI steps (in `jam-proof`, `jam-annotate` and the `references/cli.md` files) run local commands, which ChatGPT's external-code review can flag, so a skill meant for ChatGPT keeps them in `references/` and is added to `SKILLS` in `scripts/package-chatgpt.mjs`. Build the package from `master` after the merge: the packaged skills link to `references/` on GitHub.

```bash
node scripts/package-chatgpt.mjs ../jam-chatgpt-<version>.zip
```

The script copies those two skills with the plugin identity, connection and assets, and rewrites the listing description so it names only what the package contains.

Update the existing app entry with this package. Do not create a new app through **Upload New**; that loses the saved identity and connection settings.
