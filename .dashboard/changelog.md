# Changelog

## 2026-09-23

- 创建 `.dashboard/` 公共文档框架
- 确定格式约定：Markdown 正文 + YAML frontmatter
- 开始搭建本地 dashboard 服务
- 创建 server.mjs（零依赖 Node HTTP 服务）+ public/index.html 前端
- 编写 AGENTS.md 自动更新规则，让 Agent 完成工作后自动更新 `.dashboard/` 文件
- 验证 server 启动、API 返回 JSON 数据、页面渲染均正常
- 重构为 Kanban 看板：Todo / In Progress / Done 三列，任务卡片带项目标签
