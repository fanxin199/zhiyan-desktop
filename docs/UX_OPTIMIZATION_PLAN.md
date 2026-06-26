# 智研助手 UX 优化计划

> **适用对象**：任何进入本项目的 AI agent（Codex、Gemini、Claude 等）。
>
> **使用方式**：每次只执行一个 `[ ]` 任务。完成后将其标记为 `[x]` 并提交。
> 下次进入时从第一个 `[ ]` 继续。
>
> **优先级**：P0 先做 → P1 → P2 → P3。同优先级内按列出顺序执行。
>
> **约束**：每次改动必须通过 `npm test && npm run typecheck && npm run lint -- --max-warnings=0 && npm run build`。
>
> **执行顺序调整（2026-06-26）**：完成智能教案生成的本页对话后，先推广到科研文本写作、综述撰写、自然基金撰写和科研数据分析；随后再处理未完成的术语中文化和 DOC/DOCX 文本读取。

---

## 审核背景

以大学教师视角审核整个项目后，核心发现：

1. 每个功能模块基本功能已具备，但老师每次使用都要重复填写学校、姓名等信息。
2. 侧边栏 12 个入口中有 4 个图标重复，老师容易点错。
3. 对话头部（SessionHeader）暴露了 token/cost/cacheHitRate 等开发指标，老师看不懂。
4. AI 没有"项目上下文"概念，切换对话后不知道老师在做哪个项目。
5. 老师表述模糊时 AI 直接执行而不确认，可能做错。
6. "Blueprint"、"下游数据分析"等术语偏技术化。

以下为按优先级排列的具体执行任务。

---

## P0 — 立即修复（用户感知最高、改动最小）

### Task 0.1 · 侧边栏图标去重与模块改名

- [x] **0.1.1** 在 `src/renderer/src/components/zhiyan/ZhiYanSidebar.tsx` 的 `NAV_ITEMS` 数组中：
  - 将 "综述撰写" 的图标从 `Search` 改为 `ScrollText`（或 `Library`），与"文献阅读"区分。
  - 将 "自然基金撰写" 的图标从 `PenTool` 改为 `Award`（或 `FileCheck`），与"文本写作"区分。
  - 将 "下游数据分析" 的 `label` 改为 `"科研数据分析"`。
- [x] **0.1.2** 在 `src/renderer/src/components/zhiyan/ZhiYanDashboard.tsx` 中同步修改对应卡片的图标和标题，保持与侧边栏一致。
- [x] **0.1.3** 将 Dashboard 中 "AI 对话" 卡片的图标从 `BarChart3` 改为 `MessageCircle`。

### Task 0.2 · SessionHeader 隐藏技术指标

- [x] **0.2.1** 在 `src/renderer/src/components/SessionHeader.tsx` 中：
  - compact 模式下只保留：**对话标题** + **工作区名** + **相对时间**。
  - 隐藏 `mode`（"agent"字样）、`tokens`、`cost`、`cacheHitRate` 显示。
  - 将"分叉"标签文案改为"从『XXX』新建的分支"（中文友好）。
- [x] **0.2.2** 增加一个 app-settings 布尔选项 `showTechnicalMetrics`（默认 false），仅当开启时才在 SessionHeader 中显示完整技术指标。需同步更新 `src/shared/app-settings-types.ts` 的类型定义和 `settings-section-general.tsx` 的 UI 开关。

### Task 0.3 · 术语中文化

- [ ] **0.3.1** 在 `src/renderer/src/components/zhiyan/ZhiYanModulePages.tsx` 中：
  - PAPER_CONFIG：所有 "Blueprint" → "写作蓝图"。
  - GRANT_CONFIG：所有 "Blueprint" → "项目蓝图"。
  - REVIEW_CONFIG：所有 "Blueprint" → "综述蓝图"。
  - BIOINFORMATICS_CONFIG：`title` 从 "下游数据分析" → "科研数据分析"。

### Task 0.4 · 文件驱动模块的后台材料与就地对话

- [x] **0.4.1** 文献阅读：上传文件的正文仅后台传递给智能体；页面只显示任务摘要，并在文献阅读页内展示流式解读与后续追问。
- [x] **0.4.2** 智能教案生成：PDF 正文、教案模板和长提示词仅后台传递；提交后留在教案页，显示“正在生成/已完成”的本页对话，不跳转 AI 对话。
- [x] **0.4.3** 智能教案生成：为 DOC/DOCX 材料补充与 PDF 一致的可靠文本读取策略，避免仅依赖智能体通过命令行猜测文件内容。DOCX 使用结构化正文提取；旧版 DOC 通过本机 Microsoft Word 自动化读取，缺少 Word 时提示转换为 DOCX/PDF。

---

## P1 — 核心体验提升

### Task 1.1 · 教师档案持久化

