import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const checkPath = fileURLToPath(new URL("./check.mjs", import.meta.url));
const skillPath = "skills/sample-skill/SKILL.md";

function fixture(t, frontmatter = "name: sample-skill\ndescription: A useful skill.") {
  const cwd = mkdtempSync(join(tmpdir(), "jam-skills-check-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const write = (path, content) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  write(skillPath, `---\n${frontmatter}\n---\n# Sample skill\n`);
  write("skills/sample-skill/agents/openai.yaml", "interface: {}\n");
  write("README.md", "- [sample-skill](./skills/sample-skill/SKILL.md): x\n");
  for (const file of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", "gemini-extension.json"]) {
    write(file, '{"version":"1.0.0"}\n');
  }
  execFileSync("git", ["init", "--quiet"], { cwd });
  execFileSync("git", ["add", "."], { cwd });
  return {
    cwd,
    write,
    run: (...args) => {
      const result = spawnSync(process.execPath, [checkPath, ...args], { cwd, encoding: "utf8" });
      assert.ifError(result.error);
      return { status: result.status, output: result.stdout + result.stderr };
    },
  };
}

for (const [label, frontmatter, expected] of [
  ["unquoted colon", "name: sample-skill\ndescription: Record proof: publish it.", /invalid YAML/],
  ["empty description", "name: sample-skill\ndescription:", /description must be a non-empty string/],
  ["null description", "name: sample-skill\ndescription: null", /description must be a non-empty string/],
  ["numeric description", "name: sample-skill\ndescription: 42", /description must be a non-empty string/],
  ["boolean description", "name: sample-skill\ndescription: true", /description must be a non-empty string/],
  ["mapping description", "name: sample-skill\ndescription: { value: text }", /description must be a non-empty string/],
  ["sequence description", "name: sample-skill\ndescription: [text]", /description must be a non-empty string/],
  ["whitespace description", 'name: sample-skill\ndescription: "   "', /description must be a non-empty string/],
  ["missing description", "name: sample-skill", /description must be a non-empty string/],
  ["numeric name", "name: 42\ndescription: A useful skill.", /name must be a string/],
  ["duplicate description", "name: sample-skill\ndescription: First.\ndescription: Second.", /invalid YAML/],
  ["sequence frontmatter", "- name: sample-skill\n- description: A useful skill.", /frontmatter must be a YAML mapping/],
  ["block description", "name: sample-skill\ndescription: >-\n  A useful skill.", /description on one line/],
  ["multiline quoted description", 'name: sample-skill\ndescription: "A useful\n  skill."', /description on one line/],
  ["decoded newline", 'name: sample-skill\ndescription: "A useful\\nskill."', /description on one line/],
  ["long description", `name: sample-skill\ndescription: "${"a".repeat(1025)}"`, /description is 1025 chars, max 1024/],
]) {
  test(`rejects ${label}`, (t) => {
    const result = fixture(t, frontmatter).run();
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, expected);
    assert.match(result.output, /skills\/sample-skill\/SKILL.md/);
  });
}

test("accepts quoted colons, quoted names, and optional metadata", (t) => {
  const result = fixture(t, 'name: "sample-skill"\ndescription: "Record proof: publish it."\nlicense: MIT\nmetadata:\n  category: testing').run();
  assert.equal(result.status, 0, result.output);
});

test("measures decoded description length", (t) => {
  const result = fixture(t, `name: sample-skill\ndescription: "${"\\u0061".repeat(1024)}"`).run();
  assert.equal(result.status, 0, result.output);
});

test("checks untracked Markdown links", (t) => {
  const repo = fixture(t);
  repo.write("skills/sample-skill/references/new.md", "[missing](./missing.md)\n");
  const result = repo.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /references\/new.md: broken link \.\/missing.md/);
});

test("ignores deleted tracked Markdown", (t) => {
  const repo = fixture(t);
  repo.write("skills/sample-skill/references/deleted.md", "A removed reference.\n");
  execFileSync("git", ["add", "."], { cwd: repo.cwd });
  rmSync(join(repo.cwd, "skills/sample-skill/references/deleted.md"));
  const result = repo.run();
  assert.equal(result.status, 0, result.output);
});

