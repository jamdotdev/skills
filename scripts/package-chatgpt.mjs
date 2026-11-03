#!/usr/bin/env node
// Builds the ChatGPT directory package: the MCP-only skills plus the plugin identity,
// with the listing copy rewritten to name only what is inside. Needs `zip` on PATH.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SKILLS = ["jam", "jam-fix", "jam-to-e2e", "jam-to-tasks", "jam-to-ticket"];
export const SHORT_DESCRIPTION_MAX = 30;
export const SHORT_DESCRIPTION = "Debug and test from Jam links";
export const DESCRIPTION = "Jam recordings (video, console, network, logs) as context for ChatGPT. Find the root cause of a bug from a Jam, turn a Jam into an end-to-end test, list every change someone asked for in a narrated Jam, or file a Jam as a ticket.";
const MCP_URL = "https://mcp.jam.dev/mcp";

export const mcpVersion = () => JSON.parse(readFileSync("server.json", "utf8")).version;

/** Codex/Claude `.mcp.json`: same Jam URL as Cursor `mcp.json`, with `type` so plugin validate accepts it. */
export function codexMcpConfig(mcp = JSON.parse(readFileSync("mcp.json", "utf8"))) {
  const url = mcp.mcpServers?.Jam?.url;
  if (typeof url !== "string" || !url) throw new Error("mcp.json is missing mcpServers.Jam.url");
  return { mcpServers: { Jam: { type: "http", url } } };
}

export const codexMcpJson = (mcp) => JSON.stringify(codexMcpConfig(mcp), null, 2) + "\n";

const gitHead = () => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

export function releaseNotes(version = mcpVersion(), commit = gitHead()) {
  const skills = SKILLS.join(", ");
  const from = commit ? ` from jamdotdev/skills@${commit}` : "";
  return `Jam ChatGPT/Codex plugin ${version}: ${skills}${from}. Treats Jam content as evidence not instructions. MCP at ${MCP_URL}.`;
}

export function packageChatgpt(output) {
  if (SHORT_DESCRIPTION.length > SHORT_DESCRIPTION_MAX) {
    throw new Error(`shortDescription is ${SHORT_DESCRIPTION.length} chars, max ${SHORT_DESCRIPTION_MAX}`);
  }

  const version = mcpVersion();
  const stage = mkdtempSync(join(tmpdir(), "jam-chatgpt-"));
  const root = join(stage, "jam");
  mkdirSync(root, { recursive: true });
  for (const path of [".codex-plugin", "assets", "LICENSE"]) cpSync(path, join(root, path), { recursive: true });
  writeFileSync(join(root, ".mcp.json"), codexMcpJson());
  for (const skill of SKILLS) {
    // The package has no references/; point those links at the repo instead.
    const skillMd = readFileSync(join("skills", skill, "SKILL.md"), "utf8")
      .replaceAll("](references/", `](https://github.com/jamdotdev/skills/blob/master/skills/${skill}/references/`);
    mkdirSync(join(root, "skills", skill), { recursive: true });
    writeFileSync(join(root, "skills", skill, "SKILL.md"), skillMd);
    cpSync(join("skills", skill, "agents"), join(root, "skills", skill, "agents"), { recursive: true });
  }

  const manifest = JSON.parse(readFileSync(".codex-plugin/plugin.json", "utf8"));
  manifest.version = version;
  manifest.description = DESCRIPTION;
  manifest.mcpServers = "./.mcp.json";
  manifest.interface.shortDescription = SHORT_DESCRIPTION;
  manifest.interface.longDescription = DESCRIPTION;
  manifest.extensions = {
    ...manifest.extensions,
    "com.openai": {
      ...manifest.extensions?.["com.openai"],
      publication: {
        ...manifest.extensions?.["com.openai"]?.publication,
        release_notes: releaseNotes(version),
      },
    },
  };
  writeFileSync(join(root, ".codex-plugin/plugin.json"), JSON.stringify(manifest, null, 2) + "\n");

  rmSync(output, { force: true });
  execFileSync("zip", ["-qr", output, "jam"], { cwd: stage });
  rmSync(stage, { recursive: true, force: true });
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(process.argv[2] ?? "");
  if (!output.endsWith(".zip")) {
    console.error("Usage: node scripts/package-chatgpt.mjs <output.zip>");
    process.exit(1);
  }
  console.log(packageChatgpt(output));
}
