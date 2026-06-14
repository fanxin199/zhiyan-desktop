# 修复教案模块 PDF 读取 + 解除 Kun 工作区沙箱限制

## 背景与问题

用户上传 PDF 文件后，Kun 运行时的 AI 始终报告"未找到 PDF 文件"，转而使用格式模板（移植免疫教案）的内容编写教案，而非提取用户上传的 PDF 内容。

### 根本原因

Kun 运行时所有文件工具（`read`、`write`、`edit`、`grep`、`find`、`ls`）均通过 [resolveWorkspacePath](file:///j:/software_build/deepseek_exe/kun/src/adapters/tool/builtin-tool-utils.ts#L60-L76) 做路径安全检查：

```typescript
// 第68-70行：如果路径"逃逸"工作区根目录，直接抛错
if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
  throw new Error(`path escapes the workspace root: ${inputPath}`)
}
```

- 当前工作区：`j:\software_build\deepseek_exe`
- PDF 文件位置：`C:\Users\yunfe\Desktop\test\第1章 医学免疫学概论.pdf`
- `read` 工具判定 PDF 路径"逃逸"了工作区，直接拒绝访问
- 唯一不受限制的 `bash` 工具，AI 又不会主动用它来读 PDF
- 结果：AI 读不到文件 → 退回使用 prompt 中的格式模板内容

## 修复方案（两部分）

---

### 第一部分：前端 PDF 文本提取（方案一 - 核心修复）

> 在 Electron 前端直接提取 PDF 文本内容，嵌入到 prompt 中，完全绕过 Kun 工具沙箱限制。

#### [NEW] [pdf-text-extractor.ts](file:///j:/software_build/deepseek_exe/src/renderer/src/lib/pdf-text-extractor.ts)

创建一个前端 PDF 文本提取工具函数：
- 利用 Electron 渲染进程可以访问 `fs` 的特性（通过 preload 或直接 File API）
- 使用浏览器原生 `FileReader` API 读取用户通过 `<input type="file">` 选择的文件
- 使用 `pdfjs-dist` (Mozilla PDF.js) 库提取文本内容
- 返回完整的文本内容（Markdown 格式）
- 处理中文编码、多页文档、表格等

关键设计：
```typescript
export async function extractPdfText(file: File): Promise<string> {
  // 1. 使用 FileReader 读取文件为 ArrayBuffer
  // 2. 使用 pdfjs-dist 的 getDocument() 加载 PDF
  // 3. 遍历所有页面，提取 textContent
  // 4. 拼接为格式化的文本内容
  // 5. 返回 Markdown 格式的文本
}
```

#### [MODIFY] [ZhiYanModulePages.tsx](file:///j:/software_build/deepseek_exe/src/renderer/src/components/zhiyan/ZhiYanModulePages.tsx)

修改 `SyllabusPage` 组件：

1. **文件选择后立即提取文本**：在 `handleFileChange` 中，选择 PDF 后立即调用 `extractPdfText()` 提取内容，保存到状态 `extractedContent`
2. **显示提取进度**：添加 loading 状态和进度提示
3. **prompt 中直接嵌入文本**：不再让 AI 用工具读文件，而是把提取的文本直接放入 prompt 的"内容源"部分
4. **保留文件路径信息**：仅用于 DOCX 输出路径（保存到与 PDF 同目录），不再用于 AI 读取

修改后的 prompt 构建逻辑：
```typescript
// Before (broken):
`注意：你必须首先使用相关工具读取并解析 PDF 文件 [${name}](${path})...`

// After (working):
`以下是从用户上传的 PDF 文件 "${name}" 中提取的完整内容：
\`\`\`
${extractedContent}
\`\`\`
请基于上述内容编写教案。`
```

#### 依赖安装

```bash
npm install pdfjs-dist
```

> [!IMPORTANT]
> `pdfjs-dist` 是 Mozilla 的纯 JS PDF 解析库，无需任何原生依赖，可以直接在 Electron 渲染进程中使用。
> 需要确认当前项目的构建系统（Vite/Webpack）是否需要额外配置来处理 worker 文件。

---

### 第二部分：解除 Kun 工作区文件沙箱限制

> 让 AI agent 的 `read`、`write`、`edit`、`grep`、`find`、`ls` 工具可以访问任意路径，不再被限制在工作区目录内。

#### 设计思路

当前的安全限制对于**代码编辑器**场景是合理的（防止 AI 修改项目外的系统文件），但对于**教师助手**场景不适用——教师的文件可能在桌面、文档目录、U 盘等任意位置。

而且 `bash` 工具本身**已经没有路径限制**（它可以执行任意命令），所以只限制 `read`/`write` 工具并不能真正提供额外安全性。

#### [MODIFY] [builtin-tool-utils.ts](file:///j:/software_build/deepseek_exe/kun/src/adapters/tool/builtin-tool-utils.ts)

修改 `resolveWorkspacePath` 函数，添加 `allowEscape` 选项参数：

```typescript
export function resolveWorkspacePath(
  inputPath: string,
  context: ToolHostContext,
  options?: { allowEscape?: boolean }
): {
  workspaceRoot: string
  absolutePath: string
  relativePath: string
} {
  const root = workspaceRoot(context.workspace)
  const absolutePath = isAbsolute(inputPath) ? resolve(inputPath) : resolve(root, inputPath)
  const relativePath = relative(root, absolutePath)
  
  // 当 allowEscape 为 true 时（教师助手模式），允许访问工作区外的路径
  if (!options?.allowEscape) {
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error(`path escapes the workspace root: ${inputPath}`)
    }
  }
  
  return {
    workspaceRoot: root,
    absolutePath,
    // 工作区外的路径使用绝对路径作为 relativePath
    relativePath: (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath))
      ? absolutePath
      : (relativePath || '.')
  }
}
```

#### [MODIFY] [builtin-read-tool.ts](file:///j:/software_build/deepseek_exe/kun/src/adapters/tool/builtin-read-tool.ts)

在 `createReadLocalTool` 的 options 中添加 `allowEscapeWorkspace` 配置项，传递给 `resolveWorkspacePath`：

```typescript
const { absolutePath, relativePath } = resolveWorkspacePath(rawPath, context, {
  allowEscape: options.allowEscapeWorkspace ?? false
})
```

#### [MODIFY] [builtin-file-tools.ts](file:///j:/software_build/deepseek_exe/kun/src/adapters/tool/builtin-file-tools.ts)

同理为 `write` 和 `edit` 工具添加 `allowEscapeWorkspace` 配置项。

#### [MODIFY] [builtin-search-tools.ts](file:///j:/software_build/deepseek_exe/kun/src/adapters/tool/builtin-search-tools.ts)

同理为 `ls`、`find`、`grep` 工具添加 `allowEscapeWorkspace` 配置项。

#### [MODIFY] 工具注册点

找到 Kun 工具注册/创建的代码，在创建工具实例时传入 `allowEscapeWorkspace: true`：

```typescript
// 在 builtin-tools.ts 或相关注册代码中
createReadLocalTool({ allowEscapeWorkspace: true })
createWriteLocalTool({ allowEscapeWorkspace: true })
createEditLocalTool({ allowEscapeWorkspace: true })
createLsLocalTool({ allowEscapeWorkspace: true })
createFindLocalTool({ allowEscapeWorkspace: true })
createGrepLocalTool({ allowEscapeWorkspace: true })
```

#### [MODIFY] 工具类型定义

在 [builtin-tool-types.ts](file:///j:/software_build/deepseek_exe/kun/src/adapters/tool/builtin-tool-types.ts) 中为每个工具的 Options 类型添加 `allowEscapeWorkspace?: boolean` 字段。

---

## Open Questions

> [!IMPORTANT]
> **Q1**: 项目当前没有 `pdfjs-dist` 依赖。安装后可能需要检查 Vite/esbuild 构建配置是否需要对 PDF.js 的 worker 做特殊处理（如配置 CDN worker URL 或本地 worker 路径）。是否允许安装新的 npm 依赖？

> [!IMPORTANT]
> **Q2**: 解除工作区沙箱后，所有 6 个工具（`read`/`write`/`edit`/`grep`/`find`/`ls`）都将能访问系统上任意文件。对于教师助手场景这是合理的，但如果您未来打算让其他用户使用此软件，可能需要一个"安全模式"开关。目前是否直接全部放开？

> [!WARNING]
> **Q3**: 前端 PDF 提取的文本可能很长（一本教材章节可能有数万字）。嵌入到 prompt 中会消耗大量 token。是否需要设置一个最大字符限制（如 20,000 字）并在超限时提示用户？

---

## 验证计划

### 自动化
```bash
npm run typecheck   # TypeScript 编译检查
npm run test        # 运行现有测试确保没有回归
```

### 手动测试
1. 启动应用 → 进入智能教案模块
2. 上传 `C:\Users\yunfe\Desktop\test\第1章 医学免疫学概论.pdf`
3. 确认 PDF 文本被正确提取（查看提取预览）
4. 提交表单 → 确认 AI 使用了 PDF 的实际内容而非模板内容
5. 确认生成的教案 DOCX 保存在 PDF 同目录下
6. 在普通聊天界面测试 `read` 工具能否读取工作区外的文件
