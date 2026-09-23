#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 3456;
const BASE = `http://localhost:${PORT}`;
const PROJECT = "Agents Dashboard";
const PROJECT_DIR = path.dirname(new URL(import.meta.url).pathname);
const TASKS_FILE = path.join(PROJECT_DIR, ".dashboard", "tasks.md");
const GOALS_FILE = path.join(PROJECT_DIR, ".dashboard", "goals.md");
const STATUS_FILE = path.join(PROJECT_DIR, ".dashboard", "status.md");

let passed = 0, failed = 0;
const results = [];

function check(name, cond) {
  if (cond) { passed++; results.push(`  ✓ ${name}`); }
  else { failed++; results.push(`  ✗ ${name}`); }
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE}${url}`, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, res => {
      let buf = "";
      res.on("data", c => buf += c);
      res.on("end", () => resolve(JSON.parse(buf)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${url}`, res => {
      let buf = "";
      res.on("data", c => buf += c);
      res.on("end", () => resolve(JSON.parse(buf)));
    }).on("error", reject);
  });
}

function readFile(p) { return fs.readFileSync(p, "utf-8"); }

// ---- Start ----
console.log("\n🧪 Agents Dashboard Tests\n");

try {
  // Test 1: Server is running
  const api = await get("/api/projects");
  check("Server responds /api/projects", Array.isArray(api.projects));

  // Test 2: Data integrity - tasks.md parses correctly
  const tasksContent = readFile(TASKS_FILE);
  check("tasks.md has ## Todo section", tasksContent.includes("## Todo"));
  check("tasks.md has ## In Progress section", tasksContent.includes("## In Progress"));
  check("tasks.md has ## Done section", tasksContent.includes("## Done"));

  // Test 3: Goals file parses
  const goalsContent = readFile(GOALS_FILE);
  check("goals.md exists and has content", goalsContent.includes("# Goals"));

  // Test 4: Status file has description
  const statusContent = readFile(STATUS_FILE);
  check("status.md has description field", statusContent.includes("description:"));

  // Test 5: API returns structured tasks
  const agentsProj = api.projects.find(p => p.name === PROJECT);
  check("API returns Agents Dashboard project", !!agentsProj);
  check("API tasks has todo/in-progress/done arrays", agentsProj && typeof agentsProj.tasks === "object" && Array.isArray(agentsProj.tasks.todo));
  check("API goals is an array", agentsProj && Array.isArray(agentsProj.goals));
  check("API changelog is an array", agentsProj && Array.isArray(agentsProj.changelog));

  // Test 6: Add task
  const beforeCount = (agentsProj?.tasks?.todo || []).length;
  await post("/api/tasks", { project: PROJECT, action: "add", status: "todo", text: "__test_add__" });
  const afterAdd = await get("/api/projects");
  const afterAddProj = afterAdd.projects.find(p => p.name === PROJECT);
  check("Add task increases todo count", (afterAddProj?.tasks?.todo || []).length === beforeCount + 1);

  // Test 7: Duplicate add is deduped
  await post("/api/tasks", { project: PROJECT, action: "add", status: "todo", text: "__test_add__" });
  const afterDup = await get("/api/projects");
  const afterDupProj = afterDup.projects.find(p => p.name === PROJECT);
  check("Duplicate add is deduped", (afterDupProj?.tasks?.todo || []).length === beforeCount + 1);

  // Test 8: Edit task text
  await post("/api/task-text", { project: PROJECT, status: "todo", oldText: "__test_add__", newText: "__test_edited__" });
  const afterEdit = await get("/api/projects");
  const afterEditProj = afterEdit.projects.find(p => p.name === PROJECT);
  check("Edit task text works", (afterEditProj?.tasks?.todo || []).includes("__test_edited__"));

  // Test 9: Move task
  await post("/api/tasks", { project: PROJECT, action: "move", status: "todo", to: "done", text: "__test_edited__" });
  const afterMove = await get("/api/projects");
  const afterMoveProj = afterMove.projects.find(p => p.name === PROJECT);
  check("Move task to done works", (afterMoveProj?.tasks?.done || []).includes("__test_edited__"));

  // Test 10: Delete task
  await post("/api/tasks", { project: PROJECT, action: "delete", status: "done", text: "__test_edited__" });
  const afterDelete = await get("/api/projects");
  const afterDeleteProj = afterDelete.projects.find(p => p.name === PROJECT);
  check("Delete task works", !(afterDeleteProj?.tasks?.done || []).includes("__test_edited__"));

  // Test 11: Data integrity - Done tasks count unchanged after add/edit/move/delete cycle
  const doneCount = (agentsProj?.tasks?.done || []).length;
  const afterCycle = await get("/api/projects");
  const afterCycleProj = afterCycle.projects.find(p => p.name === PROJECT);
  check("Done count unchanged after test cycle", (afterCycleProj?.tasks?.done || []).length === doneCount);

  // Test 12: Goals toggle
  const goals = afterCycleProj?.goals || [];
  const firstGoal = goals[0];
  if (firstGoal) {
    await post("/api/goals", { project: PROJECT, text: firstGoal.text, done: !firstGoal.done });
    const afterToggle = await get("/api/projects");
    const afterToggleProj = afterToggle.projects.find(p => p.name === PROJECT);
    const toggledGoal = (afterToggleProj?.goals || []).find(g => g.text === firstGoal.text);
    check("Goal toggle works", toggledGoal && toggledGoal.done === !firstGoal.done);
    // Restore
    await post("/api/goals", { project: PROJECT, text: firstGoal.text, done: firstGoal.done });
  }

  // Test 13: Goals add/delete
  await post("/api/goals", { project: PROJECT, action: "add", text: "__test_goal__" });
  const afterGoalAdd = await get("/api/projects");
  const afterGoalAddProj = afterGoalAdd.projects.find(p => p.name === PROJECT);
  check("Goal add works", (afterGoalAddProj?.goals || []).some(g => g.text === "__test_goal__"));
  await post("/api/goals", { project: PROJECT, action: "delete", text: "__test_goal__" });
  const afterGoalDel = await get("/api/projects");
  const afterGoalDelProj = afterGoalDel.projects.find(p => p.name === PROJECT);
  check("Goal delete works", !(afterGoalDelProj?.goals || []).some(g => g.text === "__test_goal__"));

  // Test 14: Description update
  const origDesc = afterCycleProj?.meta?.description;
  await post("/api/description", { project: PROJECT, description: "__test_desc__" });
  const afterDesc = await get("/api/projects");
  const afterDescProj = afterDesc.projects.find(p => p.name === PROJECT);
  check("Description update works", afterDescProj?.meta?.description === "__test_desc__");
  // Restore
  await post("/api/description", { project: PROJECT, description: origDesc || "" });

  // Test 15: File integrity after all operations
  const finalTasks = readFile(TASKS_FILE);
  check("tasks.md still valid Markdown", finalTasks.includes("## Todo") && finalTasks.includes("## Done"));
  const finalGoals = readFile(GOALS_FILE);
  check("goals.md still valid", finalGoals.includes("# Goals"));
  check("No test artifacts remain in tasks.md", !finalTasks.includes("__test_"));
  check("No test artifacts remain in goals.md", !finalGoals.includes("__test_"));

  // Test 16: Agent unified API - add + complete task
  await post("/api/agent-update", { project: PROJECT, action: "add_task", status: "todo", text: "__agent_test_task__" });
  const agentAdd = await get("/api/projects");
  const agentAddProj = agentAdd.projects.find(p => p.name === PROJECT);
  check("agent-update add_task works", (agentAddProj?.tasks?.todo || []).includes("__agent_test_task__"));
  await post("/api/agent-update", { project: PROJECT, action: "complete_task", text: "__agent_test_task__" });
  const agentComplete = await get("/api/projects");
  const agentCompleteProj = agentComplete.projects.find(p => p.name === PROJECT);
  check("agent-update complete_task moves to done", (agentCompleteProj?.tasks?.done || []).includes("__agent_test_task__"));
  check("agent-update writes changelog", readFile(path.join(PROJECT_DIR, ".dashboard", "changelog.md")).includes("complete task"));

  // Test 17: Agent unified API - status update
  await post("/api/agent-update", { project: PROJECT, action: "", summary: "__agent_test_summary__", stage: "active" });
  const agentStatus = await get("/api/projects");
  const agentStatusProj = agentStatus.projects.find(p => p.name === PROJECT);
  check("agent-update summary works", agentStatusProj?.meta?.summary === "__agent_test_summary__");

  // Test 18: Cleanup agent test artifacts
  await post("/api/agent-update", { project: PROJECT, action: "delete_task", status: "done", text: "__agent_test_task__" });
  const agentCleanup = readFile(TASKS_FILE);
  check("No agent test artifacts remain", !agentCleanup.includes("__agent_test_"));

} catch (e) {
  failed++;
  results.push(`  ✗ Unexpected error: ${e.message}`);
}

console.log(results.join("\n"));
console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
