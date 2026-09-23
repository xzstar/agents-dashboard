# Agents Dashboard — Agent Rules

## Dashboard 自动更新规范

本目录使用 `.dashboard/` 作为进展记录的公共文档框架。每次你（Agent）完成有意义的工作后，**必须**更新以下文件：

### 1. `.dashboard/status.md`

更新 YAML frontmatter 中的 `updated` 时间戳和 `summary` 字段，并在正文中反映当前重点和阻塞状态。

### 2. `.dashboard/tasks.md`

将已完成的任务打勾（`- [x]`），新发现的任务添加到 `## In Progress` 或 `## Done` 对应的分组下。

### 3. `.dashboard/changelog.md`

在当天日期的 `## YYYY-MM-DD` 分组下追加一行简述本次变更。

### 格式约定

- 所有文件使用 Markdown + YAML frontmatter（仅 `status.md` 有 frontmatter）
- 时间戳格式：ISO 8601（如 `2026-09-23T21:00:00+08:00`）
- `stage` 可选值：`active` / `paused` / `done` / `archived`
- 保持简洁，每条变更一行，不要写长段落

### API 快捷更新（推荐）

除了手动编辑 Markdown 文件，你也可以直接调用 dashboard API 更新进展（更可靠，不会写错格式）：

```
POST http://localhost:3456/api/agent-update
Content-Type: application/json
```

**常用操作示例：**

开始处理任务（移到 In Progress）：
```json
{"project": "项目名", "action": "start_task", "text": "任务描述"}
```

完成任务：
```json
{"project": "项目名", "action": "complete_task", "text": "任务描述"}
```

添加任务：
```json
{"project": "项目名", "action": "add_task", "status": "todo", "text": "新任务"}
```

完成目标：
```json
{"project": "项目名", "action": "complete_goal", "text": "目标描述"}
```

更新项目状态：
```json
{"project": "项目名", "action": "", "summary": "新摘要", "stage": "active"}
```

**说明：**
- `project` 必填，为项目名称（与 status.md 中的 project 字段一致）
- 支持的 action：`add_task` / `complete_task` / `move_task` / `delete_task` / `edit_task` / `add_goal` / `complete_goal` / `delete_goal`
- `complete_task` 会自动把任务从 Todo/In Progress 移到 Done
- 更新 `summary`/`stage` 时会自动更新 `updated` 时间戳
- 添加/完成/删除操作会自动写入 changelog
