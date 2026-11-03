# jam-to-tasks with the `jam` CLI

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

The same steps, as commands. Write frames outside the repo (`mktemp -d`) so
they never get committed:

```bash
jam get jam "$ID" --json
jam get transcript "$ID" --json
FRAMES=$(mktemp -d)
jam get frames "$ID" --overview --size medium --out "$FRAMES"
jam get frames "$ID" --at 14220,18720,46140 --size medium --out "$FRAMES"
jam get screenshots "$ID" --out "$FRAMES"
jam get console "$ID" --level error --json
jam get network "$ID" --status 4xx --json
jam get network "$ID" --status 5xx --json
jam get user-events "$ID" --json
```

A fresh Jam answers "Captions are not available for this video" (exit 4)
until it is transcribed. Wait 60 seconds and retry, up to five times. With
the mic off, that answer is final.

Once the user says yes to posting on the Jam:

```bash
cat > "$FRAMES/comment.md" <<'EOF'
9 of 11 done. T4 deferred: ...
EOF
jam create comment "$ID" "$(cat "$FRAMES/comment.md")" --at 14220
jam update jam "$ID" --resource <url>
```

Quotes from the transcript often hold `$` or backticks, which a double-quoted
shell string would expand; pass the body from a file as above.

Paginated reads return `nextCursor`; pass it as `--after`. `jam agent-context`
prints every command and flag.
