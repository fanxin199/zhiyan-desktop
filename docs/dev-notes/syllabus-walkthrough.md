# 教案生成模块 (ZhiYan SyllabusPage) — 完整变更记录

## 问题背景

用户选择本地 PDF 文件生成教案时，存在两个核心问题：
1. **生成的 DOCX 文件无法保存到 PDF 源文件目录**
2. **PDF 文件解析失败（"Failed to fetch"）**

两个问题的**共同根因**：Electron 主窗口启用了 `sandbox: true`（[index.ts#L630](file:///j:/software_build/deepseek_exe/src/main/index.ts#L630)），导致渲染进程受到严格安全限制。

---

## 三层根因与解决方案

### 🔑 根因 1：`sandbox: true` 导致 `File.path` 不可用

Electron sandbox 模式下，`<input type="file">` 选中的 File 对象**没有 `.path` 属性**。
代码 `(file as any).path` 返回 `undefined` → fallback 为 `file.name`（仅文件名无目录）→ `getDirectoryPath()` 返回空字符串 → Kun agent 无法获知 PDF 所在目录。

**解决**：新增 `pickFile` IPC，通过 main 进程 `dialog.showOpenDialog` 弹出系统原生文件选择框，直接返回完整绝对路径。

---

### 🔑 根因 2：`sandbox: true` 导致 `fetch('file://...')` 被阻止

拿到文件绝对路径后，渲染进程用 `fetch('file://...')` 读取 PDF 二进制数据，但 sandbox 安全策略**禁止 file:// 协议的 fetch 请求**，报错 "Failed to fetch"。

**解决**：新增 `readFileBinary` IPC，通过 main 进程 `fs.readFile` 读取文件二进制数据返回 base64 字符串，渲染进程解码为 ArrayBuffer → 构造 File 对象 → 传给 `extractPdfText`。

---

### 🔑 根因 3：`createThread()` 未传递 `workspaceRoot`

即使路径正确，`handleModuleQuickPrompt` 调用 `createThread()` 时没有传 `workspaceRoot`，Kun agent 的 bash/write 工具 cwd 始终指向默认 workspace。

**解决**：`onStartChat` 接口扩展支持 `options.workspaceRoot`，`handleModuleQuickPrompt` 转发给 `createThread({ workspaceRoot })`。

---

## 完整数据流

```
用户点击"选择本地文件"
  → handlePickFile()
  → dsGui.pickFile() → main: dialog.showOpenDialog
  → 返回完整绝对路径 (如 C:\Users\yunfe\Desktop\test\第1章.pdf)

PDF 解析：
  → dsGui.readFileBinary(fullPath) → main: fs.readFile → base64
  → renderer: atob(base64) → Uint8Array → File 对象
  → extractPdfText(file) → pdfjs-dist 提取文本

提交教案生成：
  → handleSubmit()
  → getDirectoryPath(fullPath) → sourceDir (C:\Users\yunfe\Desktop\test)
  → onStartChat(prompt, { workspaceRoot: sourceDir })
  → Workbench: createThread({ workspaceRoot: sourceDir })
  → Kun agent workspace = sourceDir
  → bash cwd & write 根目录 = sourceDir
  → DOCX 保存到 sourceDir ✅
```

---

## 修改的文件汇总

### 新增 IPC 通道

| 文件 | IPC 通道 | 功能 |
|------|----------|------|
| [register-app-ipc-handlers.ts](file:///j:/software_build/deepseek_exe/src/main/ipc/register-app-ipc-handlers.ts) | `file:pick-file` | 系统文件选择对话框，返回绝对路径 |
| [register-app-ipc-handlers.ts](file:///j:/software_build/deepseek_exe/src/main/ipc/register-app-ipc-handlers.ts) | `file:read-binary` | 读取文件二进制内容为 base64 |
| [preload/index.ts](file:///j:/software_build/deepseek_exe/src/preload/index.ts) | — | 暴露 `pickFile` 和 `readFileBinary` |
| [ds-gui-api.ts](file:///j:/software_build/deepseek_exe/src/shared/ds-gui-api.ts) | — | 添加两个方法的类型定义 |

### 业务逻辑修改

| 文件 | 修改内容 |
|------|----------|
| [ZhiYanModulePages.tsx](file:///j:/software_build/deepseek_exe/src/renderer/src/components/zhiyan/ZhiYanModulePages.tsx) | 新增 `handlePickFile`；`fetch` → `readFileBinary`；`onStartChat` 传 `workspaceRoot` |
| [Workbench.tsx](file:///j:/software_build/deepseek_exe/src/renderer/src/components/Workbench.tsx) | `handleModuleQuickPrompt` 接收并转发 `workspaceRoot` |

### UI/UX 修改

| 修改项 | 内容 |
|--------|------|
| required 属性 | 移除 5 个课程信息字段的 required |
| 按钮文字 | "上传章节文件" → "选择本地文件" |
| 占位符 | 教师 → "如：张三"，学校 → "如：仙交大" |
| Prompt 指令 | 增强路径指令、cd 命令、WARNING |

---

## 关键技术发现

### Electron Sandbox 对渲染进程的限制

| 功能 | sandbox: false | sandbox: true |
|------|----------------|---------------|
| `File.path` | ✅ 返回绝对路径 | ❌ undefined |
| `fetch('file://...')` | ✅ 可读取本地文件 | ❌ Failed to fetch |
| `require('fs')` | ✅ (需 nodeIntegration) | ❌ 不可用 |
| IPC `ipcRenderer.invoke` | ✅ | ✅ (需 contextBridge) |

> **结论**：在 `sandbox: true` 环境下，所有本地文件操作必须通过 IPC 由 main 进程执行。

### Kun Agent Workspace 机制

| 组件 | 目录来源 | 说明 |
|------|----------|------|
| `bash` 工具 | `workspaceRoot(context)` | cwd 固定为 workspace root |
| `write` 工具 | `resolveWorkspacePath(path, context)` | 绝对路径直接使用，相对路径拼接 workspace |
| `createThread({ workspaceRoot })` | 调用者传入 | 设置 Kun session 的 workspace root |

---

## 验证结果

- ✅ 编译通过（main + preload + renderer）
- ✅ 系统原生文件选择对话框正常弹出
- ✅ PDF 文件解析成功
- ✅ 用户端到端测试通过
