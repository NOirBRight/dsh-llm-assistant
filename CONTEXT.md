# DSH LLM Assistant

A resident assistant Agent that belongs to no project, seated in the corner of the DeepSeek Harness Web UI. It remembers across projects, delivers work into them, and keeps time.

市面上已有二十余个 DSH 桌宠插件，它们做的都是**皮**：镜像当前会话的 agent 状态（thinking / working / failed / done），点开是动画和玩耍。本项目做的是**脑**：席位背后是一个真实的、常驻的、跨项目的 Agent。皮是它的表达方式，不是它本身。

---

## Language

**助理**:
本项目的主体：一个由插件持有、不属于任何 workspace 的常驻 root Agent。它有自己的
session、自己的对话历史、自己的 cwd。它是 DSH 意义上完全普通的一个 Agent —— 没有特权
API，没有内核补丁，它的全部能力都来自公开的 `ctx.agents` / `ctx.tools` / `ctx.sessionQuery`。
_Avoid_: 桌宠、吉祥物、subagent、后台服务、守护进程、全局单例

**宠物**:
助理在**席位**上的可见形象与交互方式。它是助理的表达层，不是助理本身：换一套皮不改变
助理是谁，去掉皮助理照常工作（实测：全程无浏览器连接时定时提醒照常触发）。
_Avoid_: 助理的同义词、宠物 Agent、把状态动画说成"宠物的能力"

**席位**:
`shell.overlay` 上属于本插件的那一个条目。`ui-layout` 声明它为
`{ kind: 'list'; scope: 'root' }`——list 表示多个插件的条目并存而非互相遮蔽，root scope
表示它不随会话切换而重建。`dsh-client-runtime` 的 slots.ts 明确指定它为"浮在整个应用之上
的自有界面"的挂载点，并警告不要注册到 `root`（会遮蔽整个 AppFrame）。
_Avoid_: 悬浮窗、overlay 层、右下角、iframe、自建 React root、侧栏

**助理会话**:
助理那一条 session。cwd 指向一个专用目录而非任何项目，因此**不出现在 Web UI 的会话树里**
——workspace 注册表只收录 `SessionHeader.cwd` 与已注册 workspace 路径一致的会话。它由插件
在 boot 时 `ctx.agents.create()` 建立，重启后 `ctx.agents.resume()` 恢复同一个 id。
_Avoid_: 隐藏会话、系统会话、匿名会话、临时会话、把它 attach 到某个 workspace

**接续**:
当当前助理会话接近上下文上限时，用一份有界的短交接开启下一条助理会话，席位随之切换。
旧会话归档只读保留；目标、未完成项、必要路径和提醒状态继续，整段 transcript 不继续。
_Avoid_: resume、fork、复制对话、摘要整本历史、新助理、重置助理

**任务**:
主人能识别和命名的一件工作，可以跨越同一项目内的多条主会话；它不是当前页面、单条会话、
整个 workspace，也不是某条会话里的 goal。
_Avoid_: 会话、项目、当前页面、goal 的同义词

**引用任务**:
小管家为回答眼前问题而取得某个任务的只读上下文。没有显式指定时默认当前任务；主人明确
指定其他任务时，显式指定覆盖默认。用户入口统一叫「引用任务」，不叫「引用当前任务」。
_Avoid_: 搬运任务、同步任务、复制 transcript、默认当前任务不可覆盖

**引用**:
助理把其他会话的内容读进自己上下文的动作。走官方的 `ctx.sessionReferenceResolver`：
`listCandidates()` 列出除自己以外的会话并按 same-cwd / cwd-less / other-cwd 排序，
`prepare()` 生成一份 read-only 快照，以 `recall` 这一 `ContextForm` 进入助理的上下文。
**跨仓库无血缘限制**，但有硬上限：最多 3 个来源、每个来源 64KB。
_Avoid_: 读取、抓取、同步、订阅、把它说成"助理能看到所有项目的实时状态"