- [ ] **1.1.1** 在 `src/shared/app-settings-types.ts` 中增加 `teacherProfile` 字段：
  ```ts
  teacherProfile: {
    name: string
    school: string
    department: string
    courses: string[]
    researchTopics: string[]
  }
  ```
  在 `app-settings-normalize.ts` 中增加默认值（空字符串/空数组）。
- [ ] **1.1.2** 在 `src/renderer/src/components/settings-section-general.tsx` 中增加"教师信息"卡片 UI，包含以上字段的输入框和保存按钮。
- [ ] **1.1.3** 修改 `InitialSetupDialog.tsx`，在首次配置流程中增加"教师信息"步骤（在 API Key 配置之后）。
- [ ] **1.1.4** 修改 `SyllabusPage` 的表单，从 `electron-store` 读取 `teacherProfile` 自动填充"授课教师"、"学校名称"、"院系"字段。用户仍可手动覆盖。
- [ ] **1.1.5** 验证其他需要教师信息的模块（如教案导出 prompt 中的 schoolValue/departmentValue/teacherValue）也能自动读取。

### Task 1.2 · Dashboard 增加"最近使用"区域

- [ ] **1.2.1** 在 `ZhiYanDashboard.tsx` 中、问候语下方、"教学工具"卡片之前，增加"最近使用"区域。
  - 从 chat store 的 `threads` 数组读取最近 5 个非归档对话，按 `updatedAt` 倒序。
  - 每项显示：对话标题、关联模块图标、相对时间。
  - 点击可直接恢复到该对话。
- [ ] **1.2.2** 如果没有任何历史对话，该区域不渲染（而不是显示空列表）。

### Task 1.3 · 项目绑定机制

- [ ] **1.3.1** 在 `src/shared/app-settings-types.ts` 中增加 `teacherProjects` 数组类型：
  ```ts
  teacherProjects: Array<{
    id: string
    name: string          // 如 "免疫学课件2026"
    type: 'teaching' | 'research'
    workspacePath?: string // 关联的文件系统目录
    lastUsedAt: string
    summary?: string      // AI 自动生成的项目摘要
  }>
  ```
- [ ] **1.3.2** 在 `NormalizedThread` 类型（`src/renderer/src/agent/types.ts`）中增加可选的 `projectId?: string` 字段，用于将对话绑定到特定项目。
- [ ] **1.3.3** 在 chat-store 的 `createThread` 流程中，如果当前在某个模块页面（如 SyllabusPage）发起对话，自动关联到对应的项目或创建新项目。
- [ ] **1.3.4** 在 SessionHeader compact 模式中增加项目标识显示（如"📋 教案 · 移植免疫"）。

### Task 1.4 · 设置页增加教师信息入口

- [ ] **1.4.1** 在 `SettingsSidebar.tsx` 中的"通用"设置按钮下方增加说明文字或子项，提示"通用设置中可修改教师信息"。（此处不加新的侧边栏 tab，避免增加层级）

### Task 1.5 · 科研任务页内连续对话

- [x] **1.5.1** 科研文本写作：保留材料全文后台传递，在本页显示任务结果与后续追问；与写作工作台共享同一会话，避免重复创建上下文。
- [x] **1.5.2** 综述撰写：保留材料全文后台传递，在本页显示任务结果与后续追问。
- [x] **1.5.3** 自然基金撰写：保留材料全文后台传递，在本页显示任务结果与后续追问。
- [x] **1.5.4** 科研数据分析：在本页显示“正在读取并分析数据/分析已完成”状态和结果对话；H5AD/RDS 等专有格式保留工作区检查提示。
- [ ] **1.5.5** 为上述模块增加会话隔离测试，确保切换到 AI 对话或其他模块后，不会在原模块误显示无关消息。

---

## P2 — 深层体验优化

### Task 2.1 · Kun Agent 上下文注入（意图确认）

- [ ] **2.1.1** 在 `src/renderer/src/agent/kun-mapper.ts` 的 system prompt 构建逻辑中，注入教师档案和当前项目上下文：
  ```
  你是智研助手，正在帮助 {name} 老师处理 {projectName}。
  当前模块：{moduleType}。
  如果老师的请求不够明确，请先确认意图再执行。
  ```
  需要从 chat store 和 app-settings 读取信息。
- [ ] **2.1.2** 在 `buildResearchTaskPrompt()` 函数（ZhiYanModulePages.tsx）的 prompt 末尾追加项目上下文段落。
- [ ] **2.1.3** 在 Kun agent 的 system prompt 中增加以下行为规则：
  - 当老师的请求与当前项目主题不一致时，主动询问是否切换项目。
  - 当老师说"帮我改一下"但未指明对象时，列出最近操作让老师选择。
  - 对涉及写文件/生成文档的操作，先展示摘要再执行。

### Task 2.2 · 跨模块信息共享

