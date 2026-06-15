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

`git worktree` 只用于开发隔离，不暴露给教师用户。项目采用“一个功能或工具修改，一个
worktree”的固定规则。

### 必须使用

- 新增、替换或删除一个工具、Skill 或 Agent 能力。
- 修改一个教师可见功能或工作流。
- 调整运行时、权限、文件处理、导出或安装包。
- 修复需要修改生产代码的问题。

只有纯文档勘误可以直接在当前分支完成。探索性调查不修改文件；一旦开始修改，先建立
worktree。

### 推荐流程

```powershell
git fetch origin
git worktree add .worktrees/feat-name -b codex/feat-name main
Set-Location .worktrees/feat-name
npm ci
```

功能完成后：

```powershell
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
git add .
git commit -m "feat: describe the change"
```

测试和提交通过后，在主工作区快进合并；再次确认主分支测试通过后再推送：

```powershell
Set-Location ../..
git switch main
git merge --ff-only codex/feat-name
npm test
npm run typecheck
git push origin main
git worktree remove .worktrees/feat-name
git branch -d codex/feat-name
```

## 提交边界

- 一个提交只表达一个可回滚意图。
- 产品功能、测试和必要文档放在同一功能分支。
- 不提交 API Key、本地教材、导出课件、日志、安装包或个人配置。
- 第三方代码来源和许可证变更必须同步更新 `THIRD_PARTY_NOTICES.md`。
- 不在未测试的 worktree 中直接修改或覆盖主分支。
