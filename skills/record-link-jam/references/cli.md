# Recording Links with the Jam CLI

Use this alternative when Jam MCP is unavailable and the CLI is installed.
Run `command -v jam`; if missing, try `export PATH="$HOME/.local/bin:$PATH"`
and check again. If still missing, ask the user to install from
https://jam.dev/cli. Do not install it yourself. Run `jam doctor` to check
sign-in. If needed, ask the user to run `jam auth login`, or set `JAM_TOKEN`
as a secret in a headless environment. Never write a token to a file.

```bash
jam recording-links urls
jam recording-links create --name "Show checkout working" --jam-title "Checkout proof" --reference "TASK-123" --expires-at "<ISO8601 timestamp two hours from now>" --recording-url-id "<verified domain id>" --json
jam --json recording-links jams <publicId>
jam get jam <id>
jam get comments <id>
jam recording-links delete <publicId> --yes
```

Omit `--recording-url-id` knowingly for video without console or network.
Open the returned `url` unchanged and follow the browser recording steps.
Use the same bounded backoff: 15 seconds, 30 seconds, then at most 60 seconds
between calls, stopping after 10 minutes. The CLI list response uses
`{items:[{id,title,createdAt}],nextCursor}`. Follow `nextCursor` with
`--after <cursor>`. Do not treat API errors as empty submissions.
Delete the link created in this run when done, never a pre-existing link or
Jam. Share `https://jam.dev/c/<id>`. `jam agent-context` lists shipped commands.
