# 项目规则：GitHub Actions 额度保护（最高优先级）

账号 BrushLLM/image-studio 是免费计划，Actions 额度有限且 **macOS runner 按
10 倍速率计费**。历史上曾因连续 8 轮 CI 迭代耗光全部额度，导致构建中断。
以下规则必须遵守：

1. **禁止连续试错式重推 tag 触发全量 CI**。CI 构建失败的排查，每次发布
   最多允许 2 轮修复迭代；第 2 轮仍失败时必须停止，改为：
   - 在本地复现（macOS 桌面构建、`cargo check`、浏览器验证前端）；
   - 或仅用 `workflow_dispatch` 手动触发单个 job 验证，不推 tag。
2. **触发任何全量构建（推 tag）前，必须先告知用户预估额度消耗**
   （macOS job ≈ 实际时长 ×10 计费分钟），获得确认后再操作。
3. **main 分支 push 不触发构建**（workflow 已配置为仅 tag / 手动触发）。
   日常改动只在本地验证：`npm run build`、`cargo test`、
   `CARGO_PROFILE_RELEASE_LTO=thin npm run tauri build`。
4. 需要快速验证 CI 配置时，使用仓库页面的 "Run workflow" 手动触发并
   观察单个 job，绝不通过重推 tag 的方式。
5. 若 Actions 再次因额度/账单拒绝启动，立即停止所有重试并告知用户，
   不得反复尝试。

违反以上规则造成的额度耗尽视为重大失误。
