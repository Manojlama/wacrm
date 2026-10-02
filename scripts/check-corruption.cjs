// Pre-commit / lint guard: fails when source files carry encoding
// corruption produced by tools that rewrite files through a broken
// encoding pipeline. This repo suffered recurring corruption in
// src/app/(marketing)/layout.tsx (ReactNode -> Re©tNode, em-dash ->
// â€”), so every commit + `npm run lint` runs this scan.
const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const ROOTS = ["src", "messages"];
const EXCLUDED_DIRS = new Set(["node_modules", ".next", ".git", ".turbo"]);

// Mojibake sequences = the bytes of a multi-byte UTF-8 char, re-read as
// single-byte Latin-1. A literal © appears when lowercase letters get
// mangled by an encoding pass. None of these appear in the real source.
const BAD_PATTERNS = [
  /\u00a9/, // ©
  /â€/, // UTF-8 misread as Latin-1 (â€”, â€™, â€œ, …)
  /\u00c3[\u00a9\u00a4\u00ab\u00bc\u00b1\u00bf\u00b8\u00b6\u00b7]/, // Ã© Ã¤ Ã« Ã¼ Ã± Ã¸ Ã¶ Ã·
  /Ã©/, // misread é
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

let failed = false;

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const buf = fs.readFileSync(file);
    // Strict UTF-8 decode — a valid file must decode without loss.
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      console.error(`CORRUPT: ${file} is not valid UTF-8`);
      failed = true;
      continue;
    }
    for (const re of BAD_PATTERNS) {
      if (re.test(text)) {
        console.error(`CORRUPT: ${file} matches ${re}`);
        failed = true;
      }
    }
  }
}

if (failed) {
  console.error("");
  console.error("Refusing to continue: source file(s) carry encoding corruption.");
  console.error("Restore from git before committing, e.g. `git restore <file>`.");
  process.exit(1);
}