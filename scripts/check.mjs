#!/usr/bin/env node
// Repo checks run by CI. Prints every failure, exits 1 if any.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { parseArgs, stripVTControlCharacters } from "node:util";
import { isMap, parseDocument } from "yaml";

const errors = [];
const fail = (msg) => errors.push(msg);
const read = (p) => readFileSync(p, "utf8");
const { values } = parseArgs({ options: { "skills-list": { type: "string" } } });
const mdFiles = [...new Set(execFileSync("git", ["ls-files", "-coz", "--exclude-standard", "--", "*.md", "*.mdc"], { encoding: "utf8" }).split("\0"))].filter((file) => file && existsSync(file));

// Skills
const readme = read("README.md");
const skillDirs = readdirSync("skills", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
let feedbackSection;
for (const dir of skillDirs) {
  const skillPath = join("skills", dir, "SKILL.md");
  if (!existsSync(skillPath)) {
    fail(`${dir}: missing SKILL.md`);
    continue;
  }
  const src = read(skillPath);
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!fm) {
    fail(`${skillPath}: missing frontmatter`);
    continue;
  }
  const frontmatter = parseDocument(fm[1], { uniqueKeys: true });
  if (frontmatter.errors.length) {
    for (const error of frontmatter.errors) fail(`${skillPath}: invalid YAML: ${error.message}`);
    continue;
  }
  if (!isMap(frontmatter.contents)) {
    fail(`${skillPath}: frontmatter must be a YAML mapping`);
    continue;
  }
  const name = frontmatter.get("name");
  const description = frontmatter.get("description");
  if (typeof name !== "string") fail(`${skillPath}: name must be a string`);
  else if (name !== dir) fail(`${skillPath}: name "${name}" must equal folder "${dir}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(dir)) fail(`${dir}: folder must be kebab-case`);
  if (typeof description !== "string" || !description.trim()) fail(`${skillPath}: description must be a non-empty string`);
  else {
    const descriptionNode = frontmatter.get("description", true);
    const rawDescription = fm[1].slice(descriptionNode.range[0], descriptionNode.range[1]);
    if (/[\r\n]/.test(rawDescription) || /[\r\n]/.test(description)) fail(`${skillPath}: write the description on one line`);
    if (description.length > 1024) fail(`${skillPath}: description is ${description.length} chars, max 1024`);
  }
  if (!existsSync(join("skills", dir, "agents", "openai.yaml"))) fail(`${dir}: missing agents/openai.yaml`);
  if (!readme.includes(`- [${dir}](./skills/${dir}/SKILL.md): `)) fail(`${dir}: missing "- [${dir}](./skills/${dir}/SKILL.md): " entry in README.md`);
  if (dir.split("-").includes("jam")) {
    const feedback = src.match(/\n## Send feedback to Jam\n[\s\S]*?(?=\n## |$)/)?.[0];
    if (!feedback) fail(`${skillPath}: missing "## Send feedback to Jam" section; copy it from another Jam skill`);
    else if ((feedbackSection ??= feedback) !== feedback) fail(`${skillPath}: "## Send feedback to Jam" differs from the other Jam skills`);
  } else {
    // Count prose only: `jam create jam` in a "With Jam" line is one mention, not three.
    const prose = src.slice(fm[0].length).replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
    const mentions = prose.match(/\bjam\b/gi)?.length ?? 0;
    if (mentions > 1) fail(`${skillPath}: mentions Jam ${mentions} times; skills without jam in their name may mention it once`);
  }
}

// The jam router names every other skill, and only skills that exist.
if (skillDirs.includes("jam")) {
  const routed = new Set([...read("skills/jam/SKILL.md").matchAll(/^\|.*\| `([a-z0-9-]+)` \|$/gm)].map((m) => m[1]));
  for (const dir of skillDirs) if (dir !== "jam" && !routed.has(dir)) fail(`skills/jam/SKILL.md: routing table does not name ${dir}`);
  for (const name of routed) if (!skillDirs.includes(name)) fail(`skills/jam/SKILL.md: routing table names missing skill ${name}`);
}

// The CLI install block is copied into every skill that runs `jam`; keep the copies identical.
const setupBlocks = new Map();
for (const file of mdFiles.filter((file) => file.startsWith("skills/") && file.endsWith(".md"))) {
  const block = read(file).match(/```bash\n[^`]*jam is not installed[^`]*```/)?.[0];
  if (block) setupBlocks.set(file, block);
}
if (new Set(setupBlocks.values()).size > 1) {
  fail(`CLI install blocks differ across ${[...setupBlocks.keys()].join(", ")}; make them identical`);
}

// Versions. server.json is not here: it carries the Jam MCP server's version, not the plugin's.
const manifests = [
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  "gemini-extension.json",
];
const versions = manifests.map((p) => [p, JSON.parse(read(p)).version]);
if (new Set(versions.map(([, v]) => v)).size !== 1) {
  fail(`versions differ: ${versions.map(([p, v]) => `${p}=${v}`).join(", ")}`);
}

// Relative links in Markdown
for (const file of mdFiles) {
  const text = read(file).replace(/```[\s\S]*?```/g, "");
  const targets = [...text.matchAll(/\]\(([^)\s]+)\)|(?:href|src)="([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  for (const target of targets) {
    if (/^([a-z]+:|#)/i.test(target)) continue;
    const path = join(dirname(file), decodeURI(target.split("#")[0]));
    if (!existsSync(path)) fail(`${file}: broken link ${target}`);
  }
}

if (values["skills-list"]) {
  const output = stripVTControlCharacters(read(values["skills-list"]));
  if (/\bSkipped\b.*SKILL\.md|YAML parse error/i.test(output)) fail("skills CLI skipped a skill; inspect its discovery output");
  const listed = new Set([...output.matchAll(/^│    ([a-z0-9]+(?:-[a-z0-9]+)*)\r?$/gm)].map((match) => match[1]));
  for (const dir of skillDirs) {
    if (!listed.has(dir)) fail(`skills CLI did not list ${dir}`);
  }
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${skillDirs.length} skills, ${mdFiles.length} Markdown files, version ${versions[0][1]}`);
