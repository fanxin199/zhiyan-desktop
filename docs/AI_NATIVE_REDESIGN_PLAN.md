# 智研助手 AI 原生重组实施计划

> **适用对象**：任何进入本项目的 AI agent（Codex、Claude、Gemini 等）与项目维护者。
>
> **使用方式**：每次只执行一个 `[ ]` 任务。开始时标记为 `[~]`，满足第八节完成标准后标记为 `[x]` 并提交；同时更新第十一节“当前执行位置”。下次进入时从第一个未完成任务继续。
>
> **执行顺序**：P0 → P1 → P2 → P3 → P4，同一阶段内按编号执行。后一阶段依赖前一阶段建立的成果模型和公共组件，不得跳做。
>
> **开发流程**：按 `docs/DEVELOPMENT.md`，每个任务在独立 worktree 中完成，测试通过后快进合并到 `main`。
>
> **本计划的地位**：自 2026-10-22 起取代已全部完成的 `docs/UX_OPTIMIZATION_PLAN.md`，成为当前优化计划。与既有计划冲突之处以本计划为准，详见第九节。

## 一、重组目标

**没有编程经验的老师用一句话交代任务，AI 完成重复劳动并交付可直接使用的成果；老师用一句话提出修改，AI 自动修改，每次修改都能撤销。界面简洁、一致、优雅。**

体验指标（在 Task 4.5 真实教师验证中测量）：

| 指标 | 目标 |
| --- | --- |
| 从打开软件到拿到第一份可编辑成果（教案或文稿） | ≤ 3 分钟，老师主动输入不超过 2 次 |
| 一次“说一句就改”（单节或单页）从发出到看到修改 | ≤ 30 秒 |
| 工作界面出现 §5.5 左列术语的次数 | 0 |
| 每屏主按钮数量 | ≤ 1 |

## 二、审查结论（2026-10-22，基于 v0.2.0-alpha.1）

审查方式：开发版逐页截图（亮色主题，1440×900）与渲染层源码统计。

### 2.1 信息架构与一致性

1. **入口多且重叠**：除工作台外有 11 个同级入口，其中写作相关 5 个（文本写作、综述撰写、自然基金撰写、自由写作台、AI 对话）；“文献阅读”包含组会汇报 PPT，与“课件 PPT”重叠；“能力中心”分组实际放的是写作台、对话和文件管理。
2. **模块之间割裂**：首页“最近使用”显示会话名（如 `Write Assistant`、`新会话`）而不是成果；成果分散在 `default_workspace`、`write_workspace` 和课件项目包中；科研类模块的结果以对话形式呈现，需要手动“整理到自由写作台”。
3. **页面各自为政**：教案（居中窄版）、课件（左对齐宽版 + 卡片步骤条）、教材（胶囊步骤条 + 顶栏）、文件管理（全宽）各用一套页头和宽度；进入设置（`AppShell.tsx` 用 `SettingsView` 整体替换 `Workbench`）或自由写作台（`Workbench.tsx` 用 `WriteSidebar` 替换 `ZhiYanSidebar`）时主导航消失；综述页、基金页标题图标与侧栏不一致（`REVIEW_CONFIG.icon` 为 `Search`、`GRANT_CONFIG.icon` 为 `PenTool`，注册表中分别为 `ScrollText`、`Award`）。

### 2.2 视觉与可读性

1. 首页 11 张不同色相的饱和渐变卡片，带 hover 放大，主次不清。
2. **未定义的颜色类**：`text-ds-text` 在 10 个文件中出现 128 次，但 `tailwind.config.js` 没有 `ds.text` 键，也没有对应 CSS，这些元素只能继承父元素颜色；`*-ds-card-muted`（3 处）、`*-ds-surface-subtle`（1 处）、`ring-offset-ds-bg`（4 处）同样未定义。另外，主题色都以 `var(...)` 定义，Tailwind v3 不为其生成 `/N` 透明度类，`bg-accent/10` 这类写法有 338 处从未生效。（已在 Task 0.1.1 修复）
3. **字号**：601 处 `text-[Npx]` 硬编码，其中 443 处 ≤ 13px（默认 1.1 倍界面缩放后约 ≤ 14px）；只有 5 个字号令牌。（已在 Task 0.1.3 迁移）
4. **颜色**：655 处直接使用 Tailwind 原色类、65 处十六进制颜色；主色 `#0088ff` 上的白字对比度约 3.5:1，低于 WCAG AA 正文要求的 4.5:1；`--ds-text-faint`（`#8a93a4`，对白底约 3.1:1）在 169 处用于文字。（原色类与十六进制颜色已在 Task 0.1.4 迁移）
5. 主按钮不可用时只显示浅蓝色，不说明缺什么。
6. **顶部内容被装饰光晕盖住**：`.ds-stage-surface::before` 是绝对定位的装饰层，按 CSS 绘制顺序画在页面内容之上，左上角的白色光晕把各页顶部的标题和图标洗成灰色。这才是标题发灰的直接原因。（已在 Task 0.1.1a 修复）

### 2.3 技术术语外露与缺陷

- 对话页：`default`（工作区名）、`自动 超高`（推理强度）、`输入 / 打开命令`。
- 写作助手：`Skills 3`、`auto`、`deepseek-v4-pro 超高`、`工作过程（N 步）`、`.md` 文件名和 Markdown 源码（`#`）。
- 文件管理：`C:\Users\...` 路径重复显示两次。
- 数据分析：`bulk mRNA`、`h5ad`、`marker`、`dotplot`、`FASTQ`。
- **缺陷**：写作助手回复中的 Markdown（加粗、编号列表）未渲染，显示为 `**` 原文。

### 2.4 AI 整合现状

- 流程是“老师填表 → 点生成 → 结果出现在对话里 → 手动整理 → 手动修改”，AI 是被调用的工具，而不是能接活的助手。
- 教案页展示 8 个字段，其中授课教师、学校、院系可由“教师信息”自动填充，`buildZhiYanManagedPrompt` 也已把教师信息交给 AI，却仍作为表单项展示。
- “按要求修改”只存在于两处：课件“重新生成本页”（`regenerateCoursewareSlide`，带修改要求）和写作台选区改写（`src/renderer/src/write/inline-edit.ts`）。
- 没有持久的成果版本历史（编辑器撤销仅限当前打开期间），AI 修改后无法回到任意旧版，因此流程只能依赖逐步确认。

## 三、设计原则

### 3.1 六条 AI 原生原则

