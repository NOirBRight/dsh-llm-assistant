# DeepSeek 小管家 v0.1.2

右下角常驻鲸鱼席位。独立助理会话：能聊天、设提醒、按需只读当前页面任务。没有「引用任务」按钮。

## 长什么样

**关着** — 不绑 workspace，没开项目也在。

![关闭时的席位](https://github.com/NOirBRight/dsh-llm-assistant/releases/download/v0.1.2/seat-closed.png)

**打开** — 缩小版对话窗叠在主窗口上。

![打开的席位](https://github.com/NOirBRight/dsh-llm-assistant/releases/download/v0.1.2/seat-open.png)

**面板** — 标题栏「新对话」，composer 只有模型、上下文圈和发送。

![席位面板](https://github.com/NOirBRight/dsh-llm-assistant/releases/download/v0.1.2/seat-panel.png)

## 安装

需要 DeepSeek Harness Web（`web-app`，`0.1.0-rc.7`+）。插件会插入 `@deepseek-ai/dsh-schedule`。`session-reference` 在 rc.8+ 由 web-app 提供；rc.7 由插件在缺失时补上，不再 insert 同 id。

```bash
dsh plugin --profile web add github:NOirBRight/dsh-llm-assistant#v0.1.2
```

## 这版相对 v0.1.1 修了什么

- **值班不再拖垮宿主**：心跳固定 30 分钟；值班 log 超限就新建，不 resume 上 MB 的 jsonl；安静心跳后轮换。
- **Deep diving 会停**：忙碌状态跟未结束的 turn 走，不再被卡住的 `agent.status` 空转计时。
- README 补了界面截图。

## 不会做什么

- 助理或值班进程没在跑时，提醒不会响。
- 这版没有跨会话投递、派单、cron。
- 没有 bash / write / edit / 外派 worker。
