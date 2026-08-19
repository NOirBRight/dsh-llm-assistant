# DeepSeek 小管家

DeepSeek Harness 右下角的常驻助理。它有自己的对话，不占你的项目会话，也不会出现在会话列表里。

你可以跟它聊天、让它设提醒；需要了解当前页面在做什么时，它自己去读，不用先点「引用任务」。

![关闭时的席位](docs/images/seat-closed.png)

点开是缩小版对话窗。标题栏可以开一条新对话；输入栏只有模型、上下文和发送。

![打开的席位叠在主窗口上](docs/images/seat-open.png)

![席位面板](docs/images/seat-panel.png)

## 它会做什么

- **一直在。** 换项目、换会话、还没选 workspace，鲸鱼都在。
- **自己聊。** 历史留在助理会话里，关掉面板也不会打断正在回的那一轮。
- **按需看任务。** 你问到当前工作，它会调用只读的 `task_reference`。问候和闲聊不会去翻项目。
- **提醒。** 用自然语言让它到点叫你。浏览器没开也没关系，但 Harness 进程得在跑。

## 它不会做什么

- 不会在你的项目里写文件、改代码、开终端或外派 worker。
- 不会把整段任务记录复制进席位。
- 这版还没有「替你往别的会话里投一句」或「去某个项目开新任务」。

## 安装

需要 DeepSeek Harness Web（`web-app`，`0.1.0-rc.7` 或更新）。

```bash
dsh plugin --profile web add github:NOirBRight/dsh-llm-assistant#v0.1.3
```

装上后重启 Web。插件会自行带上官方的提醒和会话引用能力。

## 开发

```bash
pnpm run check
pnpm run build
```

实验面用 `link:` 指到本仓库，只在 `DSH_HOME=~/.dsh-lab` 的 3082 上看效果。不要把 Workstation 路径写进 `~/.dsh`。

界面复拍（只打 3082）：

```bash
node scripts/capture-readme.mjs
```