| 原则 | 落到产品上 |
| --- | --- |
| 一句话开始 | 开始时只有一个输入框和材料区。AI 从老师的话和材料中抽取课程、对象、学时等，显示为可点改的“要点标签”；教师信息、项目信息和偏好自动带入，不再出现多字段表单。 |
| AI 先交完整初稿 | 流程自动跑完（定框架 → 写正文 → 自查 → 排版），只在检查点（§6.4）暂停；“逐步确认”作为可选模式。 |
| 说一句就改 | 所有成果用同一种修改方式：选中某页或某段（不选即整体）→ 说想法 → AI 修改并高亮 → 保留或撤销。每次修改自动生成版本，可回到任何一版。 |
| 记得老师 | 课程、课题项目记住对象、术语和科学问题；“我的偏好”记住老师说过的习惯并自动遵守，可查看和删除。 |
| 主动接力 | 完成一项后给出下一步按钮（教案 → 课件 → 讲稿 → 随堂题；文献 → 证据表 → 综述或基金），上下文自动带过去；也可以一句话下整套任务，在后台排队完成。 |
| 交付前自查 | 交稿前检查引用真实性、术语一致、每页字数、课时总长、基金各部分对应关系，以“AI 已自查：N 处建议”呈现，一键采纳。 |

### 3.2 自动化的边界

AI 默认直接做，但以下规则不变或更严格：

1. **成果写入**：AI 生成或修改的成果通过成果版本服务（§6.1）保存，不弹确认卡；每次写入生成新版本，可一键撤销。
2. **文件系统操作**：智能体对工作区任意文件的写入和命令执行继续按 GUI `on-request` 策略确认；覆盖、删除、移动、批量改名、安装软件、访问工作区外路径保持强制确认（与 `docs/PRODUCT_UPGRADE_PLAN.md` §2.3 一致）。
3. **科研严谨**：不以文件名或列名猜测样本分组和比较方向，AI 只能提出建议，必须由老师确认后才统计；无法核验的引用标为“待核实”，不写成确定事实；保留现有证据分级（`research-evidence-trace.tsx`）。
4. **尊重手改**：老师亲手修改过的内容不被 AI 覆盖；超出指定范围的改动一律丢弃并提示。
5. **意图不清**：关键要点无法推断时，AI 最多问一个问题；其余使用合理默认值，并在要点标签中标为“默认”。
6. **可控透明**：长任务显示阶段和预计时长，随时可停；AI 栏可查看本次发送给模型的材料范围；附件内容继续按不可信材料隔离。

### 3.3 界面原则

1. 每个功能只有两种状态：**开始态**（一句话）和**工作态**（左侧成果、右侧 AI 栏）。
2. 全应用只有一种 AI 交互样式：同一个输入框、同一种改动高亮、同一套保留与撤销、同一个版本菜单。
3. 每屏最多一个主按钮；不使用渐变、大面积色块和 hover 放大。
4. 技术选项不进入工作界面：模型、推理强度、Skills、工作区路径放进设置；工作界面最多保留“快速 / 深度”一个开关。
5. 不使用营销式区块：去掉功能介绍卡和“核心功能特点”列表；示例最多 3 条。
6. 生物医学专业术语照常使用（火山图、热图、UMAP、GO/KEGG），计算机与文件格式术语换成教师用语（§5.5）。

## 四、目标信息架构

### 4.1 导航

最终形态（P3 完成后）：

```text
首页
我的课程      教学项目：教案、课件、讲稿、教材章节、随堂题
我的课题      科研项目：文献、文稿、数据分析
文件库
──────
AI 助手       全局侧栏，任何页面可打开
设置          覆盖层，不替换导航
```

过渡形态（P1 完成后、P3 之前；“我的课程 / 我的课题”依赖 P3 的项目模型）：

```text
首页
教学：教案 · 课件 · 教材
科研：文稿 · 文献 · 数据分析
文件库
──────
AI 助手
设置
```

### 4.2 现有入口的去向

| 现有入口（路由 id） | 新位置 | 说明 |
| --- | --- | --- |
| 工作台 `dashboard` | 首页 | 一句话入口、继续上次的工作、快速开始 |
| 智能教案 `syllabus` | 教案 | AI 工作页 |
| 课件 PPT `ppt-gen` | 课件 | 继续使用 Project v2 / `.zhiyan-courseware` |
| 教材编写 `textbook` | 教材 | AI 工作页 |
| 文本写作 `paper-polish` | 文稿 · 论文模板 | 合并 |
| 综述撰写 `review-writing` | 文稿 · 综述模板 | 合并 |
| 自然基金撰写 `grant-writing` | 文稿 · 国自然模板 | 合并 |
| 自由写作台 `write` | 文稿 · 空白文稿与编辑器 | 唯一的文稿编辑器 |
| 文献阅读 `literature` | 文献 | 组会 PPT 改为下一步“做成汇报 PPT”，交给课件流程 |
| 科研数据分析 `bioinformatics` | 数据分析 | AI 工作页 |
| AI 对话 `chat` | 全局 AI 助手 | 原有对话保留在“全部对话”中 |
| 文件管理 `file-manager` | 文件库 | P3 起按项目分组 |

旧路由 id 必须重定向到新位置，已保存的会话、`moduleContext` 和最近记录不得失效。

### 4.3 页面类型

全应用只保留以下几种页面：

1. **首页**：问候（教师姓名）→ 一句话输入框（识别意图后打开对应工具并预填要点）→ 继续上次的工作（最多 6 个成果卡：项目名、成果类型、阶段或进度、更新时间）→ 快速开始（教学 3 个、科研 3 个，中性卡片 + 领域色图标）→ P3 后增加课程与课题摘要。
2. **AI 工作页**（所有工具通用）：
   - 开始态：一行标题、一句话输入框（可拖入材料）、最多 3 个示例、最近的同类成果。
   - 工作态：顶栏（项目与成果名、要点标签、版本菜单、导出）+ 左侧成果画布 + 右侧 AI 栏（对话、修改结果、自查、下一步，可收起）。
3. **项目页**（P3）：项目要点、成果清单（状态与进度）、下一步建议、项目文件。
4. **文件库**：现有文件管理页精简后保留。
5. **设置**：覆盖层。

## 五、设计规范

### 5.1 字号

界面缩放 `--ds-ui-scale`（“字体大小”小 / 中 / 大 = 1.0 / 1.1 / 1.2，默认 1.1）作用于下列设计值之上。字号令牌只决定字号，取值来自 `base-shell.css` 中的 `--ds-font-*` 变量；字重用 `font-*` 类单独指定（下表为推荐字重）；长段落（AI 回复、文献报告、文稿）加 `leading-prose`（`--ds-leading-prose`，1.7）。