test("checks untracked CLI install blocks", (t) => {
  const repo = fixture(t);
  for (const [file, path] of [["one.md", "$HOME/.local/bin"], ["two.md", "/usr/local/bin"]]) {
    repo.write(`skills/sample-skill/references/${file}`, `\n\`\`\`bash\ncommand -v jam >/dev/null || echo "jam is not installed"\nexport PATH="${path}:$PATH"\n\`\`\`\n`);
  }
  const result = repo.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /CLI install blocks differ/);
});

for (const [label, output, status, expected] of [
  ["listed skill", "│\n◇  Available Skills\n│\n│    \u001b[36msample-skill\u001b[39m\n│\n│      A useful skill.\n", 0, /✓/],
  ["path only", "⚠ Skipped skills/sample-skill/SKILL.md: YAML parse error\n", 1, /skills CLI did not list sample-skill/],
  ["description only", "│      sample-skill\n", 1, /skills CLI did not list sample-skill/],
  ["longer name", "│    sample-skill-extra\n", 1, /skills CLI did not list sample-skill/],
  ["YAML warning despite listed skill", "⚠ Skipped other/SKILL.md: YAML parse error\n│    sample-skill\n", 1, /skills CLI skipped a skill/],
]) {
  test(`discovery checks ${label}`, (t) => {
    const repo = fixture(t);
    repo.write("skills.txt", output);
    const result = repo.run("--skills-list", "skills.txt");
    assert.equal(result.status, status, result.output);
    assert.match(result.output, expected);
  });
}

const readmeFor = (...names) => names.map((n) => `- [${n}](./skills/${n}/SKILL.md): x\n`).join("");

test("treats jam anywhere in the name as a Jam skill", (t) => {
  const repo = fixture(t);
  repo.write("skills/video-to-jam/SKILL.md", "---\nname: video-to-jam\ndescription: Upload a video as a Jam.\n---\nA Jam, then another Jam.\n");
  repo.write("skills/video-to-jam/agents/openai.yaml", "interface: {}\n");
  repo.write("README.md", readmeFor("sample-skill", "video-to-jam"));
  const result = repo.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /video-to-jam\/SKILL.md: missing "## Send feedback to Jam"/);
  assert.doesNotMatch(result.output, /mentions Jam/);
});

const feedback = "## Send feedback to Jam\n\nTell Jam.\n";
const addSkill = (repo, name, body) => {
  repo.write(`skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: A useful skill.\n---\n${body}`);
  repo.write(`skills/${name}/agents/openai.yaml`, "interface: {}\n");
};

test("passes Jam skills that share the feedback section", (t) => {
  const repo = fixture(t);
  addSkill(repo, "video-to-jam", `A Jam, then another Jam.\n\n${feedback}`);
  addSkill(repo, "jam-fix", `A Jam.\n\n${feedback}`);
  repo.write("README.md", readmeFor("sample-skill", "video-to-jam", "jam-fix"));
  const result = repo.run();
  assert.equal(result.status, 0, result.output);
});

test("fails Jam skills whose feedback sections differ", (t) => {
  const repo = fixture(t);
  addSkill(repo, "video-to-jam", feedback);
  addSkill(repo, "jam-fix", "## Send feedback to Jam\n\nTell Jam something else.\n");
  repo.write("README.md", readmeFor("sample-skill", "video-to-jam", "jam-fix"));
  const result = repo.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /differs from the other Jam skills/);
});

for (const [name, body, status] of [
  ["sample-skill", "With Jam: one line.\n", 0],
  ["sample-skill", "A Jam, then another Jam.\n", 1],
  ["jammer-fix", "A Jam, then another Jam.\n", 1],
]) {
  test(`caps Jam mentions in ${name} at one (${status ? "two" : "one"} mention)`, (t) => {
    const repo = fixture(t);
    if (name === "sample-skill") repo.write(skillPath, `---\nname: sample-skill\ndescription: A useful skill.\n---\n${body}`);
    else addSkill(repo, name, body);
    repo.write("README.md", readmeFor("sample-skill", name));
    const result = repo.run();
    assert.equal(result.status, status, result.output);
    if (status) assert.match(result.output, /mentions Jam 2 times/);
  });
}

test("jam router must name every other skill, and only real ones", (t) => {
  const repo = fixture(t);
  addSkill(repo, "jam", `| wants | Load |\n| --- | --- |\n| a fix | \`jam-fix\` |\n\n${feedback}`);
  repo.write("README.md", readmeFor("sample-skill", "jam"));
  const result = repo.run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /routing table does not name sample-skill/);
  assert.match(result.output, /routing table names missing skill jam-fix/);
});
