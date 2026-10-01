# AIHOT MVP 实施计划

## 目标

在 AIHOT 现有 Fastify API、PostgreSQL、React Router 和公开读取层内，增加两个可运行内容模式：

- 真需求采样器：从 Hacker News 公开评论和 GitHub Issues 抽取问题、场景、绕行、证据与来源身份，并按问题主题做轻量归并。
- AI 牛皮账本：从 Hacker News 公开讨论发现性能、成本、用户量、Benchmark、产品能力 Claim，记录原始链接、支持/冲突证据和保守状态。

## 最小改动

1. 增加一份向后兼容数据库迁移，新增 `insight_demands` 与 `insight_claims`。
2. 在 `packages/backend/src/publication/insights.ts` 提供只读聚合函数；API 只调用该读取层。
3. 新增 `scripts/collect-insights.ts`：抓取 HN/GitHub 公开数据；优先调用 AIHOT 现有 `chatJson`，未配置模型时用可解释规则兜底；幂等写库。
4. 在 `apps/api/src/routes/site.ts` 增加 `/api/site/demands`、`/api/site/claims`。
5. 新增两个 React 页面并加入现有导航，不改认证、队列和原有内容流。
6. 用 Podman 启动隔离 PostgreSQL 与 API/Web/worker，执行采集脚本和 smoke test。

## 验收

- 两页均能看到至少 10 条真实数据，原始链接可点击。
- 需求存在按主题合并的多来源样本；Claim 页面明确显示四种证据状态。
- 重启容器后数据仍在；运行端口和卷与 Hermes 其他服务隔离。
- 运行类型检查、Web 构建、HTTP/API/浏览器 smoke test，并记录未完成项。
