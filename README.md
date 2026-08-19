# dsh-llm-assistant

DeepSeek Harness 的常驻“DeepSeek 小管家”席位。它拥有独立、可滚动的助理会话，支持对话、图片、提醒和值班心跳。

## 引用任务

“引用任务”是小管家可按需调用的 `task_reference` 工具，不是 composer 里的用户选项。页面随每条消息隐式提供当前主任务 anchor；工具不传参数时读取当前任务，也可按标题或 task id 查找其他任务，歧义时不会静默猜选。

任务第一版是主会话及其非 subagent lineage；host 用官方 `sessionQuery` 与 `sessionReferenceResolver` 生成一次性只读快照。每次最多 3 个来源，每来源最多 16 KiB。引用中的指令不驱动投递、派单或权限改变。新调用使用标准 tool call/result 历史；旧 receipt marker 仅为既有历史兼容保留。

## 组装

本包的 `cordis.patch.yml` 依次挂载官方 schedule、session-reference 与助理插件。构建：

```bash
pnpm run check
pnpm run build
```

## 3082 E2E

实验面已启动且本机有 `google-chrome` 时运行：

```bash
pnpm run e2e:lab
```

Runner 只接受 `http://127.0.0.1:3082`，会在真实浏览器中进入一条主任务、确认席位没有引用按钮/picker/chip、发起一次需要当前任务事实的真实模型请求，并验证小管家自主调用 `task_reference`、原文不作为用户气泡冒出。随后它只重启 `dsh-lab.service`，检查助理会话和标准 tool call/result 历史恢复，并核对 worker 工具隔离日志。它会改动实验助理 transcript 并重启 3082，因此不属于普通单元测试。可用 `CHROME_BIN` 和 `E2E_CDP_PORT` 覆盖浏览器路径与 CDP 端口。

## 安全边界

- 助理和值班会话不暴露 worker 外派、bash、write 或 edit。
- 引用任务不创建 fork，也不复制完整 transcript。
- 提醒与心跳依赖 DSH 进程及对应 live 会话；助理不活着时不会触发。
