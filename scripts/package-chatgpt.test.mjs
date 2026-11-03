import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  DESCRIPTION,
  SKILLS,
  SHORT_DESCRIPTION,
  SHORT_DESCRIPTION_MAX,
  mcpVersion,
  packageChatgpt,
  releaseNotes,
} from "./package-chatgpt.mjs";

test("ChatGPT short description fits OpenAI's 30-character submission limit", () => {
  assert.equal(SHORT_DESCRIPTION, "Debug and test from Jam links");
  assert.ok(SHORT_DESCRIPTION.length <= SHORT_DESCRIPTION_MAX, `${SHORT_DESCRIPTION.length} chars`);
  assert.doesNotMatch(SHORT_DESCRIPTION, /[\r\n]/);
});

test("ChatGPT package version tracks the Jam MCP server", () => {
  assert.equal(mcpVersion(), JSON.parse(readFileSync("server.json", "utf8")).version);
  assert.match(mcpVersion(), /^\d+\.\d+\.\d+/);
});

test("ChatGPT package carries only the MCP-only skills and says so", () => {
  const dir = mkdtempSync(join(tmpdir(), "jam-chatgpt-test-"));
  const archive = join(dir, "jam.zip");
  packageChatgpt(archive);
  const files = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" }).trim().split("\n");
  for (const skill of SKILLS) {
    assert.ok(files.includes(`jam/skills/${skill}/SKILL.md`), `missing ${skill}`);
  }
  assert.ok(files.includes("jam/.mcp.json"));
  assert.ok(!files.includes("jam/mcp.json"));
  assert.ok(!files.some((f) => /jam-proof|jam-annotate|jam-setup|video-to-jam|record-demo|record-terminal-proof|add-voiceover|jam-proof-table|references/.test(f)));
  const packaged = [...new Set(files.map((f) => f.match(/^jam\/skills\/([^/]+)\//)?.[1]).filter(Boolean))].sort();
  assert.deepEqual(packaged, [...SKILLS].sort(), "the package must hold exactly SKILLS");
  for (const skill of SKILLS) {
    const md = execFileSync("unzip", ["-p", archive, `jam/skills/${skill}/SKILL.md`], { encoding: "utf8" });
    assert.doesNotMatch(md, /\]\(references\//, `${skill} still links to references/ inside the package`);
  }
  const manifest = JSON.parse(execFileSync("unzip", ["-p", archive, "jam/.codex-plugin/plugin.json"], { encoding: "utf8" }));
  const version = mcpVersion();
  assert.equal(manifest.version, version);
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal(manifest.interface.shortDescription, SHORT_DESCRIPTION);
  assert.ok(manifest.interface.shortDescription.length <= SHORT_DESCRIPTION_MAX);
  assert.equal(manifest.description, DESCRIPTION);
  assert.equal(
    manifest.description,
    "Jam recordings (video, console, network, logs) as context for ChatGPT. Find the root cause of a bug from a Jam, turn a Jam into an end-to-end test, list every change someone asked for in a narrated Jam, or file a Jam as a ticket.",
  );
  assert.doesNotMatch(manifest.description, /proof|screenshot|annotat/);
  assert.equal(manifest.interface.longDescription, manifest.description);
  const notes = manifest.extensions?.["com.openai"]?.publication?.release_notes;
  assert.equal(notes, releaseNotes(version));
  assert.match(notes, /jam, jam-fix, jam-to-e2e, jam-to-tasks, jam-to-ticket/);
  assert.match(notes, /https:\/\/mcp\.jam\.dev\/mcp/);
  const mcp = JSON.parse(execFileSync("unzip", ["-p", archive, "jam/.mcp.json"], { encoding: "utf8" }));
  assert.equal(mcp.mcpServers.Jam.url, "https://mcp.jam.dev/mcp");
  rmSync(dir, { recursive: true, force: true });
});
