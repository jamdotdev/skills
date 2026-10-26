import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("ChatGPT package carries only the MCP-only skills and says so", () => {
  const dir = mkdtempSync(join(tmpdir(), "jam-chatgpt-test-"));
  const archive = join(dir, "jam.zip");
  execFileSync("node", ["scripts/package-chatgpt.mjs", archive]);
  const files = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" }).trim().split("\n");
  assert.ok(files.includes("jam/skills/jam-fix/SKILL.md"));
  assert.ok(files.includes("jam/skills/jam-to-e2e/SKILL.md"));
  assert.ok(!files.some((f) => /jam-proof|jam-annotate|references/.test(f)));
  const packaged = [...new Set(files.map((f) => f.match(/^jam\/skills\/([^/]+)\//)?.[1]).filter(Boolean))].sort();
  // Read SKILLS as text: importing the script would run it.
  const SKILLS = JSON.parse(readFileSync("scripts/package-chatgpt.mjs", "utf8").match(/export const SKILLS = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(packaged, [...SKILLS].sort(), "the package must hold exactly SKILLS");
  for (const skill of ["jam-fix", "jam-to-e2e"]) {
    const md = execFileSync("unzip", ["-p", archive, `jam/skills/${skill}/SKILL.md`], { encoding: "utf8" });
    assert.doesNotMatch(md, /\]\(references\//, `${skill} still links to references/ inside the package`);
  }
  const manifest = JSON.parse(execFileSync("unzip", ["-p", archive, "jam/.codex-plugin/plugin.json"], { encoding: "utf8" }));
  assert.doesNotMatch(manifest.description, /proof|screenshot|annotat/);
  assert.equal(manifest.interface.longDescription, manifest.description);
  rmSync(dir, { recursive: true, force: true });
});
