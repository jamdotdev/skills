# Jam plugin and MCP server

The plugin connects your coding agent to the Jam MCP server at `https://mcp.jam.dev/mcp` and installs the skills in this repository. Install commands are in the [README](../README.md#install-as-a-plugin). The canonical, always current MCP reference is [jam.dev/mcp](https://jam.dev/mcp); this page is a snapshot and can lag behind it.

## Sign in

### OAuth

The plugin connects to `https://mcp.jam.dev/mcp`. Your agent prompts you to sign in to Jam in a browser during installation or when you first use a Jam tool. There is nothing else to set up.

### Personal access token

Use a token when a browser sign-in isn't possible, such as in CI or a headless environment.

1. Create a token in [**Settings → MCP**](https://jam.dev/s/settings/mcp) under **Personal Access Tokens**. Copy it right away, because Jam stores only a hash.
2. Add a `headers` block to the Jam server entry in your agent's MCP config. In Cursor, the file is `mcp.json`:

```json
{
  "mcpServers": {
    "Jam": {
      "url": "https://mcp.jam.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_PERSONAL_ACCESS_TOKEN"
      }
    }
  }
}
```

Each token works in one workspace, belongs to your account, and expires after seven days, 30 days, 90 days, or one year. You pick the length when you create it. See [Personal access tokens](https://jam.dev/docs/personal-access-tokens) for details.

## Check that it works

1. Confirm **Jam** is in your agent's list of MCP servers. In Cursor, open **Customize**. In Claude Code, Codex, or Gemini CLI, run `/mcp`. In GitHub Copilot CLI, run `copilot mcp list`.
2. Paste a Jam link into the chat and ask the agent to analyze it. Complete the browser sign-in if prompted.
3. Ask the agent to fix a Jam, such as `https://jam.dev/c/<id>`. The `jam-fix` skill runs.

## What the server can do

The full, current tool list is at [jam.dev/mcp](https://jam.dev/mcp); each tool also describes itself to your agent.

- **Read:** a Jam's details, console logs, network requests, user events, screenshots, video frames, transcript, chapters and custom metadata. Search Jams across your workspace.
- **Write:** comments and reactions, folders, Jam titles and descriptions, resources (links to a pull request, CI run or doc) and relations between Jams, Recording Links, and feedback to the Jam team.
- **Delete, for good:** `deleteJam`, `deleteComment` and `deleteFolder`. Jam has no trash, so nobody in your workspace can bring the data back. The bundled Cursor rule tells the agent to ask you first; other agents ask before tools the server marks as destructive.

A Recording Link captures console and network logs only when it starts on a verified connected domain.

## Privacy and permissions

- The plugin connects only to `https://mcp.jam.dev/mcp`.
- The OAuth scopes are `mcp:read` and `mcp:write`. Every tool that reads a Jam or the workspace needs `mcp:read`. Tools that change something need `mcp:write`: comments, reactions, folders, `updateJam`, resources and relations, the Recording Link tools that make changes, and the three `delete*` tools. The one exception is `submitFeedback`: it writes only to Jam's own feedback store, so it needs `mcp:read`.
- The server also checks your permissions for each workspace and each Jam on every call.
- Every request sees only the Jams your account can already see.
- `createFolder` and `createRecordingLink` can upgrade you from Viewer to Creator when your workspace allows it. That can change seat billing and sends an email to workspace Admins. `createRecordingLink` also sends a webhook event to your workspace's webhook subscribers.
