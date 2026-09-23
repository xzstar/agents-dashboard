# Changelog

## 2026-09-23

- 创建 `.dashboard/` 公共文档框架
- 确定格式约定：Markdown 正文 + YAML frontmatter
- 开始搭建本地 dashboard 服务
- 创建 server.mjs（零依赖 Node HTTP 服务）+ public/index.html 前端
- 编写 AGENTS.md 自动更新规则，让 Agent 完成工作后自动更新 `.dashboard/` 文件
- 验证 server 启动、API 返回 JSON 数据、页面渲染均正常
- 重构为 Kanban 看板：Todo / In Progress / Done 三列，任务卡片带项目标签
- 按 Botmux 设计语言重构界面（浅色主题、indigo accent、白卡片）
- 接入 9 个项目目录，多项目扫描和聚合展示验证通过
- 重构为左侧栏项目列表 + 右侧看板布局，支持点击项目筛选
- 实现 dashboard 上直接编辑任务：拖拽移动、新建、删除，POST /api/tasks 写回 tasks.md
- 修复拖拽重复创建：事件委托替代逐次绑定，客户端加请求锁，服务端写入前去重
- 时间线条目改为紧凑列表，减少垂直空间占用
- 全部 9 个项目目录添加 AGENTS.md，确保 Agent 自动更新 `.dashboard/` 文件
- 新增 `.dashboard/goals.md`（大目标 checkbox 列表）和 `status.md` 的 `description` 字段，前端展示项目描述和目标清单
