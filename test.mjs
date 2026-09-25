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
const SERVER_FILE = path.join(PROJECT_DIR, "server.mjs");
const FAVICON_FILE = path.join(PROJECT_DIR, "public", "favicon.svg");

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
      res.on("end", () => {
        try { resolve(JSON.parse(buf)); } catch { resolve(buf); }
      });
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

  // Test 28: Agent start_task moves todo → in-progress
  await post("/api/tasks", { project: PROJECT, action: "add", status: "todo", text: "__start_task_test__" });
  const startResult = await post("/api/agent-update", { project: PROJECT, action: "start_task", text: "__start_task_test__" });
  check("agent-update start_task returns ok", startResult.ok === true);
  check("agent-update start_task reports started", startResult.task === "started");
  const afterStart = await get("/api/projects");
  const afterStartProj = afterStart.projects.find(p => p.name === PROJECT);
  check("start_task: removed from todo", !(afterStartProj?.tasks?.todo || []).includes("__start_task_test__"));
  check("start_task: added to in-progress", (afterStartProj?.tasks?.["in-progress"] || []).includes("__start_task_test__"));

  // Test 29: Agent start_task on already in-progress task is idempotent
  const startAgain = await post("/api/agent-update", { project: PROJECT, action: "start_task", text: "__start_task_test__" });
  check("start_task on in-progress is idempotent", startAgain.ok === true && startAgain.task === "already_in_progress");

  // Test 30: Agent start_task on non-existent task returns error
  const startMissing = await post("/api/agent-update", { project: PROJECT, action: "start_task", text: "__nonexistent_task__" });
  check("start_task on missing task returns error", !!startMissing.error);

  // Test 31: Cleanup start_task test artifacts
  await post("/api/agent-update", { project: PROJECT, action: "delete_task", status: "in-progress", text: "__start_task_test__" });
  const cleanStart = readFile(TASKS_FILE);
  check("No start_task artifacts remain", !cleanStart.includes("__start_task_test__"));

  // Test 32: Project selection survives refresh through a shareable URL
