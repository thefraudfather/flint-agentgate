import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const failures = [];

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root },
)
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const requiredFiles = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "TRADEMARKS.md",
  "CONTRIBUTING.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/ARCHITECTURE.md",
  "docs/ASSESSMENT-CONTRACT.md",
  "docs/DEMO-SCRIPT.md",
  "docs/RELEASE-CHECKLIST.md",
  "docs/SUBMISSION.md",
  ".github/workflows/ci.yml",
  "vercel.json",
];

for (const path of requiredFiles) {
  if (!files.includes(path) && !existsSync(join(root, path))) {
    failures.push(`Missing required public-release file: ${path}`);
  }
}

for (const path of files) {
  if (/(^|\/)\.env(?:\.|$)/.test(path)) {
    failures.push(`Environment file must not be published: ${path}`);
  }
}

const secretPatterns = [
  ["private-key material", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub personal access token", /\bghp_[A-Za-z0-9]{30,}\b/],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ["OpenAI-style secret key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
];

const privateReferencePatterns = [
  ["local user path", /\/Users\//],
  ["private Notion URL", /https?:\/\/(?:www\.)?notion\.(?:so|site)\//i],
  ["private clearance reference", /\bTS\/SCI\b/i],
  ["private customer conversation", /\bBank of America\b/i],
  ["private contact reference", /\bValentin\b/i],
];

const likelyTextExtensions = new Set([
  "", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".toml",
  ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);

for (const path of files) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath) || !statSync(fullPath).isFile() || !likelyTextExtensions.has(extname(path))) continue;
  const content = readFileSync(fullPath, "utf8");
  if (content.includes("\0")) continue;
  const patterns = path === "scripts/release-check.mjs" ? secretPatterns : [...secretPatterns, ...privateReferencePatterns];
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) failures.push(`${label} found in ${path}`);
  }
}

const webMcpPath = join(root, "src/webmcp/conditionalGateway.ts");
if (!existsSync(webMcpPath) || !readFileSync(webMcpPath, "utf8").includes("document.modelContext.registerTool")) {
  failures.push("Native document.modelContext.registerTool registration path is missing.");
}

const distPath = join(root, "dist");
if (existsSync(distPath)) {
  const pending = [distPath];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) pending.push(path);
      else if (path.endsWith(".map")) failures.push(`Public source map found: ${relative(root, path)}`);
    }
  }
}

if (failures.length) {
  console.error("Release scan failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Release scan passed: ${files.length} candidate files, required notices present, no strong secret or private-reference patterns, native WebMCP path present, and no public source maps.`);
