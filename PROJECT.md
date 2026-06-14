# 🧠 智研助手 (ZhiYan Assistant) — 项目入口文件

> **任何 Agent 或新对话在接手本项目前，必须先完整阅读此文件。**
> 本文件是项目的单一事实来源 (Single Source of Truth)。

---

## 📌 项目概述

| 项目 | 说明 |
|------|------|
| **产品名称** | 智研助手 (ZhiYan Assistant) |
| **目标用户** | 大学教师（无代码知识） |
| **学科方向** | 生物医学（初版） |
| **基础框架** | Electron + React + TypeScript + Kun 本地 Agent 运行时 |
| **技术栈** | Electron + React 19 + TypeScript + Zustand + TailwindCSS |
| **Agent 运行时** | Kun runtime (HTTP/SSE)，**严禁修改** `kun/` 目录 |
| **项目路径** | `j:\software_build\deepseek_exe` |
| **AI 模型** | DeepSeek API / GLM API / 火山引擎 API（覆盖中国主流大模型） |
| **分发方式** | Windows 安装版 (.exe)，纯本地数据，单用户 |

---

## 🏗️ 核心架构

```
j:\software_build\deepseek_exe\
├── kun/                          # 🔒 Agent 运行时（严禁修改）
├── src/
│   ├── main/                     # Electron 主进程
│   │   └── index.ts             # 主进程入口
│   ├── preload/                  # Electron 预加载
│   └── renderer/                 # React UI（改造重点）
│       └── src/
│           ├── App.tsx           # 根组件
│           ├── AppShell.tsx      # 路由分发（Settings | Workbench）
│           ├── components/
│           │   ├── Workbench.tsx  # ⭐ 核心工作台（1600+ 行）
│           │   ├── zhiyan/       # ✅ 新增 - 智研助手专属组件
│           │   │   ├── ZhiYanDashboard.tsx   # 首页仪表盘
│           │   │   ├── ZhiYanSidebar.tsx     # 侧边栏导航
│           │   │   └── ZhiYanModulePages.tsx # 7 个模块页面
│           │   ├── chat/         # 对话组件（保留）
│           │   ├── write/        # 写作工作台（保留）
│           │   ├── sidebar/      # 基础侧边栏组件（保留）
│           │   ├── SettingsView.tsx     # 设置页
│           │   └── SettingsSidebar.tsx  # 设置侧边栏
│           ├── store/
│           │   ├── chat-store.ts              # Zustand 主 store
│           │   ├── chat-store-types.ts        # ⭐ 类型定义（AppRoute 等）
│           │   ├── chat-store-app-actions.ts   # ⭐ 应用 action（含 8 个新路由）
│           │   └── chat-store-navigation-actions.ts # 导航 action
│           ├── locales/          # i18n 翻译文件
│           └── styles/           # 全局样式
├── docs/
│   └── dev-notes/               # ⭐ 各模块开发笔记（实施计划、技术备忘、踩坑记录）
├── electron-builder.config.cjs   # 打包配置
├── package.json                  # 项目配置
└── PROJECT.md                    # ← 你正在阅读的文件
```

> **💡 提示**：各模块的详细开发记录（实施计划、技术 walkthrough、参考资料）在 [`docs/dev-notes/`](docs/dev-notes/README.md) 目录下。

---

## 🎯 八大功能模块

| 模块 | 路由 | 状态 | 说明 |
|------|------|------|------|
| 首页仪表盘 | `dashboard` | ✅ 框架完成 | 时间问候 + 功能卡片入口 |
| 智能教案 | `syllabus` | ✅ **功能完成** | PDF/Word 上传 → AI 提取内容 → 生成规范教案 → 导出 .docx 到源文件目录 |
| 课件 PPT | `ppt-gen` | ✅ 页面骨架 | PDF → PPT 自动转换 |
| 论文润色 | `paper-polish` | ✅ 页面骨架 | 语法修正、风格优化、中英互译 |
| 文献检索 | `literature` | ✅ 页面骨架 | PubMed/OpenAlex 搜索与综述 |
| 教材/基金 | `textbook` | ✅ 页面骨架 | 教材写作 + 国自然申请书 |
| 生信分析 | `bioinformatics` | 🔒 暂未开放 | DEG、GO/KEGG、scRNA-seq |
| 文件管理 | `file-manager` | ✅ 页面骨架 | 文件预览、批量操作 |

