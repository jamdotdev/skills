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

A Jam is a screen recording with the console logs, network requests and user actions already attached, on one link. Bug reports, feedback walkthroughs and demos already live there. These skills let your agent read them, and record its own Jam when it's done, so you check the result by watching it.

Works with Claude Code, Cursor, Codex, GitHub Copilot, Gemini CLI, OpenCode and [every agent skills.sh supports](https://skills.sh). Add `--skill jam-fix` to install one skill.

## Skills

- [jam](./skills/jam/SKILL.md): "Take a look at this jam." Paste a bare link or a vague ask and it **reads the Jam**, then hands it to the skill that fits: a narrated walkthrough to `jam-to-tasks`, a bug to `jam-fix`. A clear ask goes straight to its own skill. `/jam` works too.
- [jam-fix](./skills/jam-fix/SKILL.md): "Fix this jam.dev link." Reads the recording's **console errors**, **failed requests**, **user steps**, **frames** and **transcript**, then writes the **root cause with evidence**. Changes code only when you ask.
- [jam-proof](./skills/jam-proof/SKILL.md): "Record a Jam showing it works." Records the change working and hands back a **Jam link for the pull request**, with **console** and **network** attached. Headless Chrome by default: it records the page, not your screen.
- [jam-annotate](./skills/jam-annotate/SKILL.md): "Mark what's broken and file it." Turns a screenshot into a Jam that points at the problem: **boxes**, **arrows**, **notes**, **redactions** and **blurs**, with the retina math done right.
- [jam-to-e2e](./skills/jam-to-e2e/SKILL.md): "Write an e2e test for this Jam." Turns a Jam into a test in **your own runner and language**, with first-class guidance for **Playwright** and [tester-army/e2e](https://github.com/tester-army/e2e). A Jam of a flow becomes a test that **guards it**. A Jam of a bug becomes a **failing test**, so the fix has something to turn green.
- [jam-to-tasks](./skills/jam-to-tasks/SKILL.md): "Do what I said in this jam." Reads a narrated walkthrough to the end and lists **every change asked for**, each with its **timestamp**, **frame** and **quote**, then works the list: done, deferred with a reason, or asked about.
- [jam-to-ticket](./skills/jam-to-ticket/SKILL.md): "Make a ticket for this jam." Files a Jam into **Linear**, **GitHub Issues** or **Jira** with steps, expected result, the key frame and errors, after checking it is **not ticketed already**.
- [jam-proof-table](./skills/jam-proof-table/SKILL.md): "Give me the jams for each fix." Ends a batch of work with **one table**: each claim, its status, and the Jam that shows it. Names and files those Jams so they can be **found later**.
- [video-to-jam](./skills/video-to-jam/SKILL.md): "Split this recording by bug." Turns an MP4, a Loom download or a long call into **one Jam per issue**, cut where the speaker moves on, titled and filed in a folder.


## Requirements

Every skill needs a free [Jam](https://jam.dev?utm_source=github&utm_medium=readme&utm_campaign=skills) account. `jam-fix` and `jam-to-e2e` read a Jam through the Jam MCP server or the [Jam CLI](https://jam.dev/cli); `jam-proof` and `jam-annotate` create Jams, which needs the CLI. `jam-to-tasks`, `jam-to-ticket`, `jam-proof-table` and `video-to-jam` use the CLI; `video-to-jam` also needs ffmpeg and a local transcriber such as Whisper. Install the CLI from [jam.dev/cli](https://jam.dev/cli); a skill signs in when it needs it. In CI or a cloud agent, set `JAM_TOKEN` to a [personal access token](https://jam.dev/docs/personal-access-tokens). Window and display capture in `jam-proof` need macOS or Linux (X11); its default, recording a headless browser, needs only Chrome.

## Install as a plugin

The plugin installs every skill, connects the [Jam MCP server](./docs/plugin.md) and updates itself. Use the plugin or `npx skills add`, not both, or the agent sees every skill twice.

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

Sign-in, tokens, what the MCP server can do, and permissions: [docs/plugin.md](./docs/plugin.md).

## Contribute

Bug in a skill, or a skill you want? [Open an issue](https://github.com/jamdotdev/skills/issues/new/choose). Pull requests are welcome; [CONTRIBUTING.md](./CONTRIBUTING.md) is short.

---

<p align="center">
  <a href="https://jam.dev">jam.dev</a> ·
  <a href="https://jam.dev/mcp">Jam MCP</a> ·
  <a href="https://jam.dev/cli">Jam CLI</a> ·
  <a href="https://jam.dev/utilities">Dev Utils</a> ·
  <a href="./CHANGELOG.md">Changelog</a> ·
  <a href="./LICENSE">MIT</a>
</p>