| 令牌 | 字号 | 默认缩放下约 | 推荐字重 | 用途 |
| --- | --- | --- | --- | --- |
| `text-display` | 24px | 26px | 600 | 首页问候、开始态标题 |
| `text-title` | 18px | 20px | 600 | 页面标题、成果一级标题 |
| `text-heading` | 15px | 16.5px | 600 | 区块和卡片标题 |
| `text-body` | 14px | 15.4px | 400 | 正文、输入框、AI 回复 |
| `text-small` | 13px | 14.3px | 400 | 说明文字、要点标签 |
| `text-caption` | 12px | 13.2px | 400 | 时间等元数据（最小字号） |

迁移映射（P0 机械替换：只换字号，原有的 `font-*`、`leading-*` 类保持不变；完成后删除 `ui-*` 字号令牌）：

| 现有写法 | 替换为 |
| --- | --- |
| `text-[10px]` ~ `text-[12px]`、`text-ui-caption`、`text-ui-meta`、`text-xs` | `text-caption` |
| `text-[12.5px]`、`text-[13px]`、`text-ui-body-sm` | `text-small` |
| `text-[13.5px]`、`text-[14px]`、`text-ui-body`、`text-sm` | `text-body` |
| `text-[15px]`、`text-[16px]`、`text-base` | `text-heading` |
| `text-[18px]` ~ `text-[20px]`、`text-lg`、`text-xl` | `text-title` |
| `text-2xl` 及以上、`text-ui-title` | `text-display` |

表外取值按就近原则：7–9px 的界面文字归入 `text-caption`；14.5px 的加粗标题归入 `text-heading`、正文归入 `text-body`；17px 归入 `text-title`；22px 及以上和 `clamp()` 流式字号归入 `text-display`。Tailwind 默认字号自带行高，迁移时没有显式 `leading-*` 的地方补上等值行高（如 `text-sm` → `text-body leading-5`）。幻灯片缩略图（`SlidePreview`）显示的是缩小的幻灯片，改用专用的 `text-thumb-title`（10px）、`text-thumb-callout`（8px）、`text-thumb-body`（7px），只能在缩略图中使用。

文稿编辑器与 Markdown 预览（`write-editor.css`、`markdown-code.css`）可以保留专用排版，但字号须引用令牌变量。

### 5.2 颜色

| 用途 | 令牌 | 取值 | 规则 |
| --- | --- | --- | --- |
| 主文字 | `--ds-text`（Tailwind `ds-ink`，别名 `ds-text`） | `#222222`；深色 `#ffffff` | 标题、正文 |
| 次要文字 | `--ds-text-muted` | `#5f6878`（对白约 5.6:1）；深色 `#c7c7c7` | 说明、元数据 |
| 弱化文字 | `--ds-text-faint` | `#8a93a4`（对白约 3.1:1） | 仅限占位符、禁用态和 ≥ 18px 的非关键文字 |
| 主色（文字与线条） | `--ds-accent` | `#0088ff` → `#1769E0`（对页面底色约 4.7:1）；深色 `#339cff` | 链接、蓝色标题、图标、边框、焦点环（`text-accent`、`border-accent`、`ring-accent`） |
| 主色（实心填充） | `--ds-accent-fill`（新增） | `#1769E0`，深色同值（白字约 5.1:1） | 承载白字的主按钮和选中态；`bg-accent` 自动使用 |
| 主色（浅底文字） | `--ds-accent-strong`（新增） | `#1556b8`；深色 `#339cff` | 放在主色浅底上的蓝色文字（`text-accent-strong`） |
| 成功文字 | `--ds-success` | `#128a4a` → `#0b6b3a`（对页面底色约 6:1，对成功浅底约 5.4:1）；深色 `#40c977` | 成功状态文字，可放在 `bg-ds-success-soft` 上 |
| 危险文字 | `--ds-danger` | `#c92a2a` → `#b42318`（对危险浅底约 5.3:1）；深色 `#fa423e` → `#ff6b66` | 错误状态文字，可放在 `bg-ds-danger-soft` 上 |
| 成功、危险填充 | `--ds-success-fill`、`--ds-danger-fill`（新增） | `#15803d`、`#c92a2a`，深色同值（白字 ≥ 5:1） | 承载白字的实心底；`bg-ds-success`、`bg-ds-danger` 自动使用 |
| AI 技能色 | `--ds-skill` | `#7c3aed` → `#6d28d9`（对技能浅底约 5.6:1）；深色 `#ad7bf9` | 技能、机制假设等标签 |
| 遮罩 | `--ds-overlay`（新增） | `rgba(15, 23, 42, 0.4)`；深色 `rgba(0, 0, 0, 0.6)` | 对话框背后的遮罩（`bg-ds-overlay`） |
| 标记高亮 | `--ds-highlight`（新增） | `rgba(247, 209, 84, 0.48)`；深色透明度 0.3 | 文稿中的 `==标记==` 高亮 |
| 图表 | Tailwind `ds-chart`（取 `--ds-accent`） | 同主色文字 | 热力图、模型用量等单色系图表，用透明度区分层级 |
| 幻灯片内容色 | Tailwind `slide-*`（固定值） | 与导出课件主题一致：纸 `#ffffff`、墨 `#172b35`、强调 `#d97706` 等 | 只用于幻灯片缩略图和图片、PDF 预览底，两套主题不变 |
| 教学领域色 | `--ds-domain-teaching`、`-soft` | 字 `#0F6E56` / 底 `#E1F5EE`（约 5.5:1）；深色字 `#9FE1CB` / 底 `#085041`（约 6.3:1） | 仅用于图标底色和标签 |
| 科研领域色 | `--ds-domain-research`、`-soft` | 字 `#3C3489` / 底 `#EEEDFE`（约 8.9:1）；深色字 `#CECBF6` / 底 `#3C3489`（约 6.6:1） | 仅用于图标底色和标签 |
| 警示文字 | `--ds-warning`（新增） | `#8A5A00`（对白约 5.9:1）；深色 `#EF9F27` | 与现有 `--ds-warning-soft` 配对 |
| AI 修改高亮 | 复用 `--ds-success-soft`、`--ds-danger` | — | 新增内容浅绿底；删除内容红色删除线 |

