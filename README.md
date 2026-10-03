# AI Reality Radar

AI Reality Radar 只保留三个普通用户入口：

- `/`：首页，按上海时区逐日混合展示真需求和牛皮账本
- `/demands`：真需求
- `/claims`：牛皮账本

AIHOT 只作为底层 Engine，负责公开来源、抓取、PostgreSQL、LLM、Embedding、任务和 API。

## 当前数据快照（2026-10-03）

- Demand 有效样本：206
- Demand Theme：86（multi_user 16，single_signal 70）
- Claim 数据库：43
- 前台 Claim：5，全部为“未验证”
- Demand 已覆盖 GitHub Issue/Comment、GitHub Discussions、OpenAI Community、Hacker News、Stack Exchange、Hugging Face 社区；当前仍以 GitHub 为主
- Claim 深度取证最近一轮：5 条 Claim，读取 9 个候选，完成 8 个关系判断；独立支持 0，独立冲突 0，检索状态仍为 blocked/search_blocked

## 核心规则

- Demand Theme 必须描述同一个具体失败或摩擦；独立用户按“平台 + 作者身份”去重。
- 默认排序是独立用户数降序、最近动态降序；页面按 Asia/Shanghai 逐日分组。
- Claim 只接受可归因、具体、显著、可核验的强主张；复合主张需要拆解或进入复核。
- `related` 不计入支持；转载和同源材料不算独立证据。
- 原始英文保留在数据库和原文链接；前台优先使用数据库中文字段和准确专名，不做运行时机器翻译。
- 模型或检索失败进入可审计的 review/retry 状态，不把失败伪装成 reject，也不清除已有人工确认。

## 架构与自动运行

公开来源 → AIHOT Fetcher/Source → PostgreSQL → LLM/Embedding → Demand/Claim 管线 → Reality Radar UI。

`aihot-reality-radar-insights.timer` 每日触发独立 oneshot service，顺序为：

`demand-discovery → coverage → group-demands → cross-platform → claim-discovery → claim-gate → claim-depth`

正式 timer 使用 runtime-only 凭据和 flock。2026-10-03 03:42 的自然触发已完成整条链；15:25 的短周期收口验证在 claim-depth 发现部分失败后退出码为 1，避免静默成功。临时 timer 已清理，正式 timer 仍 enabled/active。

## 当前限制

- Demand 仍明显偏向 GitHub，跨平台 Theme 数量有限。
- Claim 证据检索 provider 当前为 blocked，尚未形成独立 supports/conflicts；5 条前台 Claim 都保持“未验证”。
- WP1 队列已部署，但仍有 lease 过期的 running 项等待下一轮回收；完整跨页游标和生命周期字段尚未完全闭环。
- V1 当前状态：`V1_NOT_READY`。没有新增一级产品功能；下一步只处理上述可验证 blocker。