const html = readFile(path.join(PROJECT_DIR, "public", "index.html"));
const serverSource = readFile(SERVER_FILE);
  check("Selected project is restored from URL", html.includes('const requestedProject = new URLSearchParams(window.location.search).get("project")'));
  check("Missing selected project falls back to monitoring view", html.includes("projects.some(project => project.name === selectedProject)"));
  check("Project selection updates the URL without a page reload", html.includes("window.history.replaceState"));

  // Test 33: Monitoring overview is separate from project entries
  check("Sidebar has a dedicated monitoring overview", html.includes('id="overview-item"'));
  check("Overview is labeled 监控看板", html.includes("监控看板"));
  check("Projects are no longer mixed with All Projects entries", !html.includes(">All Projects</span>"));

  // Test 34: Agent workflow requires starting a task before implementation
  const agentRules = readFile(path.join(PROJECT_DIR, "AGENTS.md"));
  check("Agent workflow mandates start_task before implementation", agentRules.includes("第一件事**是调用 `start_task`"));
  check("Agent workflow documents start_task as supported", agentRules.includes("`start_task` / `add_task`"));
  check("Agent workflow requires tests before implementation", agentRules.includes("必须先新增或修改对应测试用例"));

  // Test 35: Monitoring KPI cards expose active, in-progress, done, and stale totals
  check("KPI section exists on monitoring board", html.includes('id="kpi-grid"'));
  check("KPI renderer computes monitoring metrics", html.includes("function renderKpis(projects)"));
  check("KPI renderer tracks active projects", html.includes('label: "活跃项目"'));
  check("KPI renderer tracks in-progress tasks", html.includes('label: "进行中任务"'));
  check("KPI renderer tracks completed tasks", html.includes('label: "完成任务"'));
  check("KPI renderer tracks stale projects", html.includes('label: "停滞项目"'));
  check("KPI stale threshold is 7 days", html.includes("const STALE_DAYS = 7"));
  check("KPI renderer is invoked before board rendering", html.includes("renderKpis(projects);") && html.indexOf("renderKpis(projects);") < html.indexOf("renderBoard(projects);"));

  // Test 36: Monitoring includes per-project health cards
  check("Project health grid exists", html.includes('id="health-grid"'));
  check("Project health cards are rendered", html.includes("function renderHealthCards(projects)"));
  check("Health cards show project progress", html.includes("const completed = project.tasks.done.length"));
  check("Health cards show total task count", html.includes("const taskTotal = completed + project.tasks.todo.length + project.tasks[\"in-progress\"].length"));
  check("Health cards show owner or current agent", html.includes("project.meta.agent || project.meta.owner || \"未记录\""));
  check("Health cards show recent update time", html.includes("formatUpdatedAt(project)"));
  check("Health cards mark stale projects", html.includes('isProjectStale(project) ? "停滞" : "正常"'));
  check("Health cards are clickable and sync project selection", html.includes("healthGrid.addEventListener(\"click\", event =>"));

  // Test 37: API tracks started tasks and exposes stale-task detection
  const staleTaskText = `__stale_task_test_${Date.now()}__`;
  await post("/api/tasks", { project: PROJECT, action: "add", status: "todo", text: staleTaskText });
  await post("/api/agent-update", { project: PROJECT, action: "start_task", text: staleTaskText });
  const changelogBeforeStaleTest = readFile(path.join(PROJECT_DIR, ".dashboard", "changelog.md"));
  const staleApi = await get("/api/projects");
  const staleProject = staleApi.projects.find(project => project.name === PROJECT);
  check("API returns project health", !!staleProject?.health);
  check("API returns stale project flag", typeof staleProject?.health?.stale === "boolean");
  check("API returns stale task list", Array.isArray(staleProject?.health?.staleTasks));
  const startedStaleTask = staleProject?.health?.staleTasks?.find(task => task.text === staleTaskText);
  check("start_task records a task start date", !!startedStaleTask?.startedAt);
  check("Newly started task is not stale", startedStaleTask?.stale === false);

  // Test 38: In Progress tasks older than 7 days are marked stale
  const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const changelogPath = path.join(PROJECT_DIR, ".dashboard", "changelog.md");
  fs.writeFileSync(changelogPath, changelogBeforeStaleTest.replace(`## ${new Date().toISOString().slice(0, 10)}`, `## ${staleDate}`));
  const oldStaleApi = await get("/api/projects");
  const oldStaleProject = oldStaleApi.projects.find(project => project.name === PROJECT);
  const oldStaleTask = oldStaleProject?.health?.staleTasks?.find(task => task.text === staleTaskText);
  check("Old In Progress task is marked stale", oldStaleTask?.stale === true);
  check("Stale task makes project health stale", oldStaleProject?.health?.stale === true);

  // Test 39: Cleanup stale detection artifacts
  await post("/api/agent-update", { project: PROJECT, action: "delete_task", status: "in-progress", text: staleTaskText });
  fs.writeFileSync(changelogPath, changelogBeforeStaleTest);
  const cleanStale = readFile(path.join(PROJECT_DIR, ".dashboard", "tasks.md"));
  check("No stale test artifacts remain", !cleanStale.includes(staleTaskText));
  check("KPI uses API stale health", html.includes("scopedProjects.filter(project => isProjectStale(project))"));
  check("Health cards use API stale health", html.includes("isProjectStale(project) ? \"停滞\" : \"正常\""));

  // Test 40: Activity feed aggregates recent project changes
  check("Activity feed section exists", html.includes('id="activity-list"'));
  check("Activity feed is rendered from changelog entries", html.includes("function renderActivityFeed(projects)"));
  check("Activity feed aggregates all projects", html.includes("getFilteredProjects(projects).flatMap(project =>"));
  check("Activity feed shows newest changes first", html.includes(".sort((a, b) => b.date.localeCompare(a.date)"));
  check("Activity feed limits displayed history", html.includes(".slice(0, 20)"));
  check("Activity feed labels each source project", html.includes('class="proj-tag ${projectColors[activity.project]'));
  check("Activity feed updates on load and selection", html.includes("renderActivityFeed(projects);"));

  // Test 41: Trend charts summarize the last 14 days of project activity
  check("Trend grid exists", html.includes('id="trend-grid"'));
  check("Trend renderer exists", html.includes("function renderTrends(projects)"));
  check("Trend window is 14 days", html.includes("const TREND_DAYS = 14"));
  check("Trend renderer tracks completed tasks", html.includes('label: "完成任务"'));
  check("Trend renderer tracks added tasks", html.includes('label: "新增任务"'));
  check("Trend renderer tracks in-progress changes", html.includes('label: "In Progress"'));
  check("Trend renderer tracks agent activity", html.includes('label: "Agent 活跃"'));
  check("Trend charts render daily bars", html.includes('class="trend-bars"'));
  check("Trend charts update on load", html.includes("renderTrends(projects);"));

  // Test 42: Goal progress overview aggregates checkbox completion
  check("Goal overview section exists", html.includes('id="goal-overview-grid"'));
  check("Goal overview renderer exists", html.includes("function renderGoalOverview(projects)"));
  check("Goal overview computes completed goals", html.includes("const doneGoals = project.goals.filter(goal => goal.done).length"));
  check("Goal overview computes total goals", html.includes("const totalGoals = project.goals.length"));
  check("Goal overview calculates completion percentage", html.includes("Math.round(doneGoals / totalGoals * 100)"));
  check("Goal overview handles projects without goals", html.includes("totalGoals ? Math.round(doneGoals / totalGoals * 100) : 0"));
  check("Goal overview updates on load and selection", html.includes("renderGoalOverview(projects);"));

  // Test 43: Search and filters cover project, task, status, and recency dimensions
  check("Search input exists", html.includes('id="filter-input"'));
  check("Search covers project names and task content", html.includes('const searchTargets = [project.name, project.meta.description || "", project.meta.summary || "",'));
  check("Status filter checkboxes exist", html.includes('data-filter-status="todo"'));
  check("Status filter includes In Progress", html.includes('data-filter-status="in-progress"'));
  check("Status filter includes Done", html.includes('data-filter-status="done"'));
  check("Updated-time filter exists", html.includes('id="updated-filter"'));
  check("Search filter state is centralized", html.includes("const filters = { query: \"\", statuses: new Set([\"todo\", \"in-progress\", \"done\"]), updatedWithin: \"all\" }"));
  check("Filtered projects helper is used by board", html.includes("const filtered = getFilteredProjects(projects);"));
  check("Search and filters refresh views without reloading data", html.includes("function refreshFilteredViews()"));

  // Test 44: Project detail drawer shows a focused board and timeline
  check("Project drawer overlay exists", html.includes('id="project-drawer-overlay"'));
  check("Project drawer body exists", html.includes('id="project-drawer-body"'));
  check("Project drawer renderer exists", html.includes("function openProjectDrawer(projectName)"));
  check("Project drawer closes with button", html.includes('id="project-drawer-close"'));
  check("Project drawer closes on overlay click", html.includes("projectDrawerOverlay.addEventListener(\"click\", event =>"));
  check("Project drawer shows focused task board", html.includes("drawerProject.tasks"));
  check("Project drawer shows changelog timeline", html.includes("drawerProject.changelog"));
  check("Health cards open the project drawer", html.includes("openProjectDrawer(card.dataset.name)"));
  check("Project drawer can switch to the main board", html.includes('id="project-drawer-open"'));

  // Test 45: Notification rules surface stale tasks, stale projects, and heartbeat gaps
  check("Notification list exists", html.includes('id="notification-list"'));
  check("Notification renderer exists", html.includes("function renderNotifications(projects)"));
  check("Notifications detect stale tasks", html.includes('project.health.staleTasks.filter(task => task.stale)'));
  check("Notifications detect stale projects", html.includes('type: "stale-project"'));
  check("Notifications detect missing heartbeats", html.includes('type: "missing-heartbeat"'));
  check("Notifications use warning styling", html.includes('class="notification-item warning"'));
  check("Notification count is displayed", html.includes('id="notification-count"'));
  check("Notifications update on load and filtering", html.includes("renderNotifications(projects);"));

  // Test 46: Reports export the filtered snapshot as Markdown or HTML
  check("Markdown report button exists", html.includes('id="export-md"'));
  check("HTML report button exists", html.includes('id="export-html"'));
  check("Markdown report builder exists", html.includes("function buildReportMarkdown(projects)"));
  check("HTML report builder exists", html.includes("function buildReportHtml(projects)"));
  check("Reports use the current filtered snapshot", html.includes("const reportProjects = getFilteredProjects(cachedData.projects)"));
  check("Report download uses browser Blob", html.includes("new Blob([content], { type: contentType })"));
  check("Reports include task sections", html.includes("### Tasks"));
  check("Reports include goal progress", html.includes("### Goals"));
  check("Reports include recent timeline", html.includes("### Timeline"));

  // Test 47: Agents can report heartbeats and monitoring shows freshness
  const statusBeforeHeartbeat = readFile(STATUS_FILE);
  const heartbeatResult = await post("/api/agent-heartbeat", { project: PROJECT, agent: "__test_agent__" });
  check("Agent heartbeat API accepts heartbeat", heartbeatResult.ok === true);
  const heartbeatApi = await get("/api/projects");
  const heartbeatProject = heartbeatApi.projects.find(project => project.name === PROJECT);
  check("Heartbeat API records agent name", heartbeatProject?.meta?.agent === "__test_agent__");
  check("Heartbeat API records last heartbeat", !!heartbeatProject?.heartbeat?.lastAt);
  check("Heartbeat API reports age", typeof heartbeatProject?.heartbeat?.ageMs === "number");
  check("Fresh heartbeat is reported fresh", heartbeatProject?.heartbeat?.fresh === true);
  const statusAfterHeartbeat = readFile(STATUS_FILE);
  check("Heartbeat persists in status frontmatter", statusAfterHeartbeat.includes("lastAgentHeartbeat:"));

  // Test 48: Stale heartbeat is reported but can be restored
  const staleHeartbeatAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(STATUS_FILE, statusAfterHeartbeat.replace(/^lastAgentHeartbeat:.*$/m, `lastAgentHeartbeat: ${staleHeartbeatAt}`));
  const staleHeartbeatApi = await get("/api/projects");
  const staleHeartbeatProject = staleHeartbeatApi.projects.find(project => project.name === PROJECT);
  check("Stale heartbeat is reported stale", staleHeartbeatProject?.heartbeat?.fresh === false);
  check("Monitoring displays heartbeat freshness", html.includes("function formatHeartbeat(project)"));
  check("Health cards show last heartbeat", html.includes("心跳：${formatHeartbeat(project)}"));

  // Test 49: Cleanup heartbeat test artifacts
  fs.writeFileSync(STATUS_FILE, statusBeforeHeartbeat);
  const cleanedHeartbeatApi = await get("/api/projects");
  const cleanedHeartbeatProject = cleanedHeartbeatApi.projects.find(project => project.name === PROJECT);
  check("No heartbeat test agent remains", cleanedHeartbeatProject?.meta?.agent !== "__test_agent__");
  check("Heartbeat API is documented for agents", agentRules.includes("POST http://localhost:3456/api/agent-heartbeat"));
  check("Heartbeat payload is documented", agentRules.includes('{"project": "项目名", "agent": "Agent 名称"}'));

  // Test 50: Activity feed hides internal test task entries
  check("Activity feed has a test-entry filter", html.includes("function isTestActivity(text)"));
  check("Test-entry filter matches stale task artifacts", html.includes('text.includes("stale_task_test")'));
  check("Test-entry filter matches double-underscore artifacts", html.includes('text.includes("__")'));
  check("Activity feed filters test entries before pagination", html.includes(".filter(activity => !isTestActivity(activity.text)).slice(0, 20)"));

  // Test 51: In Progress tasks display a blinking running indicator
  check("In Progress running dot class exists", html.includes('class="running-dot"'));
  check("Running dot is only added to In Progress tasks", html.includes('${status === "in-progress" ? `<span class="running-dot"></span>` : ""}'));
  check("Running dot uses a red pulse animation", html.includes("@keyframes running-pulse"));
  check("Running dot is visible above task content", html.includes("z-index: 1"));

  // Test 52: Heartbeat refreshes open dashboards through SSE
  check("Heartbeat broadcast is implemented by server", serverSource.includes("heartbeat_refresh"));
  check("Dashboard refreshes on heartbeat broadcast", html.includes('data.type === "agent-heartbeat"'));

  // Test 53: Timeline and drawer timeline hide internal test entries
  check("Timeline filters test entries", html.includes("for (const item of entry.items.filter(item => !isTestActivity(item)))"));
  check("Timeline list uses the filtered test-entry rule", html.includes('tlMap[date].map(t => `<div class="tl-item"><span class="proj-tag ${projectColors[t.project]'));
  check("Timeline day view uses the filtered test-entry rule", html.includes('tlMap[date].map(t => `<div class="tl-item"><span class="proj-tag ${projectColors[t.project]'));
  check("Project drawer timeline filters test entries", html.includes("entry.items.filter(text => !isTestActivity(text))"));

  // Test 54: Description editing has explicit save and cancel controls
  check("Description editor exposes an OK button", html.includes('id="desc-save-btn"'));
  check("Description editor exposes a Cancel button", html.includes('id="desc-cancel-btn"'));
  check("Description OK button invokes save", html.includes('desc-save-btn").addEventListener("click", () => save()'));
  check("Description Cancel button invokes cancel", html.includes('desc-cancel-btn").addEventListener("click", () => cancel()'));
  check("Description buttons prevent blur-triggered duplicate actions", html.includes('descEl.querySelector(".edit-actions").addEventListener("mousedown", event => event.preventDefault())'));

  // Test 55: The dashboard uses a concise application icon
  const favicon = fs.existsSync(FAVICON_FILE) ? readFile(FAVICON_FILE) : "";
  check("Favicon file exists", fs.existsSync(FAVICON_FILE));
  check("HTML links SVG favicon", html.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'));
  check("Favicon uses a rounded gradient mark", favicon.includes('rx="15"') && favicon.includes("linearGradient"));
  check("Favicon shows kanban columns", favicon.includes('M18 42V27') && favicon.includes('M28 42V20') && favicon.includes('M38 42V31'));
  check("Favicon includes an agent node", favicon.includes('circle cx="45" cy="19" r="6"'));
  check("Sidebar displays the application icon", html.includes('<img class="app-logo" src="/favicon.svg" alt="Agents Dashboard">'));

} catch (e) {
  failed++;
  results.push(`  ✗ Unexpected error: ${e.message}`);
}

console.log(results.join("\n"));
console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