规则：所有新令牌必须同时定义深色值（`[data-theme="dark"]`）并单独检查对比度，由 `src/main/renderer-theme-contrast.test.ts` 按亮、暗两套主题自动检查；组件中禁止新增 Tailwind 原色类和十六进制颜色（由 `src/main/renderer-raw-colors.test.ts` 检查；白色只允许用于实心底上的文字、图标和开关圆钮；代码高亮主题 `code-highlighting.ts` 例外）。已知差距留给 Task 4.3.1：现有 `text-accent` 放在主色浅底上的地方约 3.9–4.1:1，应改用 `text-accent-strong`。

### 5.3 间距、圆角、边框、动效

- **间距**：取 4 的倍数（4 / 8 / 12 / 16 / 24 / 32 / 48）。页面左右留白 32px；开始态内容最大宽度 720px；工作态 AI 栏默认 360px，可拖动到 320–480px，可收起。
- **圆角**：控件 `rounded-lg`（8px），卡片 `rounded-xl`（12px），浮层面板 `rounded-2xl`（16px，Tailwind 默认值）；不再使用 `rounded-3xl`。
- **边框与阴影**：卡片用 1px 发丝线（`--ds-border-muted`）且无阴影；只有菜单、对话框等浮层使用阴影。
- **动效**：150–200ms 淡入或位移；不使用 `hover:scale`。

### 5.4 组件规则

- **按钮**：主按钮（实心主色）每屏最多 1 个，其余用描边或文字按钮。条件不满足时按钮保持可点，点击后把焦点移到缺失项并在旁边说明（如“还差：上传教材”）；确需禁用时必须同时显示原因。
- **一句话输入框**：全应用同一个组件——多行自动增高，可拖入或粘贴材料，附件以标签显示，Enter 发送、Shift+Enter 换行。
- **要点标签**：显示 AI 理解的参数及来源，点击即可修改；默认值标“默认”。
- **卡片与列表**：白底 + 发丝线、无渐变；条目较多时用分隔线列表，不堆叠卡片。
- **状态**：加载显示阶段文字和进度条；空状态是一句邀请加一个动作；错误说明发生了什么和怎么办，不显示原始报错。
- **图标**：lucide 线性图标，统一描边粗细；同一功能在全应用使用注册表提供的同一个图标。

### 5.5 术语对照

| 现在 | 改为 | 位置 |
| --- | --- | --- |
| `default`（工作区名） | 不显示，改为当前项目或成果名 | `SessionHeader.tsx` |
| `自动 超高`（推理强度） | 移出工作界面；设置中“AI 模式：快速 / 深度” | `FloatingComposerModelPicker.tsx`、`src/renderer/src/locales/zh/common.json` |
| `输入 / 打开命令` | 删除 | `common.json` 的 `composerSlashHint` |
| `Skills N` | 不显示 | `message-timeline-bubbles.tsx`（`toolActiveSkills`） |
| `工作过程（N 步）` | “查看处理过程”，默认折叠 | `common.json` 的 `processSteps` |
| `deepseek-v4-pro 超高`、`auto` 等模型与模式标识 | 不显示 | 写作助手输入区 |
| `welcome.md` 等文件扩展名、Markdown 符号 | 显示文稿标题；编辑器默认所见即所得 | 写作侧栏、页头、编辑器 |
| `C:\Users\...\default_workspace` | “我的文件”或项目名；完整路径只出现在“在资源管理器中显示” | `FileManagerWorkspacePage.tsx` |
| `bulk mRNA`、`h5ad`、`marker`、`dotplot`、`FASTQ` | 批量转录组表格、单细胞数据文件、标志基因、点图；不提 FASTQ | `BIOINFORMATICS_CONFIG` |
| `Write Assistant`、`新会话` | 自动命名为任务摘要，如“第八章教案” | 会话命名 |
| 智能体 | AI | 全部界面文案 |

## 六、核心技术设计

### 6.1 成果与版本

老师关心的每一份交付物都是一个**成果**。成果登记表由新增的 `src/main/services/artifact-service.ts` 管理，通过经 schema 校验的 IPC 对外提供：

```ts
type ArtifactKind =
  | 'lesson-plan' | 'courseware' | 'speaker-notes' | 'textbook-chapter'
  | 'document' | 'literature-report' | 'evidence-table'
  | 'analysis-report' | 'question-set'

type ArtifactRecord = {
  id: string
  kind: ArtifactKind
  title: string
  projectId: string | null          // P3 之前为 null，即“未归档”
  toolId: string                    // 注册表中的工具 id
  storage: { type: 'file' | 'courseware-project'; path: string }
  stage: string                     // 教师可读的阶段，如“图片审核”
  progress?: number                 // 0–1
  currentVersion: number
  createdAt: string
  updatedAt: string
}

type ArtifactVersion = {
  version: number
  createdAt: string
  source: 'ai-generate' | 'ai-revise' | 'teacher-edit' | 'restore'
  summary: string                   // 如“案例导入改为高血压急症”
  instruction?: string              // 老师的修改原话
}
```

- 登记表存放在应用数据目录，启动时校验路径是否仍然存在。
- 版本快照建议存放在成果所在目录的 `.zhiyan/versions/<artifactId>/`，随文件夹一起备份和迁移：文本类保存全文，课件保存项目 JSON，图片按内容哈希复用、不重复复制。默认保留最近 50 个版本，更早的每天保留一个。最终方案在 Task 1.1 中确认。
- 恢复旧版本也生成一个新版本，历史不被改写。

### 6.2 说一句就改

```ts
type RevisionScope =
  | { type: 'whole' }
  | { type: 'section'; sectionId: string }             // 教案环节、文稿小节、教材节
  | { type: 'slide'; slideId: string }                 // 课件页
  | { type: 'selection'; from: number; to: number }    // 文稿选区
  | { type: 'figure'; figureId: string }               // 分析图表

type RevisionRequest = {
  artifactId: string
  baseVersion: number
  scope: RevisionScope
  instruction: string
}

type RevisionResult = {
  newVersion: number
  summary: string
  changes: Array<{ ref: string; before: string; after: string }>
}
```

交互：在画布中选中对象（不选即整体）→ 在 AI 栏说想法 → 生成新版本，画布逐字高亮变化（新增浅绿底、删除红色删除线）→ AI 栏显示“已修改××，N 处变化”及“保留 / 撤销”（撤销即恢复到 `baseVersion`），不操作视为保留。

守卫：

- 结果只能替换 `scope` 内的内容，越界改动丢弃并提示。
- 来源为 `teacher-edit` 且不在 `scope` 内的内容不得改动。
- `baseVersion` 已过期（期间老师又改过）时，基于最新版本重新执行。

