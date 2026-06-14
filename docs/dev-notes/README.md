# 开发笔记索引 (Dev Notes)

> **本目录存放各模块开发过程中的实施计划、技术备忘和参考资料。**
> **新 agent 请先阅读 [PROJECT.md](../../PROJECT.md)，然后按需查阅本目录。**

---

## 智能教案模块 (syllabus) — 已完成 ✅

| 文件 | 内容 |
|------|------|
| [syllabus-implementation-plan.md](./syllabus-implementation-plan.md) | 实施计划：PDF 提取方案 + Kun 沙箱解除方案 |
| [syllabus-walkthrough.md](./syllabus-walkthrough.md) | 完整技术变更记录：三层根因分析、修改的文件、数据流、Electron sandbox 踩坑 |
| [reference_lesson_plan.md](./reference_lesson_plan.md) | 教案格式模版（西安交通大学基础医学院，移植免疫章节），嵌入到 SyllabusPage prompt 中作为格式参考 |

### 关键技术结论（快速参考）

1. **Electron `sandbox: true`**（`src/main/index.ts` L630）导致渲染进程无法：
   - 使用 `File.path` → 用 `dsGui.pickFile()` IPC 替代
   - 使用 `fetch('file://...')` → 用 `dsGui.readFileBinary()` IPC 替代
   
2. **Kun agent workspace 机制**：
   - `createThread()` 不传 `workspaceRoot` → bash cwd 指向默认 workspace
   - 必须 `createThread({ workspaceRoot: pdfDir })` 才能让生成文件落到目标目录

3. **新增 IPC 的标准流程**：
   - `src/main/ipc/register-app-ipc-handlers.ts` → `ipcMain.handle`
   - `src/preload/index.ts` → 暴露方法
   - `src/shared/ds-gui-api.ts` → 类型定义

---

*最后更新: 2026-06-10*
