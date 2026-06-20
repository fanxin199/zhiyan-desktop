# 智研助手

面向医学教师的本地 AI 教学与科研工作台。产品目标是让没有编码基础的教师通过图形界面完成备课、课件生成、教学材料整理和科研辅助任务。

## 当前重点

- 从 PDF 或 PPTX 教材提取文字与可复用教学图片
- 自动生成可编辑的课程大纲、幻灯片和讲稿
- 在导出前审核图片并调整图片与幻灯片的对应关系
- 导出可继续编辑的 PPTX、DOCX 和本地课程项目
- 本地保存 API Key 与项目资料，不要求安装 Python
- 内置 8 类教学科研 AI Skills，由模型按对话和附件自动选择
- 检测 Python、R、Pandoc 等可选工具，安装必须经过用户确认

## 开发

```powershell
npm ci
npm run hooks:install
npm run dev
```

质量检查：

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Windows 安装包：

```powershell
npm run dist:win
```

## 仓库关系

本仓库采用全新的 Git 历史，不配置 DeepSeek-GUI 上游或发布地址。部分基础代码来源于 MIT 授权项目，许可声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 产品状态

当前版本为个人自用 Alpha，优先确保教学课件流程稳定、简单、可恢复。自动更新暂未启用。

## 项目文档

- [产品路线图](docs/PROJECT_ROADMAP.md)
- [课件素材工作流](docs/COURSEWARE_ARCHITECTURE.md)
- [科研工作台与内置能力规划](docs/RESEARCH_WORKBENCH_PLAN.md)
- [Git hooks 与 worktree 开发流程](docs/DEVELOPMENT.md)
- [AI 能力与内置 Skills 架构](docs/AI_SKILL_ARCHITECTURE.md)
- [仓库目录说明](docs/REPOSITORY_STRUCTURE.md)
