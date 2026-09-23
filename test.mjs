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

  // Test 9b: Move task back (reverse direction)
  await post("/api/tasks", { project: PROJECT, action: "move", status: "done", to: "todo", text: "__test_edited__" });
  const afterMoveBack = await get("/api/projects");
  const afterMoveBackProj = afterMoveBack.projects.find(p => p.name === PROJECT);
  check("Move task back to todo works", (afterMoveBackProj?.tasks?.todo || []).includes("__test_edited__"));

  // Test 9c: Clean up moved-back task
  await post("/api/tasks", { project: PROJECT, action: "delete", status: "todo", text: "__test_edited__" });

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

  // Test 19: Drag & drop fix - verify move API works reliably (backend for drag&drop)
  await post("/api/tasks", { project: PROJECT, action: "add", status: "todo", text: "__drag_test__" });
  const dragTestAdd = await get("/api/projects");
  const dragTestAddProj = dragTestAdd.projects.find(p => p.name === PROJECT);
  check("Drag test: task added to todo", (dragTestAddProj?.tasks?.todo || []).includes("__drag_test__"));
  await post("/api/tasks", { project: PROJECT, action: "move", status: "todo", to: "in-progress", text: "__drag_test__" });
  const dragTestMove = await get("/api/projects");
  const dragTestMoveProj = dragTestMove.projects.find(p => p.name === PROJECT);
  check("Drag test: move todo→in-progress", (dragTestMoveProj?.tasks?.["in-progress"] || []).includes("__drag_test__"));
  await post("/api/tasks", { project: PROJECT, action: "move", status: "in-progress", to: "done", text: "__drag_test__" });
  const dragTestMove2 = await get("/api/projects");
  const dragTestMove2Proj = dragTestMove2.projects.find(p => p.name === PROJECT);
  check("Drag test: move in-progress→done", (dragTestMove2Proj?.tasks?.done || []).includes("__drag_test__"));
  await post("/api/tasks", { project: PROJECT, action: "delete", status: "done", text: "__drag_test__" });

  // Test 20: Goal delete freshness - verify file is immediately updated
  await post("/api/agent-update", { project: PROJECT, action: "add_goal", text: "__goal_fresh_test__" });
  const goalFreshBefore = readFile(GOALS_FILE);
  check("Goal fresh test: goal added to file", goalFreshBefore.includes("__goal_fresh_test__"));
  await post("/api/agent-update", { project: PROJECT, action: "delete_goal", text: "__goal_fresh_test__" });
  const goalFreshAfter = readFile(GOALS_FILE);
  check("Goal fresh test: goal removed from file immediately", !goalFreshAfter.includes("__goal_fresh_test__"));

  // Test 21: Add Task positioning - verify todo section format is maintained
  const todoSection = finalTasks.match(/## Todo\n+([\s\S]*?)\n+## In Progress/);
  check("Todo section format valid for top-positioned Add Task", !!todoSection);

  // Test 22: Task text editing (inline edit API)
  await post("/api/tasks", { project: PROJECT, action: "add", status: "todo", text: "__edit_orig__" });
  await post("/api/task-text", { project: PROJECT, status: "todo", oldText: "__edit_orig__", newText: "__edit_new__" });
  const afterTaskEdit = await get("/api/projects");
  const afterTaskEditProj = afterTaskEdit.projects.find(p => p.name === PROJECT);
  check("Task text edit: old text gone", !(afterTaskEditProj?.tasks?.todo || []).includes("__edit_orig__"));
  check("Task text edit: new text present", (afterTaskEditProj?.tasks?.todo || []).includes("__edit_new__"));

  // Test 23: Task text edit preserves checkbox state (done vs todo)
  await post("/api/task-text", { project: PROJECT, status: "todo", oldText: "__edit_new__", newText: "__edit_check__" });
  const tasksFileAfterEdit = readFile(TASKS_FILE);
  check("Task text edit preserves [ ] checkbox", tasksFileAfterEdit.includes("- [ ] __edit_check__"));

  // Test 24: Goal text editing (inline edit API)
  await post("/api/agent-update", { project: PROJECT, action: "add_goal", text: "__goal_edit_orig__" });
  await post("/api/goal-text", { project: PROJECT, oldText: "__goal_edit_orig__", newText: "__goal_edit_new__" });
  const afterGoalEdit = await get("/api/projects");
  const afterGoalEditProj = afterGoalEdit.projects.find(p => p.name === PROJECT);
  check("Goal text edit: old text gone", !(afterGoalEditProj?.goals || []).some(g => g.text === "__goal_edit_orig__"));
  check("Goal text edit: new text present", (afterGoalEditProj?.goals || []).some(g => g.text === "__goal_edit_new__"));

  // Test 25: Goal text edit preserves done state
  await post("/api/goals", { project: PROJECT, text: "__goal_edit_new__", done: true });
  await post("/api/goal-text", { project: PROJECT, oldText: "__goal_edit_new__", newText: "__goal_edit_done__", done: true });
  const goalsFileAfterGoalEdit = readFile(GOALS_FILE);
  check("Goal text edit preserves [x] checkbox", goalsFileAfterGoalEdit.includes("- [x] __goal_edit_done__"));

  // Test 26: Task text edit with non-existent old text returns error
  const editFail = await post("/api/task-text", { project: PROJECT, status: "todo", oldText: "__nonexistent__", newText: "__whatever__" });
  check("Task text edit with bad oldText returns error", !!editFail.error);

  // Test 27: Cleanup edit test artifacts
  await post("/api/tasks", { project: PROJECT, action: "delete", status: "todo", text: "__edit_check__" });
  await post("/api/goals", { project: PROJECT, action: "delete", text: "__goal_edit_done__" });
  const cleanTasks = readFile(TASKS_FILE);
  const cleanGoals = readFile(GOALS_FILE);
  check("No edit test artifacts in tasks.md", !cleanTasks.includes("__edit_"));
  check("No edit test artifacts in goals.md", !cleanGoals.includes("__goal_edit_"));

} catch (e) {
  failed++;
  results.push(`  ✗ Unexpected error: ${e.message}`);
}

console.log(results.join("\n"));
console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