复用：`inline-edit.ts`（选区解析与替换）、`regenerateCoursewareSlide`（单页重写）、`term-propagation.ts`（术语一致替换）。现有 `DiffView.tsx` 面向代码差异，文字修改高亮需要新增按字（中文）或按词（英文）的比较组件。

### 6.3 意图要点（一句话开始）

```ts
type IntentField = {
  key: string
  label: string
  value: string
  source: 'teacher' | 'material' | 'project' | 'profile' | 'preference' | 'default'
  required: boolean
}

type IntentBrief = {
  toolId: string
  fields: IntentField[]
  missing: string[]        // 必填但无法推断的字段
  question?: string        // 至多一个澄清问题
}
```

- 每个工具在 `src/shared/` 中用 zod 定义自己的要点字段。例如教案：课程、章节、授课对象、学时、教学方法、侧重点；课件：主题、对象、时长、教材文件。
- 抽取在主进程完成，复用 `courseware-generation-service.ts` 的 OpenAI 兼容结构化调用和 `provider-retry.ts`。
- 合并优先级：本次输入 > 材料 > 项目 > 教师信息 > 偏好 > 默认值；标签显示来源（如“来自教师信息”）。

### 6.4 自动流程与检查点

- 每个工具把现有步骤定义为阶段，例如课件：读取教材 → 识别图片 → 生成框架 → 逐页撰写 → 配图 → 自查 → 可导出。
- 默认“自动完成”：连续执行，只在检查点暂停；设置中可切换为“逐步确认”（每个阶段后暂停）。
- 检查点只有以下几类：

| 检查点 | 何时出现 |
| --- | --- |
| `confirm-grouping` | 数据分析的样本分组与比较方向，**必须**确认 |
| `missing-required` | 必填要点无法推断 |
| `unverified-citation` | 引用无法核验 |
| `uncertain-image` | 图片版权不明或匹配置信度低 |
| `outline` | 长文或教材大纲；仅在“逐步确认”模式或篇幅超过阈值时出现 |

- 运行时显示阶段名、预计剩余时间和停止按钮；中断后从最近完成的阶段继续（沿用 `research-task-card.tsx` 的恢复机制）。

### 6.5 两条执行通道

| 通道 | 适用 | 要求 |
| --- | --- | --- |
| 结构化生成（主进程直接调用模型，zod 校验输出） | 教案、课件、教材、文稿的生成与修改；意图抽取；自查 | 输出可预测、可比较、可测试 |
| 智能体任务（Kun） | 需要运行代码、联网检索或读写多个文件的任务：数据分析、最新文献检索、文件整理 | 结果必须写回成果的新版本，不能只留在对话里 |

### 6.6 项目与记忆（P3）

- 在现有 `teacherProjects`（`TeacherProjectSettingsV1`，`type: 'teaching' | 'research'`）和 `moduleContext`（`src/renderer/src/lib/module-context.ts`）基础上扩展，不另起一套：
  - 课程项目要点：课程名、章节、授课对象、学时、专业、教学目标、术语表。
  - 课题项目要点：题目、科学问题、核心假说、关键术语、目标期刊或基金类型。
- 目录：`<工作区>/课程/<课程-章节>/`、`<工作区>/课题/<课题名>/`、`<工作区>/未归档/`。
- 迁移：现有课件项目包、写作文件和对话不移动原文件，只登记为“未归档”成果，由老师在项目页一键归入。
- 偏好记忆：

```ts
type TeacherPreference = {
  id: string
  text: string                       // 如“课件每页不超过 5 行”
  scope: 'global' | 'tool' | 'project'
  toolId?: string
  projectId?: string
  source: 'explicit' | 'suggested'
  createdAt: string
}
```

当修改指令含“以后都”“每次”“一律”等表述，或同类修改出现 2 次以上时，AI 栏询问“记住这个习惯？”；偏好在设置“我的偏好”中查看、编辑和删除，并注入 `buildZhiYanManagedPrompt` 与结构化生成提示。

### 6.7 后台任务（P3）

- “一句话做整套”（如“第八章做教案、课件和 10 道选择题”）拆成多个工具运行，排队执行并共享项目上下文。
- 任务中心显示进度，可暂停、取消、重试；完成后按现有通知设置发送 Windows 通知；应用重启后恢复队列和已完成阶段。

## 七、分阶段任务

### P0 体验打底（不改变功能，先解决一致性与可读性）

#### Task 0.1 · 设计令牌

- [x] **0.1.1** 修复未定义的颜色类：在 `tailwind.config.js` 中增加 `ds.text`（指向 `--ds-text`）和 `ds.card-muted`；`*-ds-surface-subtle` 改用已有的 `ds-subtle`，`ring-offset-ds-bg` 改为 `ring-offset-ds-card`。实施中发现 `/N` 透明度类从未生成，已改用 `color-mix(... <alpha-value> ...)` 定义全部主题色，并把 23 处不在 5 的倍数档位上的透明度归整到最近档位。新增 `src/main/renderer-theme-colors.test.ts`，用真实 Tailwind 编译渲染层用到的每个主题色类，并断言都有 CSS 输出。
- [x] **0.1.1a** 页面顶部的装饰光晕由覆盖层改为 `.ds-stage-surface` 的背景层，不再盖住标题和图标；新增 `src/main/renderer-stage-surface.test.ts` 防止回退。（实施 0.1.1 时发现）
- [x] **0.1.2** 按 §5.1–§5.3 建立令牌：`--ds-font-*` 字号变量与 `text-caption` ~ `text-display`、`leading-prose`；主色改为 `#1769E0`，新增 `--ds-accent-fill` 供 `bg-accent` 使用（深色模式按钮白字由 2.9:1 提高到 5.1:1）；成功文字改为 `#0e7a42`，新增 `--ds-warning` 和教学、科研领域色（均含深色值）；圆角 `xl` 改为 12px，`2xl` 恢复为 16px。新增 `src/main/renderer-theme-contrast.test.ts`，按亮、暗两套主题检查 56 组文字与底色组合，均 ≥ 4.5:1。
- [x] **0.1.3** 按 §5.1 映射表分四批迁移（`components/zhiyan/` → `components/write/` → `components/chat/` → 其余）：749 处字号写法（603 处 `text-[Npx]`、1 处 `clamp()`、123 处 `ui-*`、26 处 Tailwind 默认字号，幻灯片缩略图 4 处另行处理）改为 `text-caption` ~ `text-display`；24 处原本依赖默认字号行高的地方补上等值 `leading-*`；删除 `ui-*` 字号令牌。新增 `src/main/renderer-font-sizes.test.ts`，禁止新增像素字号、Tailwind 默认字号和 `ui-*` 字号，并限定 `text-thumb-*` 只在缩略图中使用。
- [x] **0.1.4** 将 Tailwind 原色类、十六进制颜色和半透明黑白色按语义改为令牌，分四批完成（`components/zhiyan/` → `components/write/` → `components/chat/` → 其余）：红/橙黄/绿/蓝/紫分别对应危险、警示、成功、主色、技能色，灰色按深浅对应主文字、次要文字、弱化文字、边框和底色，`dark:` 配对随令牌自动切换后删除；补充状态色填充、`accent-strong`、遮罩、标记高亮、图表色和幻灯片内容色（见 §5.2），状态文字放在各自浅底上也 ≥ 4.5:1。特殊处理：模块页头图标改用教学/科研领域色块，教案提交按钮和首次配置对话框的渐变改为实心主色，侧栏十六进制灰改为中性文字令牌，热力图和模型用量图改为单色系图表，代码改动里的文件类型标签改为中性标签，CSS 与组件中 22 处旧主色字面量改为由主色令牌派生。新增 `src/main/renderer-raw-colors.test.ts`，禁止新增原色类、十六进制颜色、半透明黑白色和旧主色字面量。

