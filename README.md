# Agents Dashboard

A lightweight local web dashboard for tracking progress across project directories. Agents auto-update `.dashboard/` files; the dashboard reads and displays them.

## Usage

```bash
node server.mjs                  # scan current directory
node server.mjs ~/Projects       # scan a different root
PORT=8080 node server.mjs        # custom port
```

Open http://localhost:3456

## Convention

Each project directory can contain:

```
.dashboard/
├── status.md      # YAML frontmatter (project, stage, updated, summary, tags) + body
├── tasks.md       # checkbox list
└── changelog.md   # dated entries
```

Agents: see `AGENTS.md` for the auto-update rules.
