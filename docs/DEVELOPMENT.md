# 开发工作流

## 初始化

```powershell
npm ci
npm run hooks:install
```

仓库使用 `.githooks`：

- `pre-commit`：检查疑似密钥并运行零警告 lint。
- `commit-msg`：要求 Conventional Commits。
- `pre-push`：运行全部测试和类型检查。
- GitHub Actions：在 `main` 和 Pull Request 上运行测试、类型检查、lint 和构建。

## Worktree 使用节点

`git worktree` 只用于开发隔离，不暴露给教师用户。

### 适合使用

- 一个功能预计修改多个模块或持续超过半天。
- 同时维护稳定分支和新功能。
- 需要并行处理紧急修复与正在开发的功能。
- 发布前需要独立验证安装包。

### 不需要使用

- 文案修正、单文件小改动或可在一次提交中完成的修复。
- 尚未明确边界的探索性修改。

### 推荐流程

```powershell
git fetch origin
git worktree add .worktrees/feat-name -b feat/name main
Set-Location .worktrees/feat-name
npm ci
```

功能完成后：

```powershell
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
git push -u origin feat/name
```

合并并确认不再需要后，再移除 worktree：

```powershell
git worktree remove .worktrees/feat-name
git branch -d feat/name
```

## 提交边界

- 一个提交只表达一个可回滚意图。
- 产品功能、测试和必要文档放在同一功能分支。
- 不提交 API Key、本地教材、导出课件、日志、安装包或个人配置。
- 第三方代码来源和许可证变更必须同步更新 `THIRD_PARTY_NOTICES.md`。
