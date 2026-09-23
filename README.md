# Agents Dashboard

A lightweight local web dashboard for tracking progress across project directories. Agents auto-update `.dashboard/` files; the dashboard reads and displays them via Kanban board, timeline, and project cards.

## Quick Start

```bash
git clone https://github.com/xiezhe/agents-dashboard.git
cd agents-dashboard
cp -r template/.dashboard your-project/.dashboard
node server.mjs ~/Projects
```

Open http://localhost:3456

## Setup for Your Project

1. Copy `template/.dashboard/` to your project root
2. Edit `status.md` to set `project`, `description`, `summary`
3. Add tasks to `tasks.md`, goals to `goals.md`
4. Start the server with your projects root directory
5. Agents working in those directories will auto-update via `AGENTS.md` rules or the API

```bash
node server.mjs                  # scan current directory
node server.mjs ~/Projects       # scan a different root
PORT=8080 node server.mjs        # custom port
```

Open http://localhost:3456

## Agent API

Agents can update the dashboard programmatically:

```bash
curl -X POST http://localhost:3456/api/agent-update \
  -H "Content-Type: application/json" \
  -d '{"project":"My Project","action":"start_task","text":"my task"}'
```

Supported actions: `start_task` / `add_task` / `complete_task` / `move_task` / `delete_task` / `edit_task` / `add_goal` / `complete_goal` / `delete_goal`

The dashboard auto-refreshes via Server-Sent Events when agents update data.

## Convention

Each project directory can contain:

```
.dashboard/
├── status.md      # YAML frontmatter (project, stage, updated, summary, tags) + body
├── tasks.md       # checkbox list
├── goals.md       # major goals with checkboxes
└── changelog.md   # dated entries
```

See `AGENTS.md` for full agent update rules and API documentation.

## Testing

```bash
node test.mjs    # 52 tests covering all APIs and data integrity
```