> 每个模块页面目前只有功能介绍 + 快速提示入口，点击快速提示会跳转到 AI 对话页面。
> 下一步需要为每个模块开发专属的交互界面。

---

## ✅ 已完成的改造

### Phase 1.1：项目初始化
- [x] Clone 源码 + 依赖安装
- [x] 源码架构全面分析
- [x] TypeScript 编译通过（零错误）
- [x] `npm run dev` 启动验证

### Phase 1.2：品牌改造
- [x] `package.json`: name → `zhiyan-assistant`, version → `1.0.0`
- [x] `electron-builder.config.cjs`: appId → `com.zhiyan.assistant`, productName → `智研助手`
- [x] `App.tsx`: 加载文字 → `正在启动智研助手...`
- [x] `locales/en/common.json` + `locales/zh/common.json`: appName → `智研助手`
- [x] `SettingsSidebar.tsx`: 底部标识 → `智研助手`
- [x] AI 身份改造：修改 `kun-system-prompt.ts`、`agent-loop.ts` 为“智研助手”并列出八大功能模块，设定无代码教学科研人设
- [x] 界面品牌汉化清理：全面修改 `common.json` 与 `settings.json`，清除中文字样中的 `Kun` 并替换为 `智研助手`
- [x] 智能体名称修改：修改 `kun-runtime.ts` 中的 `displayName` 为 `智研助手`
- [ ] 应用图标替换（仍使用 DeepSeek 图标）


### Phase 1.3：导航与路由改造
- [x] `chat-store-types.ts`: AppRoute 新增 8 个路由值
- [x] `chat-store-types.ts`: SettingsRouteSection 新增 `'api-keys'`
- [x] `chat-store-types.ts`: ChatState 新增 8 个 action 签名
- [x] `chat-store-app-actions.ts`: 8 个 action 实现
- [x] `chat-store.ts`: 默认路由 `'chat'` → `'dashboard'`
- [x] `chat-store-navigation-actions.ts`: boot 完成路由 → `'dashboard'`
- [x] 创建 `ZhiYanSidebar.tsx`: 教学/科研/工具 分组导航
- [x] 创建 `ZhiYanDashboard.tsx`: 时间问候 + 渐变功能卡片
- [x] 创建 `ZhiYanModulePages.tsx`: 7 个模块页面（共享 Shell）
- [x] `Workbench.tsx`: 集成所有新组件 + 路由渲染

### Phase 1.4：删除/弱化开发者功能
- [x] 非 Write 模式下侧边栏替换为 ZhiYanSidebar（隐藏 Code/Claw/Connect Phone）
- [x] SDD 需求文档入口已移除
- [x] `SettingsView.tsx`: goBack 默认回 dashboard + api-keys 类型安全

---

## 📋 待开发任务清单（按优先级排列）

### Phase 2：模块功能深度开发

#### Step 2.1：智能教案模块（syllabus）✅ 已完成
- [x] 设计教案生成的表单界面（授课教师、课程名、题目、学时、教材、文件选择等）
- [x] 实现"开始生成教案"逻辑：PDF 解析 → 内容提取 → 拼接模版 prompt → 触发 AI 对话
- [x] 导出为 .docx（Kun agent 直接生成到 PDF 源文件目录）
- [x] 课程信息字段可选填（填则自动插入教案，不填则留空）
- [x] 教案内容精炼（总字数 1500-2500，格式参考模版）
- [x] Electron sandbox 适配：新增 pickFile / readFileBinary IPC
- [x] Workspace 传递：createThread 传递 PDF 所在目录作为 workspaceRoot