#### Task 0.2 · 统一页头与图标

- [x] **0.2.1** 新增 `PageHeader` 组件（图标、标题、一句说明、右侧操作区）和 `PageColumn` 内容列，替换 `ModulePageShell`、`SyllabusPage`、`CoursewarePage`、`TextbookWorkbenchPage`、`FileManagerWorkspacePage` 各自的页头，统一内容宽度：左右留白 32px，开始态内容 720px，课件、教材、文件管理等工作页 1152px；教材页的步骤条随内容列对齐，文件管理页去掉通栏白底页头。图标色块按注册表分区取教学、科研或中性色，与首页卡片共用 `ICON_TONE_CLASSES`（`tone` 直接使用分区 id，供 Task 0.2.2 接入注册表）。课件页标题由宣传语改为“课件 PPT 生成”，文件管理页说明改为一句话（路径仍显示在下方路径栏），文本写作和综述页的模块提示移到任务卡上方；删除未使用的 `PPT_CONFIG`、`TEXTBOOK_CONFIG`。新增 `PageHeader.test.ts`，渲染这五个页面，断言每页只有一个标题且位于统一页头，内容宽度只取 720px 或 1152px。
- [x] **0.2.2** 页面图标统一取自 `zhiyan-module-registry.ts`，删除各 `*_CONFIG.icon`：`PageHeader` 改为接收注册表 id（`module`），由注册表提供图标和分区色，模块配置以 `moduleId` 代替 `icon` 与 `tone`。综述页图标由 `Search` 改为 `ScrollText`、基金页由 `PenTool` 改为 `Award`，与侧栏和首页一致。`PageHeader.test.ts` 扩展到九个工具页，断言页头图标与注册表一致。
- [ ] **0.2.3** 删除模块页的“核心功能特点”区块（`config.features`）；示例最多保留 3 条。

#### Task 0.3 · 主导航不再被替换

- [ ] **0.3.1** 设置改为覆盖层：`AppShell.tsx` 不再用 `SettingsView` 整体替换 `Workbench`，关闭后回到原页面并保留状态。
- [ ] **0.3.2** 自由写作台保留主导航：写作空间文件树改为写作页内可收起的二级面板，`WriteSidebar` 不再替换 `ZhiYanSidebar`。

#### Task 0.4 · 首页去噪

- [x] **0.4.1** 去掉渐变卡和 hover 放大（`ZhiYanDashboard.tsx` 与注册表 `dashboard.gradient`），改为中性卡片 + 领域色图标；问候语显示教师姓名（来自教师信息，缺省为“老师”）。（颜色迁移需要同时去掉渐变，已随 Task 0.1.4 提前完成）
- [ ] **0.4.2** “最近使用”显示可读名称：会话自动以任务摘要命名，显示所属功能，隐藏空会话（成果化在 Task 1.6 完成）。

#### Task 0.5 · 术语与缺陷

- [ ] **0.5.1** 按 §5.5 修改文案与显示逻辑；推理强度移入设置，简化为“AI 模式：快速 / 深度”。
- [ ] **0.5.2** 修复写作助手回复 Markdown 未渲染：在 `WriteAssistantPanel` → `MessageTimeline` 路径中复现并定位走纯文本渲染的分支，统一使用 `AssistantMarkdown`；回归测试覆盖中文标点紧邻 `**` 和编号列表。（2026-10-22 两次复现：冷启动后首次进入写作台时，历史回复以纯文本显示，`**` 原样可见；再次进入同一页面后由 `ds-markdown` 正常渲染为列表和加粗。应排查会话恢复阶段的渲染分支。）
- [ ] **0.5.3** 不可用的主按钮按 §5.4 改为“可点击并指出缺少项”，包括 `ResearchTaskEntry` 的发送按钮、课件“生成课件蓝图”、教材“AI 解析出版社要求”等。

#### Task 0.6 · P0 验收

- [ ] **0.6.1** 全部页面在亮、暗两种主题下截图审查（方法见第八节）；更新 `docs/images/` 中的 README 截图。

### P1 AI 交互骨架

#### Task 1.1 · 成果登记与版本

- [ ] **1.1.1** 在 `src/shared/` 定义 §6.1 的类型与 zod schema；实现 `src/main/services/artifact-service.ts`（登记、查询、更新阶段与进度）；同步 `app-ipc-schemas.ts`、`register-app-ipc-handlers.ts`、`src/preload/index.ts` 和 `index.d.ts`。
- [ ] **1.1.2** 实现版本服务：创建、列出、恢复（恢复也生成新版本）和保留策略；所有路径经过工作区边界校验。
- [ ] **1.1.3** 现有产出接入登记：教案导出、课件项目保存（`courseware-project-service.ts`）、写作文件保存（`write-workspace-store.ts`）、数据分析输出清单（`analysis-reproducibility.ts`）。
- 验收：创建、修改、恢复、路径越界、文件被移走等情况均有单元测试。

#### Task 1.2 · AI 工作页组件

- [ ] **1.2.1** 新建 `src/renderer/src/components/ai-work/`：`AiWorkPage`（开始态 / 工作态）、`IntentComposer`（一句话输入框）、`AiSidePanel`（对话、修改结果、自查、下一步）、`ArtifactTopBar`（成果名、要点标签区、版本菜单、导出）。
- [ ] **1.2.2** `AiSidePanel` 使用精简的输入组件：不显示模型选择、推理强度、斜杠命令和 Skills；“快速 / 深度”读取设置。

