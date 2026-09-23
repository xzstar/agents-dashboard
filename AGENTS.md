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
