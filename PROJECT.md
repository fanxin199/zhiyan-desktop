# 智研助手项目事实源

## 产品定位

智研助手是面向高校教师的本地 AI 教学与科研工作台，当前优先服务医学免疫学教学。目标用户不具备编码基础，产品主流程不得要求用户理解 Python、命令行、Git、worktree、hooks、MCP 或 Agent 运行时。

## 独立性

- 当前仓库：`J:\software_build\zhiyan-desktop`
- GitHub：`https://github.com/fanxin199/zhiyan-desktop`（private）
- 本项目使用全新 Git 历史，不配置 DeepSeek-GUI 上游。
- 部分基础代码来源于 MIT 授权项目，见 `THIRD_PARTY_NOTICES.md`。
- 产品名称、图标、应用标识、数据目录和未来更新服务均独立维护。

## 当前技术基线

- Electron + React + TypeScript
- 主进程负责受控文件访问、教材分析和 Office 导出
- 渲染进程启用 sandbox，不直接读取本地文件
- Kun 作为内部 AI 运行时；教师界面不暴露其技术细节
- 教学课件项目格式为 Project v2 / `.zhiyan-courseware`
- Kun 自动发现并激活随产品分发的第一方教学科研 Skills

## 已完成的核心能力

- PDF/PPTX 教材文字读取
- PDF/PPTX 图片识别、去重、审核和页面匹配
- 可编辑 PPTX、逐页讲稿 DOCX 和可重开项目包
- 旧版课件 JSON 自动迁移
- 工作区路径边界、IPC 输入校验和独立品牌基线
- 8 类内置教学科研 Skills、能力中心和可选工具依赖检测

## 开发约束

1. 用户文件只能通过经过 schema 校验的 IPC 访问。
2. 不得为了方便解除 Electron sandbox 或工作区路径边界。
3. 新功能优先复用项目现有 TypeScript/Node 能力，不给教师增加 Python/R 安装要求。
4. 教师主流程只显示任务、材料、审核和结果；运行时与开发参数放入高级设置。
5. 教学与科研结论必须区分事实、文献支持、推断和待验证假设。
6. 修改共享契约时同步更新测试、preload、IPC handler 和渲染层类型。
7. 不得整体复制开发者个人全局 Skills；可分发能力必须完成许可证、依赖和权限审查。

## 质量门槛

```powershell
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
```

Windows 发布候选还必须运行：

```powershell
npm run dist:win
```

产品阶段、课件架构和 Git 开发流程分别见：

- `docs/PROJECT_ROADMAP.md`
- `docs/COURSEWARE_ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/AI_SKILL_ARCHITECTURE.md`
