import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const agentsPath = path.resolve(root, "AGENTS.md");
const claudePath = path.resolve(root, "CLAUDE.md");

function guidePath(candidate) {
  if (typeof candidate !== "string") return null;
  const resolved = path.resolve(root, candidate);
  return resolved === agentsPath || resolved === claudePath ? resolved : null;
}

function stringsIn(value, results = []) {
  if (typeof value === "string") results.push(value);
  else if (Array.isArray(value)) value.forEach(item => stringsIn(item, results));
  else if (value && typeof value === "object") Object.values(value).forEach(item => stringsIn(item, results));
  return results;
}

async function readEvent() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try { return raw.trim() ? JSON.parse(raw) : {}; } catch { return {}; }
}

const explicitSource = guidePath(process.argv[2]);
const event = explicitSource ? {} : await readEvent();
const source = explicitSource || stringsIn(event).map(guidePath).find(Boolean);

if (source && fs.existsSync(source)) {
  const destination = source === agentsPath ? claudePath : agentsPath;
  const sourceContent = fs.readFileSync(source);
  const destinationContent = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
  if (!destinationContent || !sourceContent.equals(destinationContent)) fs.copyFileSync(source, destination);
}

process.stdout.write("{}\n");
