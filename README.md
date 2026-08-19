# dsh-llm-assistant

DeepSeek Harness 的常驻“DeepSeek 小管家”席位。它拥有独立、可滚动的助理会话，支持对话、图片、提醒和值班心跳。

## 界面

席位是右下角的鲸鱼，不绑在某个 workspace 上：没有打开项目时它也在。

![关闭时的席位](docs/images/seat-closed.png)

点开是缩小版对话窗。标题栏有「新对话」，composer 只有模型、上下文圈和发送；没有引用任务按钮。

![打开的席位叠在主窗口上](docs/images/seat-open.png)

![席位面板](docs/images/seat-panel.png)

## 安装

需要 DeepSeek Harness Web（`web-app` bundle，`0.1.0-rc.7`+）。本包的 `cordis.patch.yml` 会插入 `@deepseek-ai/dsh-schedule` 与 `@deepseek-ai/dsh-session-reference`。

发布面：

```bash
DSH_HOME=~/.dsh dsh plugin --profile web add github:<owner>/dsh-llm-assistant#vX.Y.Z
```

实验面只在 lab 验证：把 profile 写成 `link:` 到本仓库，用 `DSH_HOME=~/.dsh-lab` 的 3082。不要把 Workstation 路径写进 `~/.dsh`。

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

## 工具面

管家使用插件私有的 standing composition（`presets/llm-assistant/`），**不出现在主窗口模式 picker**。可见：`web_search`、对自己 cwd 的 `read` / `glob` / `grep`、todo / goal、`schedule_*`、`task_reference`、`view_image`。不可见：bash、write、edit、worker 外派、侧栏 `browser_*`。值班会话不加入该 composition。

## 已知限制

- 提醒与心跳依赖 DSH 进程及对应 live 会话；**助理或值班不活着时不会触发**。
- 值班会话有界：超过约 20 个 turn / seq 80 / 64KiB 事件时 boot 会新建值班会话，不 resume 膨胀的 jsonl。安静心跳后也会轮换。
- 心跳是 30 分钟一条 `every` 记录（id `heartbeat`）。boot 会删掉所有非 1800s 的值班 every 记录（含旧的 `schedule-2` @ 300s），再保证只剩这一条。
- 值班模型看不到 `schedule_create` / `schedule_delete` / `schedule_list`；心跳由 host 写入 session log。
- 本版本不做跨会话投递、派单、cron 日程层，也不提供工作台 Terminal/Browser/批注口。
- 助理和值班会话不暴露 worker 外派、bash、write 或 edit。
- 引用任务不创建 fork，也不复制完整 transcript。
