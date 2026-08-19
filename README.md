# dsh-llm-assistant

DeepSeek Harness 的常驻“DeepSeek 小管家”席位。它拥有独立、可滚动的助理会话，支持对话、图片、提醒和值班心跳。

## 引用任务

在 composer 选择“引用任务”，当前主任务会置顶，也可明确选择另一条任务。任务第一版是主会话及其非 subagent lineage；host 用官方 `sessionQuery` 与 `sessionReferenceResolver` 生成只读快照。每次最多 3 个来源，每来源最多 16 KiB。引用中的指令不驱动投递、派单或权限改变。

任务 chip 会一直保留，直到更换或移除。首次选择、主动刷新、切换任务或“新对话”后会重新捕获；普通追问复用已有快照。

## 组装

本包的 `cordis.patch.yml` 依次挂载官方 schedule、session-reference 与助理插件。构建：

```bash
pnpm run check
pnpm run build
```

## 安全边界

- 助理和值班会话不暴露 worker 外派、bash、write 或 edit。
- 引用任务不创建 fork，也不复制完整 transcript。
- 提醒与心跳依赖 DSH 进程及对应 live 会话；助理不活着时不会触发。
