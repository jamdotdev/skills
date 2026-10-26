<p align="center">
  <a href="https://jam.dev">
    <img src="https://storage.googleapis.com/jam-assets/github-repo.png" alt="Jam">
  </a>
</p>

<h1 align="center">Jam skills</h1>

<p align="center">
  Your agent sees what you saw, and shows you what it did.
</p>

<p align="center">
  <a href="https://skills.sh/jamdotdev/skills"><img src="https://skills.sh/b/jamdotdev/skills" alt="skills.sh"></a>
  <a href="https://github.com/jamdotdev/skills/actions/workflows/ci.yml"><img src="https://github.com/jamdotdev/skills/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT"></a>
</p>
<br/>

```bash
npx skills add jamdotdev/skills
```

Then paste a Jam link and say what you want:

- "fix this https://jam.dev/c/…"
- "do what I said in this jam"
- "make a ticket for this jam"
- "record a jam showing it works"

A Jam is a screen recording or screenshot with the console logs, network requests and user actions attached, on one link. You'd record one for a bug report, a feedback walkthrough or a demo. These skills let your agent read a Jam, and record its own when it's done, so you check the result by watching it.

Works with Claude Code, Cursor, Codex, GitHub Copilot, Gemini CLI, OpenCode and [every agent skills.sh supports](https://skills.sh). Add `--skill jam-fix` to install one skill.

## Skills

You don't need to remember these names. Paste a Jam link, say what you want, and your agent picks the skill.

### Give your agent a Jam

- [jam](./skills/jam/SKILL.md): "Take a look at this jam." For a link with no instructions. It reads the Jam and picks the skill below that fits.
- [jam-fix](./skills/jam-fix/SKILL.md): "Fix this jam." Finds the root cause from the errors, failed requests and steps in the recording, and shows the evidence. It changes code only when you ask.
- [jam-to-tasks](./skills/jam-to-tasks/SKILL.md): "Do what I said in this jam." Turns your feedback into a numbered to-do list, each item tied to the moment you said it, then works through it.
- [jam-to-e2e](./skills/jam-to-e2e/SKILL.md): "Write a test for this jam." Writes an end-to-end test with your project's own test setup. A Jam of a bug becomes a test that fails until the fix lands.
- [jam-to-ticket](./skills/jam-to-ticket/SKILL.md): "Make a ticket for this jam." Files it in Linear, GitHub Issues or Jira with the steps, a frame from the recording and the errors, unless a ticket already exists.
- [video-to-jam](./skills/video-to-jam/SKILL.md): "Split this recording by bug." Turns an MP4, a Loom download or a long call into one Jam per issue.

### Get a Jam back

- [jam-proof](./skills/jam-proof/SKILL.md): "Record a jam showing it works." Records the change working and gives you a Jam link for the pull request.
- [jam-annotate](./skills/jam-annotate/SKILL.md): "Mark what's broken and share it." Draws boxes, arrows and notes on a screenshot, blurs anything private, and shares it as a Jam.
- [jam-proof-table](./skills/jam-proof-table/SKILL.md): "Give me the jams for each fix." After a batch of work, one table: each claim, whether it works, and the Jam that shows it.

## Requirements

- A free [Jam](https://jam.dev?utm_source=github&utm_medium=readme&utm_campaign=skills) account.
- The [Jam CLI](https://jam.dev/cli). A skill signs in when it needs to. `jam`, `jam-fix` and `jam-to-e2e` can read a Jam through Jam MCP instead, the Model Context Protocol (MCP) server the plugin connects.
- For `video-to-jam`: ffmpeg and a local transcriber such as Whisper.
- In CI or a cloud agent: a [personal access token](https://jam.dev/docs/personal-access-tokens) in `JAM_TOKEN`.
- For `jam-proof`: recording a web page needs only Chrome. Recording a window or the whole screen needs macOS or Linux (X11).

## Install as a plugin

The plugin installs every skill, connects [Jam MCP](./docs/plugin.md) and updates itself. Use the plugin or `npx skills add`, not both, or the agent sees every skill twice.

<details>
<summary><strong>Claude Code</strong></summary>

```shell
/plugin marketplace add jamdotdev/skills
/plugin install jam@jam-plugins
```

Skills load as `/jam:jam-fix`, `/jam:jam-proof`, and so on. To test a checkout, run `claude --plugin-dir /path/to/skills`.

</details>

<details>
<summary><strong>Cursor</strong></summary>

Open **Customize** in the sidebar, search for **Jam**, and click **Install**.

To test a checkout, link it into the local plugin folder and run **Developer: Reload Window**:

```bash
ln -s /path/to/skills ~/.cursor/plugins/local/jam
```

</details>

<details>
<summary><strong>Codex</strong></summary>

```bash
codex plugin marketplace add jamdotdev/skills
codex plugin add jam@jam-plugins
```

Start a new session, complete the OAuth prompt, and run `/mcp` to check the connection. To test a checkout, pass its path to `marketplace add`.

</details>

<details>
<summary><strong>GitHub Copilot CLI</strong></summary>

```bash
copilot plugin marketplace add jamdotdev/skills
copilot plugin install jam@jam-plugins
```

</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

```bash
gemini extensions install https://github.com/jamdotdev/skills
```

Run `/mcp auth Jam` once to sign in. To test a checkout, run `gemini extensions link /path/to/skills`.

</details>

Sign-in, tokens, what Jam MCP can do, and permissions: [docs/plugin.md](./docs/plugin.md).

## Contribute

Bug in a skill, or a skill you want? [Open an issue](https://github.com/jamdotdev/skills/issues/new/choose). Pull requests are welcome, and [CONTRIBUTING.md](./CONTRIBUTING.md) is short.

---

<p align="center">
  <a href="https://jam.dev">jam.dev</a> ·
  <a href="https://jam.dev/mcp">Jam MCP</a> ·
  <a href="https://jam.dev/cli">Jam CLI</a> ·
  <a href="https://jam.dev/utilities">Dev Utils</a> ·
  <a href="./CHANGELOG.md">Changelog</a> ·
  <a href="./LICENSE">MIT</a>
</p>
