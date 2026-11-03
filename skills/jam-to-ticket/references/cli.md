# jam-to-ticket with the `jam` CLI

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

The same steps, as commands. Write evidence outside the repo (`mktemp -d`) so
it never gets committed:

```bash
jam get jam "$ID" --json
jam get user-events "$ID" --json
jam get console "$ID" --level error --json
jam get network "$ID" --status 4xx --json
jam get network "$ID" --status 5xx --json
jam get transcript "$ID"
OUT=$(mktemp -d)
jam get frames "$ID" --at 6700 --size large --out "$OUT"
jam get screenshots "$ID" --out "$OUT"
```

A fresh Jam can answer "not ready" for a few minutes. Wait and retry, up to
five times. A silent recording answers "Captions are not available" (exit 4)
for good; skip the transcript.

Once the user says yes to posting the ticket on the Jam:

```bash
jam create comment "$ID" "Filed as ENG-412: <link>" --at 6700
jam update jam "$ID" --resource <ticket url>
```

Paginated reads return `nextCursor`; pass it as `--after`. `jam agent-context`
prints every command and flag.