**投递**:
助理把一条消息送进**另一条已存在的会话**的动作。实现是 core 层的
`ctx.agents.get(sessionId).followup(message)`，消息的 `source` 用 `relay` 这一
`ContextForm`（官方定义为"另一个 agent 发给这一个的消息"）。它**不是** subagent 的
`send_message`——那条路被 `authorizeLineage` 硬挡：只有目标的直接父级可投递，且目标必须
是带 `mode:'continuable'` descriptor 的 subagent，普通项目会话两条都不满足。
_Avoid_: send_message、subagent 通信、注入用户消息、冒充用户、@提及、转发

**派单**:
助理让一件事在**它该在的项目里**发生的动作：在目标 workspace 建立（或恢复）一条会话，
把任务**投递**进去，然后靠**引用**观察进度。活儿在目标项目的会话里干，用那个会话自己的
权限预设，transcript 留在那里可审计。
_Avoid_: 代执行、远程执行、helper agent、把 subagent 派到别的 cwd（in-process provider
从父 agent 的 durable session state 派生 workspace，到不了目标目录）

**信任**:
助理的授权模式：**完全信任**。助理是主人自己的延伸，**投递与派单都不需要事前确认**。
信任消除的是"问一句",不是"看得见"——投递始终以 `relay` 身份进入目标会话（`MessageSource`
的类型事实，不随授权模式改变），且永久留在那条会话的 transcript 里。助理没有任何
主人事后看不到的动作。
_Avoid_: 免确认=静默、无痕、后台偷偷做、把"不问"说成"不留痕"

**引用不驱动投递**:
信任模式下的唯一硬约束：助理**只因主人的话**发起投递或派单，**绝不因引用来的内容**发起。
被**引用**进来的其他会话内容是 untrusted 的——`session-reference` 自带的警告已禁止模型
听从快照里的指令、权限声明与工具请求，除非当前用户重复它们；本约束把同一条边界延伸到
助理的对外动作上。没有它，"完全信任 + 跨会话引用"就是一条 prompt injection 的放大路径。
_Avoid_: 自动响应、代为处理、把引用内容里的请求当成待办、"另一个会话说要……"

**提醒**:
一条挂在助理会话上的 `dsh-schedule` 记录。到点后它以
`source={kind:'plugin',plugin:'schedule'}` 的身份作为一次普通的后续 turn 回到助理会话
——不是系统通知，不是弹窗，DSH 明确不提供任何 Schedule 专属的浏览器 UI。
_Avoid_: 通知、闹钟、cron job、定时任务、push、把它说成"到点会弹出来"

**日程层**:
助理自建的、`dsh-schedule` 之上的一层。它存在只因为原生 schedule 有三个硬约束：
只有 fixed-rate 没有 cron 表达式、`every_seconds` 不得低于 300 秒、记录只活在
session log 里。日程层持有 cron 表达式与自己的持久化，到点折算成一次性 `after` 记录
喂给原生 schedule；原生记录始终是唯一的真实触发源。
_Avoid_: 调度器、任务队列、自建 timer、替代 schedule、绕过 schedule

**气泡**:
席位上表示"助理有话说"的视觉状态。它是助理会话新事件的投影，**必须由本插件自己画**
——提醒到点只在 session log 里多一轮对话，DSH 不会替你通知任何人。
_Avoid_: 通知、toast、badge 的同义词、把它当作提醒本身

**心跳**:
跑在 **值班会话**（第二条隐藏 root）上的原生 `every_seconds`（≥ 300）。LLM 在值班会话里跑；
没事不写进助理会话、不点亮气泡。有事才交接给助理。不是 cron，不是系统通知，不是第二条 OS 进程。
_Avoid_: cron、日程层的同义词、巡检守护进程、自动投递、把它做成第二套 timer、把它跑在助理 transcript 里

