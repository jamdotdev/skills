# jam-to-e2e with the `jam` CLI

Use this when the Jam MCP tools are not connected. Set up once per environment:

```bash
command -v jam >/dev/null || echo "jam is not installed"
export PATH="$HOME/.local/bin:$PATH"
jam auth status --json || jam auth login
```

If `jam` is not on PATH, stop and ask the user to install it from
https://jam.dev/docs/cli, then continue. Do not install it yourself.

Exit code 3 means not signed in. With no browser (CI, a cloud agent), ask the
user to set `JAM_TOKEN` to a personal access token from
https://jam.dev/s/settings/mcp as a secret. Never write a token to a file.

The CLI column of the table in `SKILL.md` has the command for each read.
Paginated reads return `nextCursor`; pass it as `--after`. `jam agent-context`
prints every command and flag.