#### Step 2.2：课件 PPT 模块（ppt-gen）
- [ ] 文件上传组件（支持 PDF 拖拽）
- [ ] PDF 预览面板
- [ ] 自动拆分章节 → prompt 构造
- [ ] PPT 生成结果预览与下载

#### Step 2.3：论文润色模块（paper-polish）
- [ ] 文本输入/文件上传双模式界面
- [ ] 实时 diff 对比展示（原文 vs 润色后）
- [ ] 模式选择：语法修正 / 风格优化 / 中英互译 / 去 AI 痕迹
- [ ] 导出润色结果

#### Step 2.4：文献检索模块（literature）
- [ ] PubMed 搜索界面（关键词 + 过滤器）
- [ ] 文献列表 + 摘要展示
- [ ] AI 文献总结与综述生成
- [ ] 阅读笔记管理

#### Step 2.5：教材/基金写作模块（textbook）
- [ ] 模式选择：教材写作 / 国自然申请 / 综述撰写
- [ ] 章节大纲编辑器
- [ ] 逐段 AI 生成 + 人工审核
- [ ] 全文连贯性检查

#### Step 2.6：文件管理模块（file-manager）
- [ ] 文件夹浏览器组件
- [ ] 文件预览（PDF/Word/Excel/图片）
- [ ] 拖拽文件到 AI 对话
- [ ] 批量格式转换

### Phase 3：系统功能增强

#### Step 3.1：多 API Key 配置
- [ ] 在 Settings 的 agents 区域增加多 Key 管理 UI
- [ ] 支持 DeepSeek / GLM / 火山引擎 API 选择
- [ ] API Key 有效性测试按钮
- [ ] 模型列表动态获取

#### Step 3.2：首次启动环境检测
- [ ] 检测 Python 是否安装
- [ ] 检测 R 是否安装
- [ ] 一键安装脚本（可选）
- [ ] 环境状态显示在设置页

#### Step 3.3：应用图标与品牌
- [ ] 设计智研助手专属图标
- [ ] 替换 build/ 目录下的图标文件
- [ ] 启动画面/Splash screen 适配

### Phase 4：打包与发布

#### Step 4.1：Windows 安装包
- [ ] 运行 `npm run dist:win` 生成 .exe
- [ ] 测试安装/卸载流程
- [ ] NSIS 安装向导中文化

#### Step 4.2：测试与优化
- [ ] 全模块端到端测试
- [ ] 性能优化（懒加载、代码分割）
- [ ] 错误处理与用户提示优化

### Phase 5：生信分析模块（最后开放）
- [ ] DEG 差异表达分析界面
- [ ] GO/KEGG 富集分析
- [ ] 单细胞分析工作流
- [ ] 数据可视化图表
- [ ] Python/R 脚本执行集成

---

## ⚠️ 关键约束

1. **严禁修改 `kun/` 目录** — Agent 运行时不可改动
2. **UI 改动在 `src/renderer/`** — 但新增 IPC 通道需同步改 `src/main/ipc/`、`src/preload/`、`src/shared/`
3. **保留写作工作台** — Write 模式使用原有的 `WriteSidebar`
4. **保留 AI 对话** — Chat 模式使用原有的 `MessageTimeline` + `FloatingComposer`
5. **保留设置系统** — Settings 使用原有的 `SettingsView`
6. **中文优先** — 界面文案全部使用中文
7. **生信分析最后** — bioinformatics 模块放最后开发

---

## 🚨 Electron Sandbox 技术踩坑备忘（必读）

主窗口配置了 `sandbox: true`（`src/main/index.ts` L630），导致渲染进程受到严格安全限制。
**所有模块开发时必须遵守以下规则**：

| ❌ 不可用 | ✅ 替代方案 | 原因 |
|-----------|-------------|------|
| `(file as any).path` | `dsGui.pickFile()` IPC | sandbox 下 File 对象无 `.path` 属性 |
| `fetch('file://...')` | `dsGui.readFileBinary()` IPC | sandbox 禁止 file:// fetch |
| `require('fs')` | 通过 IPC 调用 main 进程 | sandbox 下无 Node API |
| `createThread()` 无参 | `createThread({ workspaceRoot })` | 否则 Kun 工具 cwd 指向默认 workspace |