#### Task 1.3 · 说一句就改

- [ ] **1.3.1** 在 `src/shared/` 定义 §6.2 的类型；主进程新增 `artifact-revision-service.ts`，走结构化生成通道，复用 `provider-retry.ts`。
- [ ] **1.3.2** 新增按字 / 按词的文字比较高亮组件；AI 栏显示修改摘要和“保留 / 撤销”。
- [ ] **1.3.3** 实现 §6.2 的三条守卫并补测试。

#### Task 1.4 · 文稿（合并写作入口）

- [ ] **1.4.1** 注册表新增工具“文稿”；`paper-polish`、`review-writing`、`grant-writing`、`write` 重定向到文稿并带模板参数；旧 id 的会话与 `moduleContext` 映射保持可用。
- [ ] **1.4.2** 文稿开始态：一句话输入 + 模板（论文、综述、国自然、空白）；把 `PAPER_CONFIG`、`REVIEW_CONFIG`、`GRANT_CONFIG` 中的任务类型、约束和示例迁移为模板定义（蓝图 → 分段写作 → 润色）。
- [ ] **1.4.3** 文稿工作态 = 现有写作编辑器（`WriteWorkspaceView.tsx`）+ `AiSidePanel`；默认所见即所得，不显示 Markdown 符号和扩展名；移除“整理到自由写作台”（结果本身就是文稿）。
- [ ] **1.4.4** 文稿接入“说一句就改”：选中段落或小节即可修改；整篇修改按小节分批并合并为一个版本。

#### Task 1.5 · 全局 AI 助手

- [ ] **1.5.1** AI 对话页改为全局 AI 助手侧栏：任何页面可打开，自动带入当前页面、成果和项目上下文；保留“新对话”和“全部对话”。
- [ ] **1.5.2** 在 AI 助手中提出的成果类请求（如“帮我写一份教案”）直接打开对应工具并预填要点，不在对话里生成长文。

#### Task 1.6 · 导航过渡与首页成果化

- [ ] **1.6.1** 侧栏调整为 §4.1 过渡形态：功能入口由 11 个减为 7 个，AI 助手与设置固定在底部。
- [ ] **1.6.2** 首页“继续上次的工作”改为读取成果登记表，显示项目或课程名、成果类型、阶段、进度和更新时间，点击回到该成果的工作态。

### P2 一句话完成

#### Task 2.1 · 公共能力

- [ ] **2.1.1** 实现 §6.3：各工具的要点 schema，以及主进程 `intent-brief-service.ts`（结构化抽取、来源标注、至多一个澄清问题）。
- [ ] **2.1.2** 要点标签组件：显示值和来源，点击修改，默认值标“默认”；合并教师信息与 `moduleContext`。
- [ ] **2.1.3** 实现 §6.4：阶段定义、检查点、“自动完成 / 逐步确认”设置、进度与停止、断点续跑。

#### Task 2.2 · 教案

- [ ] **2.2.1** `SyllabusPage` 改为 AI 工作页：开始态为一句话 + 材料；8 个表单字段和教学方法、侧重点选择改为要点标签，教师、学校、院系由教师信息带入后不再单独展示。
- [ ] **2.2.2** 教案画布按环节分区，支持环节级“说一句就改”；继续使用原生 DOCX 导出。
- [ ] **2.2.3** 基础校验：各环节时长之和与计划学时一致，不一致时给出一键调整。

#### Task 2.3 · 课件

- [ ] **2.3.1** 开始态：一句话 + 教材 PDF/PPTX；主题、对象、时长从话语和教材中抽取（复用 `coursewareDefaultsFromSettings`）。
- [ ] **2.3.2** 流程自动跑完：读取 → 识别图片 → 生成框架 → 逐页撰写 → 配图（`assignApprovedVisualsToSlides`）；图片审核改为“AI 已选 N 张，其中 K 张需要你看一眼”，只把低置信度或版权不明的图片作为检查点。
- [ ] **2.3.3** 逐页与整套修改：`regenerateActiveSlide` 的修改要求并入 AI 栏；整套指令（如“每页文字不超过 5 行”）逐页执行并合并为一个版本。
- [ ] **2.3.4** 讲稿同步：某页修改后，对应讲稿段落随之更新，可撤销。

#### Task 2.4 · 教材

- [ ] **2.4.1** 开始态：一句话 + 出版社要求（文件或文字）；格式规则自动解析（复用现有“AI 解析出版社要求”），字体、字号、行距等收进折叠的“排版要求”，不再出现在第一步。
- [ ] **2.4.2** 大纲 → 逐节写作自动推进；大纲只在“逐步确认”模式或章节较多时作为检查点；支持节级修改和全书术语一致替换（`term-propagation.ts`）。

#### Task 2.5 · 文献

- [ ] **2.5.1** 开始态：拖入 PDF 或粘贴 PMID/DOI/题名 + 一个问题；输出“文献报告”成果（研究问题、方法、逐图解读、结论、局限），不再是对话文本。
- [ ] **2.5.2** 多篇文献生成“证据表”成果，保留证据分级与标识；下一步“做成组会汇报 PPT”交给课件流程，“写进综述 / 基金”交给文稿。

#### Task 2.6 · 数据分析

- [ ] **2.6.1** 开始态：一句话 + 数据文件；AI 读取列名与元数据后提出分组和比较方向建议，作为 `confirm-grouping` 检查点由老师确认或修改，不得跳过。
- [ ] **2.6.2** 结果为“分析报告”成果（图表、统计结果、解释、可复现记录）；图表级修改（如“火山图阈值改为 1.5 倍”）通过智能体通道重新运行并生成新版本。
- [ ] **2.6.3** 保留环境预检和一键安装 / 修复，只在需要运行分析时出现。

### P3 项目与记忆

#### Task 3.1 · 课程与课题项目

- [ ] **3.1.1** 按 §6.6 扩展 `TeacherProjectSettingsV1`（项目要点、目录、成果列表），完成设置迁移与测试。
- [ ] **3.1.2** 建立项目目录与“未归档”；现有成果登记为未归档，不移动原文件。
- [ ] **3.1.3** 项目页：要点卡（修改后影响后续生成）、成果清单、下一步建议、项目文件。
- [ ] **3.1.4** 导航切换为 §4.1 最终形态；工具入口移到首页“快速开始”和项目页；文件库按项目分组。

#### Task 3.2 · 共享上下文

- [ ] **3.2.1** 项目要点自动注入意图抽取和生成提示（扩展 `buildZhiYanManagedPrompt`）；在工具里改动项目级信息时，询问是否同步到项目。