**值班会话**:
插件持有的第二条常驻 root Agent，只为心跳存在。archive，人不当面对它说话。
_Avoid_: subagent、独立进程、delegate_worker、和助理会话混成一条

**列出**:
只读名册：本 profile 未归档主会话（跨 workspace；不含助理自己、archived、subagent、
Side Chat）。对齐 `SessionSummary` 的忙闲与路径，不是引用全文。
_Avoid_: 同步所有项目、实时桌面、窗口截屏

**察看**:
对一条主会话拉一张进度卡片（忙/闲、当前步、上一句结论、本轮变更文件）。冷会话只读 log，
不为察看去 resume。
_Avoid_: 订阅、tail、把整段 transcript 灌进助理

**焦点**:
人在本 Web 页当前激活的主会话。来自客户端 `sessions.list.current`，由席位回传；
host 默认不知道人盯着哪条。
_Avoid_: 把焦点说成 session.list 的服务端字段、全局单例当前会话

**工作台**:
侧栏按主会话发布的 Terminal / Browser / 批注口。契约等 `dsh-codex-sidebar` 定稿后再立。
_Avoid_: 刮 DOM、读键盘、私有 pty 冒充人的 Terminal、心跳里写命令

---

## 产品边界

以下每一条都在 `~/.dsh-lab` 实测过，不是从文档推断的（探针见 `probe.mjs`，日志见 `probe.log`）。

| 边界 | 结论 | 实测 |
|---|---|---|
| 助理是否依赖浏览器 | **不依赖** | 全程零连接时提醒照常触发；Chrome 连上再关闭，会话 `seq` 不变 |
| 定时精度 | **毫秒级** | `scheduledAt` 15:07:22.820 → dispatch 15:07:22.822，误差 2ms |
| 进程重启 | **不丢提醒** | 错过 4 分 49 秒后 resume，9ms 内补投并开出真实 turn |
| 助理是否污染会话列表 | **不污染** | cwd 非注册 workspace，不出现在 Web UI 会话树 |
| 提醒最短间隔 | **循环 ≥ 5 分钟** | `every_seconds` 下限 300s；一次性 `after` 无下限 |
| 错过多个循环周期 | **只补最近一次** | 官方契约：不枚举、不回放错过的间隔（尚未实测） |

**助理不活着时，提醒不触发。** timer 归 dsh 进程所有，进程不在就没有任何东西在计时；
恢复的唯一时机是会话重新变 live。这是产品承诺的下限，必须对用户说清楚。

---

## 组装前提

- `@deepseek-ai/dsh-schedule` **不在任何官方 bundle 里**（base / web-app 都不带），本插件
  必须自己 insert，或在文档中要求用户挂载。
- schedule 只对**插件加载之后**创建的 root Agent 装工具，所以助理会话必须在
  `await ctx.get('loader')?.await()` 之后创建。
- fork 出来的会话不继承父会话的提醒（fold 只从 `seedLength` 之后开始）。

---

## 不做什么

- **不做第二个宠物皮**。状态动画、换装、投喂、亲密度——市场上已有二十余个插件做得比我们好，
  它们与本项目不冲突，甚至可以共存于同一个 `shell.overlay`。
- **不碰 subagent 的血缘授权**。`authorizeLineage` 的注释写明"其他 agent、祖先、团队、
  工作流、host 一律拒绝，直到有明确的 authority 协议"。投递走 core 层是 host adapter 的
  正当用法（session-reference 自己就调 `followup()`/`steer()`），不是绕过它。
- **不做投递的事前确认**。授权模式是**完全信任**（见「信任」）：助理不问就做。代价由
  「引用不驱动投递」这条硬约束承担——这是 DSH 唯一不兜底、必须由本项目自己守住的边界。
- **不撤销已投递的消息**。投递一旦进入目标会话就是那条会话历史的一部分；纠正的方式是
  再投一条，不是抹掉前一条。
