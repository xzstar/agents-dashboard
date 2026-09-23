#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] || __dirname;
const PORT = process.env.PORT || 3456;

// ---------- YAML frontmatter parser (minimal) ----------
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let val = kv[2].trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      val = val.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      val = val.replace(/^["']|["']$/g, "");
    }
    meta[key] = val;
  }
  return { meta, body: match[2] };
}

// ---------- Minimal markdown → HTML ----------
function mdToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let inCode = false, inList = false;
  for (let raw of lines) {
    let line = raw;
    if (line.trim().startsWith("```")) {
      if (inCode) { out.push("</code></pre>"); inCode = false; }
      else { out.push("<pre><code>"); inCode = true; }
      continue;
    }
    if (inCode) { out.push(esc(line)); continue; }
    // checkbox
    const cb = line.match(/^(\s*)- \[( |x|X)\] (.*)/);
    if (cb) {
      const checked = cb[2].toLowerCase() === "x";
      const indent = Math.floor(cb[1].length / 2);
      if (!inList) { out.push('<ul class="cb-list">'); inList = true; }
      out.push(`<li class="cb ${checked ? "done" : ""}" style="margin-left:${indent}em"><span class="cb-box">${checked ? "✓" : "○"}</span> ${inline(esc(cb[3]))}</li>`);
      continue;
    }
    // regular list
    const li = line.match(/^(\s*)[-*] (.*)/);
    if (li) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(esc(li[2]))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    // headers
    const h = line.match(/^(#{1,4}) (.*)/);
    if (h) {
      out.push(`<h${h[1].length + 1}>${inline(esc(h[2]))}</h${h[1].length + 1}>`);
      continue;
    }
    if (line.trim() === "") continue;
    out.push(`<p>${inline(esc(line))}</p>`);
  }
  if (inList) out.push("</ul>");
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

// ---------- Tasks parser ----------
function parseTasks(content) {
  const sections = { todo: [], "in-progress": [], done: [] };
  let current = null;
  for (const raw of content.split("\n")) {
    const h = raw.match(/^## (.*)/);
    if (h) {
      const t = h[1].trim().toLowerCase();
      if (t.includes("todo") || t.includes("to do")) current = "todo";
      else if (t.includes("progress")) current = "in-progress";
      else if (t.includes("done") || t.includes("完成")) current = "done";
      else current = null;
      continue;
    }
    if (!current) continue;
    const item = raw.match(/^\s*-\s\[( |x|X)\]\s(.*)/);
    if (item) sections[current].push(item[2].trim());
  }
  return sections;
}

function parseChangelog(content) {
  const entries = [];
  let current = null;
  for (const raw of content.split("\n")) {
    const h = raw.match(/^## (.*)/);
    if (h) {
      current = { date: h[1].trim(), items: [] };
      entries.push(current);
      continue;
    }
    const cb = raw.match(/^\s*-\s\[( |x|X)\]\s(.*)/);
    const plain = raw.match(/^\s*-\s(.*)/);
    const text = cb ? cb[2].trim() : plain ? plain[1].trim() : null;
    if (text && current) current.items.push(text);
  }
  return entries;
}

function findProjectDir(name, root, depth = 0) {
  if (depth > 3) return null;
  const dashDir = path.join(root, ".dashboard");
  if (fs.existsSync(dashDir) && fs.statSync(dashDir).isDirectory()) {
    const statusPath = path.join(dashDir, "status.md");
    if (fs.existsSync(statusPath)) {
      const { meta } = parseFrontmatter(fs.readFileSync(statusPath, "utf-8"));
      if ((meta.project || path.basename(root)) === name) return root;
    }
  }
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const found = findProjectDir(name, path.join(root, entry.name), depth + 1);
      if (found) return found;
    }
  } catch {}
  return null;
}

function writeTasks(tasksPath, sections) {
  const labels = { todo: "Todo", "in-progress": "In Progress", done: "Done" };
  let out = "# Tasks\n\n";
  for (const key of ["todo", "in-progress", "done"]) {
    out += `## ${labels[key]}\n\n`;
    for (const text of sections[key]) {
      out += `- [${key === "done" ? "x" : " "}] ${text}\n`;
    }
    out += "\n";
  }
  fs.writeFileSync(tasksPath, out);
}

// ---------- Project scanner ----------
function scanProjects(root, depth = 0) {
  if (depth > 3) return [];
  const results = [];
  const dashDir = path.join(root, ".dashboard");
  if (fs.existsSync(dashDir) && fs.statSync(dashDir).isDirectory()) {
    const statusPath = path.join(dashDir, "status.md");
    if (fs.existsSync(statusPath)) {
      const statusRaw = fs.readFileSync(statusPath, "utf-8");
      const { meta, body } = parseFrontmatter(statusRaw);
      const tasksPath = path.join(dashDir, "tasks.md");
      const changelogPath = path.join(dashDir, "changelog.md");
      const tasksRaw = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, "utf-8") : "";
      const changelogRaw = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, "utf-8") : "";
      results.push({
        path: path.relative(ROOT, root) || ".",
        name: meta.project || path.basename(root),
        meta,
        body: mdToHtml(body),
        tasks: parseTasks(tasksRaw),
        changelog: parseChangelog(changelogRaw),
      });
    }
  }
  // scan subdirectories
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      results.push(...scanProjects(path.join(root, entry.name), depth + 1));
    }
  } catch {}
  return results;
}

// ---------- Server ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/projects") {
    const projects = scanProjects(ROOT);
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
    res.end(JSON.stringify({ root: ROOT, projects, fetchedAt: new Date().toISOString() }));
    return;
  }

  if (url.pathname === "/api/tasks" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const { project, action, status, text, to } = JSON.parse(body);
        const projectDir = findProjectDir(project, ROOT);
        if (!projectDir) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Project not found" })); return; }
        const tasksPath = path.join(projectDir, ".dashboard", "tasks.md");
        const sections = parseTasks(fs.readFileSync(tasksPath, "utf-8"));
        const normalize = s => s.replace(/<[^>]*>/g, "").trim();
        if (action === "add") {
          if (sections[status].some(t => normalize(t) === normalize(text))) {
            res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, deduped: true })); return;
          }
          sections[status].push(text);
        } else if (action === "delete") {
          sections[status] = sections[status].filter(t => t !== text);
        } else if (action === "move") {
          sections[status] = sections[status].filter(t => t !== text);
          if (sections[to].some(t => normalize(t) === normalize(text))) {
            writeTasks(tasksPath, sections);
            res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, deduped: true })); return;
          }
          sections[to].push(text);
        } else {
          res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Unknown action" })); return;
        }
        writeTasks(tasksPath, sections);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // static files
  const filePath = path.join(__dirname, "public", url.pathname === "/" ? "index.html" : url.pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
  console.log(`Scanning root: ${ROOT}`);
});