#### Task 3.3 · 偏好记忆

- [ ] **3.3.1** 实现 §6.6 的 `TeacherPreference` 存储、迁移与提示注入。
- [ ] **3.3.2** AI 栏识别可沉淀的习惯并询问“记住这个习惯？”；设置中新增“我的偏好”。

#### Task 3.4 · 主动接力

- [ ] **3.4.1** 成果完成后在 AI 栏给出下一步，替代首页静态的 `RECOMMENDATION_BY_SOURCE_MODULE`；点击后携带项目与成果引用直接开工。
- [ ] **3.4.2** 新增“随堂题”成果（选择题、简答题，含答案与解析，可导出 DOCX），复用内置 `assessment-designer` Skill，作为教学接力的终点。

#### Task 3.5 · 一句话做整套

- [ ] **3.5.1** 多成果请求拆解为任务队列，共享项目上下文。
- [ ] **3.5.2** 任务中心：进度、暂停、取消、重试、完成通知、重启后恢复。

### P4 自检与打磨

#### Task 4.1 · 交付前自查

- [ ] **4.1.1** 自查框架：每类成果定义检查项，结果显示为“AI 已自查：N 处建议”，逐条采纳或忽略，采纳即生成新版本。
- [ ] **4.1.2** 检查项：引用核验（扩展 `pubmed-service.ts`，新增按 PMID/DOI 获取元数据，无法核验标“待核实”）、术语一致（`term-propagation.ts`）、课件每页文字量、教案时长、国自然“科学问题—研究内容—技术路线—创新点”的对应。

#### Task 4.2 · 首次使用

- [ ] **4.2.1** 内置去标识的示例项目（一门课程、一个课题，各含完整成果）；首次启动填写 API Key 后，提供“看看示例”或“一句话开始”。

#### Task 4.3 · 无障碍与深色模式

- [ ] **4.3.1** 键盘可达（Tab 顺序、焦点环、Esc 关闭浮层）、读屏标签、所有文字对比度 ≥ 4.5:1；深色模式逐页检查。已知差距见 §5.2：成功、危险文字已在 Task 0.1.4 调整到浅底上也达标；剩余工作是把放在主色浅底上的 `text-accent` 改为 `text-accent-strong`。

#### Task 4.4 · 语音输入

- [ ] **4.4.1** 一句话输入框提示 Windows 语音输入（Win + H）；评估内置语音识别的隐私与服务商选项后，再决定是否开发。

#### Task 4.5 · 真实教师验证

- [ ] **4.5.1** 至少 5 位不同学科的教师完成“一句话做教案 → 说一句修改 → 导出 Word”和“一句话读文献 → 做成汇报 PPT”；按第一节的指标记录首个成果用时、修改次数和求助次数，结果写入 `docs/TEACHER_RELEASE_ACCEPTANCE.md`。

## 八、完成标准与验证方法

一个任务只有同时满足以下条件才可标记为 `[x]`：

1. 教师可见行为符合本计划，不出现 §5.5 左列的术语。
2. 成功、失败、取消、撤销和恢复路径有自动化测试。
3. 不放宽 Electron sandbox、IPC schema 或工作区路径边界；新增 IPC 时同步更新 schema、handler、preload 类型和测试。
4. 核心教学与写作流程不新增 Python 或 R 依赖。
5. 涉及界面的任务，在亮、暗两种主题下截图核对。
6. 通过：

```powershell
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
```

界面截图方法（不需要人工点击）：

```powershell
npx electron-vite dev --remoteDebuggingPort 9222
```

启动后从 `http://127.0.0.1:9222/json` 获取页面的 `webSocketDebuggerUrl`，通过 Chrome DevTools Protocol 用 `Emulation.setDeviceMetricsOverride` 固定为 1440×900，用 `Runtime.evaluate` 点击侧栏切换页面，用 `Page.captureScreenshot` 截图。截图仅用于核对，除 README 配图外不提交到仓库。

## 九、与既有计划的关系

- `docs/UX_OPTIMIZATION_PLAN.md`：已全部完成，作为历史参考。以下结论由本计划取代：
  - “不修改的部分”中的“QuickActionCard 渐变色卡片 + hover:scale 交互” → Task 0.4.1。
  - “不修改的部分”中的“ResearchTaskEntry 任务类型 + 文本 + 文件 + 示例四合一设计” → P2 一句话开始。
  - Task 2.1.3“涉及写文件 / 生成文档的操作先展示摘要再执行” → 成果写入直接执行并版本化、可撤销；工作区任意文件写入仍需确认（§3.2）。
  - Task 2.4 字号令牌 → 以 §5.1 为准。
  - Task 3.5 模块间区分提示 → 写作入口合并后删除。
- `docs/PRODUCT_UPGRADE_PLAN.md`：3.1“保留教学、科研、能力中心的分组侧栏，不强制合并成少数抽象入口”由 §4.1 取代。理由：入口重叠已经造成选择负担，项目化后入口按老师的工作而不是软件的功能来组织。安全执行、Python 引擎、证据追溯和发布原则继续有效。
- `docs/PROJECT_ROADMAP.md`：“下一阶段”的 P1 教学工作台、P2 科研工作台由本计划 P2–P3 落实；P3 可发布产品（代码签名、更新服务、崩溃报告）不在本计划范围内。

## 十、风险与对策

| 风险 | 对策 |
| --- | --- |
| 自动跑完整流程，API 用量和等待时间上升 | 显示预计时长；“快速 / 深度”开关；随时可停；阶段结果缓存，断点续跑不重复调用 |
| 发送给模型服务的材料更多 | AI 栏可查看本次发送的材料范围；保留隐私与考试保密材料提醒 |
| AI 修改越界或覆盖老师的内容 | 范围守卫、手改保护、每次修改可撤销 |
| 合并写作入口打乱老用户习惯 | 旧路由重定向；旧对话保留在“全部对话”；新版首次启动时一次性说明 |
| 项目迁移损坏已有文件 | 不移动原文件，只登记；归档由老师触发 |
| 结构化输出不稳定 | zod 校验 + 自动修复重试（沿用课件生成的修复机制）；失败时保留上一版本 |
| 改造周期长，界面新旧混杂 | 严格按阶段推进；每阶段结束做全页面截图审查；未改造页面也必须符合 P0 规范 |

## 十一、当前执行位置

当前执行任务：**Task 0.2.2 已完成。下一项为 Task 0.2.3（删除模块页“核心功能特点”区块，示例最多 3 条）。**
