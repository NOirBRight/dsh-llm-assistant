# DeepSeek 小管家 v0.1.3

右下角常驻助理。自己的对话，不占项目会话，也不会出现在会话列表里。

可以聊天、设提醒；问到当前工作时，它自己去读，不用先点「引用任务」。

## 长什么样

关着 — 没开项目也在。

![关闭时的席位](https://github.com/NOirBRight/dsh-llm-assistant/releases/download/v0.1.3/seat-closed.png)

打开 — 缩小版对话窗叠在主窗口上。

![打开的席位](https://github.com/NOirBRight/dsh-llm-assistant/releases/download/v0.1.3/seat-open.png)

面板 — 标题栏「新对话」，输入栏只有模型、上下文和发送。

![席位面板](https://github.com/NOirBRight/dsh-llm-assistant/releases/download/v0.1.3/seat-panel.png)

## 安装

需要 DeepSeek Harness Web（`web-app`，`0.1.0-rc.7` 或更新）。

```bash
dsh plugin --profile web add github:NOirBRight/dsh-llm-assistant#v0.1.3
```

装上后重启 Web。

## 这版

README 改成产品介绍，三张界面图放进 Release。

功能边界没变：不会写你的项目文件，不会复制整段任务记录，这版也还没有跨会话投递。