- [ ] **2.2.1** 在 `electron-store` 中增加 `moduleContext` 存储，按 projectId 索引，保存各模块最近使用的关键参数（如教案模块的课程名称、课件模块的教材标题等）。
- [ ] **2.2.2** 当老师在"教案"模块填写了课程信息后，在"课件 PPT"模块自动读取并预填充相同课程信息。
- [ ] **2.2.3** 在"文本写作"模块建立的 Blueprint 数据，在"综述撰写"模块可通过"导入已有蓝图"按钮引用。

### Task 2.3 · Dashboard 快速搜索

- [ ] **2.3.1** 在 `ZhiYanDashboard.tsx` 的问候语区域下方增加一个轻量输入框，placeholder 为"输入关键词搜索功能，或直接描述需求…"。
- [ ] **2.3.2** 输入文字时实时过滤 Dashboard 中的功能卡片（前端过滤，不需要后端）。
- [ ] **2.3.3** 按回车时将输入作为自然语言 prompt 发送到 AI 对话界面。

### Task 2.4 · 字号层级规范化

- [ ] **2.4.1** 在 `tailwind.config.js` 中定义 5 个语义化字号 token：
  - `text-heading-1`：28px、`text-heading-2`：20px、`text-body`：14px、`text-caption`：12px、`text-micro`：10.5px
- [ ] **2.4.2** 逐步将 ZhiYanDashboard、ZhiYanModulePages、SessionHeader 中的裸字号（`text-[Xpx]`）替换为语义化 token。可分多次提交，每次处理一个组件。

---

## P3 — 体验打磨

### Task 3.1 · 课件 PPT 步骤指示器

- [ ] **3.1.1** 在 `CoursewarePage.tsx` 顶部增加横向步骤条组件：① 上传教材 → ② AI 分析 → ③ 图片审核 → ④ 生成课件。根据当前阶段高亮对应步骤。

### Task 3.2 · 文件管理器增强

- [x] **3.2.1** 将 `FileManagerPage` 从纯 `ModulePageShell` 壳子改为实际的文件浏览器：显示当前工作区的文件列表（通过 IPC `listWorkspaceDirectory`），支持按类型筛选、目录导航和新建文件夹。
- [x] **3.2.2** 支持文件预览：文本、图片和常规大小 PDF 在应用内预览；其他格式可用系统程序打开。
- [x] **3.2.3** 支持批量选择、批量交给 AI 分析与二次确认后的批量删除。
- [ ] **3.2.4** 为文件列表项增加右键菜单："用于生成教案"、"用于文献精读"等跨模块材料入口。

### Task 3.3 · 新用户引导

- [ ] **3.3.1** 在 `ZhiYanDashboard.tsx` 中检测 `teacherProfile.name` 是否为空（首次使用），如果是则在顶部展示 3 步引导卡片：① 选功能 → ② 填材料 → ③ 看结果。引导完成后不再显示。

### Task 3.4 · 科研数据分析模块降低门槛

- [ ] **3.4.1** 在 `BIOINFORMATICS_CONFIG` 的 `taskEntry` 区域上方增加可折叠的"数据格式说明"区域，用简明图文解释"表达矩阵"、"分组表"等概念。
- [ ] **3.4.2** 提供一套内置的 demo 数据路径（如 `resources/demo-data/bulk-rnaseq-example.csv`），老师可点击"使用示例数据体验"直接加载。

### Task 3.5 · 模块间区分提示

- [ ] **3.5.1** 在"综述撰写"模块顶部增加一行灰色小字："本模块专注于综述文章撰写。如需修改已有论文或基金，请使用「文本写作」模块。"
- [ ] **3.5.2** 在"文本写作"模块顶部增加："如需专门撰写国自然申请书，推荐使用「自然基金撰写」模块，内置国自然各模块模板。"

### Task 3.6 · 文献模块增强

- [ ] **3.6.1** 将"文献汇报 PPT 大纲"的 `label` 改为"组会汇报 PPT 大纲"。
- [ ] **3.6.2** 在 LITERATURE_CONFIG 的文件选择区域增加拖拽上传支持（监听 `onDragOver`/`onDrop` 事件）。

---

## 不修改的部分（经审核确认良好）

以下设计经审核后确认质量良好，无需改动：

- ✅ Dashboard 分时段问候语（"早上好，老师！"等）
- ✅ QuickActionCard 渐变色卡片 + hover:scale 交互
- ✅ 错误提示设计（红色 border + icon + 文字）
- ✅ PDF 提取状态三态（蓝色加载 → 红色失败 → 绿色成功）
- ✅ 教案表单的 pill 式教学方法选择
- ✅ ResearchTaskEntry 组件的任务类型+文本+文件+示例四合一设计
- ✅ SettingsSidebar 的"高级设置"折叠（隐藏 AI 服务配置）
- ✅ RuntimeBanner 温和提示重试（不使用技术错误码）
- ✅ 各模块 constraints 列表（确保 AI 不编造实验数据和参考文献）

---

## 质量门槛

每个 task 完成后必须通过：

```powershell
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
```

涉及 UI 变更的 task 还应目视检查暗色/亮色两种主题下的显示效果。