### 已注册的自定义 IPC 通道

| 通道 | preload 方法 | 功能 |
|------|-------------|------|
| `file:pick-file` | `dsGui.pickFile(options?)` | 弹出系统文件选择框，返回绝对路径 |
| `file:read-binary` | `dsGui.readFileBinary(filePath)` | 读取文件二进制为 base64 |

### 新增 IPC 的标准流程

1. `src/main/ipc/register-app-ipc-handlers.ts` — 添加 `ipcMain.handle`
2. `src/preload/index.ts` — 在 api 对象中暴露方法
3. `src/shared/ds-gui-api.ts` — 添加类型定义
4. 渲染进程中 `(window as any).dsGui.yourMethod()` 调用

---

## 🔧 开发指南

### 启动开发
```bash
cd j:\software_build\deepseek_exe
npm run dev
```

### TypeScript 检查
```bash
npx tsc --noEmit --project tsconfig.web.json
```

### 打包 Windows
```bash
npm run dist:win
```

### 新增模块页面的标准流程
1. 在 `ZhiYanModulePages.tsx` 中添加模块配置和组件
2. 如需独立复杂页面，在 `zhiyan/` 目录下新建组件
3. 在 `chat-store-types.ts` 中确认路由已注册
4. 在 `Workbench.tsx` 的路由渲染区域添加条件分支
5. 在 `ZhiYanSidebar.tsx` 的 NAV_ITEMS 中确认导航项

### 关键文件快速定位
| 需求 | 文件 |
|------|------|
| 添加新路由 | `src/renderer/src/store/chat-store-types.ts` |
| 添加路由 action | `src/renderer/src/store/chat-store-app-actions.ts` |
| 侧边栏导航 | `src/renderer/src/components/zhiyan/ZhiYanSidebar.tsx` |
| 首页仪表盘 | `src/renderer/src/components/zhiyan/ZhiYanDashboard.tsx` |
| 模块页面 | `src/renderer/src/components/zhiyan/ZhiYanModulePages.tsx` |
| 核心工作台路由 | `src/renderer/src/components/Workbench.tsx` (搜 `route ===`) |
| 设置页 | `src/renderer/src/components/SettingsView.tsx` |
| Store 初始化 | `src/renderer/src/store/chat-store.ts` |
| 打包配置 | `electron-builder.config.cjs` |
| 国际化 | `src/renderer/src/locales/zh/common.json` |

---

## 📝 上次会话结束状态

**日期**: 2026-06-10
**状态**: Phase 2 Step 2.1（智能教案模块）已完成并通过用户端到端验证
**已完成**:
- 智能教案模块完整功能：PDF 选择 → 文本提取 → AI 教案生成 → DOCX 输出到源目录
- Electron sandbox 适配：新增 pickFile / readFileBinary 两个 IPC 通道
- Workspace 传递机制：onStartChat → handleModuleQuickPrompt → createThread({ workspaceRoot })
- UI/UX 优化：课程信息可选填、占位符更新、按钮文案优化

**下一步**: Phase 2 Step 2.2（课件 PPT 模块），可复用 pickFile / readFileBinary IPC

**关键修改文件**:
- `src/renderer/src/components/zhiyan/ZhiYanModulePages.tsx` — SyllabusPage 完整交互
- `src/renderer/src/components/Workbench.tsx` — handleModuleQuickPrompt 传 workspaceRoot
- `src/main/ipc/register-app-ipc-handlers.ts` — file:pick-file + file:read-binary
- `src/preload/index.ts` — pickFile + readFileBinary
- `src/shared/ds-gui-api.ts` — 类型定义
- `src/renderer/src/lib/pdf-text-extractor.ts` — PDF 文本提取工具

---

*最后更新: 2026-06-10T19:40*
