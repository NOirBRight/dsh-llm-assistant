# DeepSeek 小管家 v0.1.5

右下角常驻助理。自己的会话、自己的历史、自己的提醒，不属于任何一个项目。

## 长什么样

![主窗口干活时，鲸鱼坐在右下角](https://github.com/NOirBRight/dsh-llm-assistant/releases/download/v0.1.5/seat-closed.png)

![点开席位](https://github.com/NOirBRight/dsh-llm-assistant/releases/download/v0.1.5/seat-open.png)

![席位面板](https://github.com/NOirBRight/dsh-llm-assistant/releases/download/v0.1.5/seat-panel.png)

## 安装

DeepSeek Harness Web，`0.1.0-rc.7` 或更新。

```bash
dsh plugin --profile web add github:NOirBRight/dsh-llm-assistant#v0.1.5
```

装完重启 Web。

## 这版修了什么

兼容 Harness **0.1.0-rc.8**。rc.8 的 web-app 已经自带 `session-reference`，插件不再 insert 同一个 loader id（否则启动失败：`duplicate loader entry id: session-reference`）。rc.7 没有该行时，插件会在 boot 时补上。任务引用预算与官方默认一致：最多 3 来源、每来源 64 KiB。
