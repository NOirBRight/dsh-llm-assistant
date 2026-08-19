# 架构决策记录

本文件是 `dsh-llm-assistant` 的决策权威。**每条决策都附证据链**（源码位置或实测数据），
执行者不需要重新论证，也不应在没有新证据的情况下推翻。

术语以 [CONTEXT.md](../CONTEXT.md) 的词汇表为准。
DSH 版本基线：`0.1.0-rc.7`（源码参照 `~/Workstation/deepseek-harness`，其 package 版本为 rc.5，
两者在本文件涉及的 API 上一致）。

---

## ADR-001 助理是一条独立的常驻会话

**状态**：已接受

**背景**：助理要同时满足跨项目协作、日常助理、定时提醒三种诉求。候选形态有三种：
独立常驻会话、当前会话的 fork（类似 Side Chat）、纯 UI + 调度器（不含 Agent）。

**决策**：助理是插件用 `ctx.agents.create()` 建立的一条 root Agent 会话，cwd 指向专用目录，
不属于任何 workspace。进程重启后用 `ctx.agents.resume({ resumeSessionId })` 恢复同一个 id。

**理由**：
- `dsh-schedule` 的 timer 由 **live root Agent** 持有（`packages/schedule/schedule/README.md`），
  没有常驻会话就没有定时能力。
- fork 不继承父会话的提醒：fold 只从 `session.header.seedLength` 之后开始（同上 README）。
- 跨项目要求助理不能坐在任何一个项目的会话里。
- 长期记忆要求一条连续的对话历史。

**后果**：
- 助理必须在 `await ctx.get('loader')?.await()` 之后创建，否则拿不到 schedule 工具
  （schedule 只对插件加载之后创建的 root Agent 装工具）。
- 助理会话的 id 必须持久化，否则重启后变成新会话、丢失历史与提醒。

**实测**（`probe.log`）：会话稳定保持 `idle`；重启后 resume，错过 4 分 49 秒的提醒在 **9ms 内**补投。

**被否方案**：subagent（拿不到 session 级 schedule 工具，且受 `authorizeLineage` 血缘约束）；
fork（跨项目与常驻两个诉求同时失效）。

---

## ADR-002 席位挂在 `shell.overlay`

**状态**：已接受

**决策**：席位注册为 `shell.overlay` 的一个条目，**绝不注册到 `root`**。

**理由**：`ui-layout` 声明 `'shell.overlay': { kind: 'list'; scope: 'root' }`
（`packages/client/ui-layout/src/client/index.ts:83`），`AppFrame` 在
`renderSlot('shell.overlay', {})` 处渲染它。`dsh-client-runtime` 的 `slots.ts` 明确写明它是
「浮在整个应用之上的自有界面」的挂载点，并警告注册到 `root` 会**遮蔽整个 AppFrame**
（动态注册的条目优先级更高，会成为唯一的胜者）。

- `kind: 'list'` → 与其他插件的 overlay 条目并存，不互相遮蔽（可与市面桌宠插件共存）。
- `scope: 'root'` → 不随会话切换重建，正是常驻助理所需。

**后果**：`shell.overlay` 是 click-through 的，容器必须 `pointer-events: none`，
只在实体元素上恢复 `auto`；否则整块透明区域会吃掉底下会话界面的点击。

**实测**：席位在可访问性树中为 `button "展开助理"`；`root` 的
`pointer-events` 为 `none`、席位实体为 `auto`；modal 正常盖住席位（层级正确）。

---

## ADR-003 投递走 core 层，不走 subagent

**状态**：已接受

**背景**：助理需要把消息送进另一条已存在的会话。DSH 有两条候选路径。

**决策**：使用 `ctx.agents.get(sessionId).followup(message)`，消息 `source` 采用官方的
`relay` ContextForm。**不使用** subagent 的 `send_message`。

**理由**：subagent 路径被两道硬门挡死，两条路径（live 与 cold resume）都过
`authorizeLineage`（`packages/subagent/subagent/src/continuation.ts`）：

```ts
if (parentSession !== parent.id) {
  throw new SubagentError(`subagent "${childId}" belongs to another parent session`, 'UNAUTHORIZED')
}
```

1. **血缘**：只有目标的直接父级可投递。该函数注释写明「其他 agent、祖先、团队、工作流、host
   一律拒绝，直到有明确的 authority 协议有生产消费者」。
2. **身份**：目标必须带 `mode: 'continuable'` 的 descriptor，否则 `NOT_RESUMABLE`。用户手开的
   项目会话不满足。

走 core 层不是绕过授权：`session-reference` 这一官方能力自己就调 `followup()` / `steer()` /
`inject()`（`packages/context/session-reference/README.md`），host 插件直接操作 Agent 是标准姿势。

**后果**：投递的授权语义由本项目自行定义（见 ADR-006），这是 DSH 唯一不兜底之处。
`MessageSourceMap` 是 merge-extensible 的（`packages/llm/llm/src/message.ts:100`），
可 declare-merge 自己的 kind。

---

## ADR-004 跨项目干活用「派单」，不用「代执行」

**状态**：已接受（**推翻了初始方向**）

**背景**：初始方向是让助理自己 spawn subagent 到目标项目目录干活。

**决策**：助理不自己执行。它在目标 workspace 建立或恢复一条会话，把任务**投递**进去，
再靠**引用**观察进度。

**理由**：in-process subagent provider **从父 agent 的 durable session state 派生 workspace**
（`packages/subagent/subagent/src/types.ts:107`），到不了目标目录。只有 ACP 类 provider 读独立 cwd。

派单反而严格更优：cwd 与权限预设天然正确（用目标项目自己的）、transcript 留在目标项目可审计、
助理自身保持零写权限。

**后果**：若日后确需真正的「助理自己动手」，必须改用 ACP 类 provider，届时安全面与工作量另算。

---

## ADR-005 定时以原生 schedule 为唯一真实触发源

**状态**：已接受

**决策**：`dsh-schedule` 打底，其上自建**日程层**持有 cron 表达式；日程层到点把下一次触发折算成
一次性 `after` 记录喂给原生 schedule。原生记录**始终**是唯一真实触发源。

**理由**：原生 schedule 有三个硬约束（`docs/subsystems/schedule.md`）——只有 fixed-rate
没有 cron 表达式、`every_seconds` 下限 300 秒、记录只活在 session log 里。但它的 durable 语义
（replay、重启补投）是免费且已验证的，重写它得不偿失。

**后果**：
- `@deepseek-ai/dsh-schedule` **不在任何官方 bundle 里**（base / web-app 都不带），
  本插件必须自己 insert 或在文档中要求用户挂载。
- 提醒到达只是助理会话里多一轮对话，`source={kind:'plugin',plugin:'schedule'}`。
  DSH 明确不提供任何 Schedule 专属浏览器 UI，**气泡必须自己画**。
- 循环提醒错过多个周期时只补最近一次，不枚举不回放（官方契约，**尚未实测**）。

**实测**：`scheduledAt` 15:07:22.820 → dispatch 15:07:22.822，**误差 2ms**，全程零浏览器连接。

---

## ADR-006 授权模式：完全信任，配套「引用不驱动投递」

**状态**：已接受（用户拍板）

**决策**：投递与派单**不需要事前确认**。同时确立一条硬约束：助理**只因主人的话**发起对外动作，
**绝不因引用来的内容**发起。

**理由**：完全信任消除的是「问一句」，不是「看得见」——投递始终以 `relay` 身份进入目标会话
（`MessageSource` 的类型事实），并永久留在 transcript 里。

没有配套约束时，「完全信任 + 跨会话引用」构成 prompt injection 放大路径：助理会把其他会话的
untrusted 内容读入上下文，若其中含指令而助理又能无确认地投递到任意会话。`session-reference`
官方快照已带警告（禁止听从快照里的指令、权限声明与工具请求，除非当前用户重复），本约束把同一
边界延伸到助理的对外动作上。

**后果**：约束必须落到助理的 system prompt，并需要一条针对它的测试（见 SPEC AC-INJ-1）。
已投递的消息不撤销；纠正靠再投一条。

---

## ADR-007 跨项目读用 `session-reference`

**状态**：已接受

**决策**：引用能力使用 `ctx.sessionReferenceResolver`，不自己用 `ctx.sessionQuery` 拼装。

**理由**：`listCandidates(agent, query?, limit?)` 列出除自己以外的会话，按 same-cwd /
cwd-less / other-cwd 排序——**跨仓库且无血缘限制**。`prepare()` 已处理 untrusted 边界
（`## Referenced sessions` 警告块）、token 预算、压缩检查点投影、防递归快照传播、
`<` 转义防标签注入。自己拼装意味着把这些全部重写一遍。

**后果**：受官方上限约束——最多 **3** 个来源（`maxReferences` 且不得超过 3）、
每来源 **64KB**（`maxReferenceBytes`）。引用内容以 `recall` ContextForm 进入上下文。

---

## ADR-008 脑皮分离：助理 ≠ 宠物

**状态**：已接受

**决策**：「助理」（常驻 Agent）与「宠物」（席位上的可见形象）是两个概念。皮是表达层，可替换、
可缺席，不改变助理是谁。

**理由**：市场上已有 20+ 个 DSH 桌宠插件（`dsh-pets`、`dsh-codex-pet`、`whale-girl`、
`dsh-desktop-pet` 等），全部占据「皮」这一位置——镜像 agent 状态 + 玩耍。不做区分，本项目会被
读成第 21 个桌宠。

**后果**：核心能力不得依赖任何皮的实现；皮应可插拔。`shell.overlay` 是 list slot，本插件与现有
桌宠插件可共存于同一席位区域。

---

## ADR-009 独立插件，不并入 dsh-codex-sidebar

**状态**：已接受（用户拍板）

**决策**：全新独立仓库与插件。

**理由**：作用域正交——sidebar 服务于**单个主会话**（挂 `details` / 会话头部 slot），
助理服务于**全局**（挂 `shell.overlay`，root scope）。合并会把两个不同作用域塞进一个包。

**后果**：不复用 sidebar 的 host adapter；sidebar 的 `CONTEXT.md` 术语（如其自造的「投递」）
不作为本项目的定义依据——本项目的术语锚定官方概念（`relay` / `recall` / slot / workspace）。
工作台只读/只写口是 **sidebar 定稿后另立的跨插件契约**（ADR-012），不是把两个插件并成一个包。

---

## ADR-010 工具表为管家服务，不为第二个工人服务

**状态**：已接受（用户拍板，2026-08-19）

**背景**：席位打通后，助理几乎继承了主 Agent 的工具面（含 bash / 外部 worker）。
主窗口是项目工人；助理按 ADR-001/004/008 是跨项目管家。工具表必须为这个差服务。

**决策**：

1. **本地窄表**。助理 cwd 是记事本。默认留：对话、看图、联网查询、todo/goal、`schedule_*`、
   对自己 cwd 的只读（`read` / `glob` / `grep`）。砍：`bash` / `write` / `edit` / 终端类。
2. **禁止助理自己外派**。`delegate_worker`、`subagent_claude_code`、`subagent_codex`、
   `worker_*` 一律 `tools.restrict` deny。外部 worker 不进会话树，无跟踪。
3. **跨项目干活只走派单**（ADR-004 不变）：目标 workspace 建/恢复主会话 → `followup`+`relay`
   → 引用观察。那条会话可以再 Delegate 外部 Worker，跟踪点是 sidebar 里的主会话。
4. **探索型 in-process subagent 允许，且仅限自家 cwd**。in-process provider 从父会话派生
   workspace（`packages/subagent/subagent/src/types.ts`），到不了项目目录，因此只适合翻笔记。
   子代理 `restrict` 为只读 + `delegationDepth` 1；不得再持有外派工具。
   这不是推翻 ADR-004：ADR-004 禁的是「自己到别人的目录里干」。
5. **`tools.restrict` 必须打在 `agent.ctx` 上**（`packages/core/tools/src/index.ts`），不得改 host 全局表。
   setup 先对当时已注册的名字施加 deny；同时由同一个 `agent.ctx` 监听全局、unfiltered 的
   `tools/change`，对先前 unknown-name 的目标重试。助理会话和值班会话使用同一机制。由于
   `restrict()` 自身也会同步触发 `tools/change`，实现必须去重并防重入。host 上的工具保持注册，
   因而普通项目主会话仍可使用 `delegate_worker` 与具名 worker 工具。

**后果**：T1.3 只加 schedule，不放宽本地施工。Phase 2 的投递/派单是管家的手，不是把 bash 还给它。

---

## ADR-011 心跳与日程层分开，共用原生 schedule 触发器

**状态**：已接受（用户拍板，2026-08-19）

**背景**：需要「定时看看有没有事要回报」。候选是自建 cron、或复用原生 `every_seconds`。

**决策**：

- **心跳**是产品职责，不是调度语言。它跑在 **第二条隐藏的常驻 root 会话（值班会话）** 上，
  不是助理会话。timer 仍是原生 `every_seconds`（≥ 300），因为 `dsh-schedule` 只给
  **live root** 装工具（`ctx.agents.roots()`，与 durable `origin` 无关）。
- 值班会话与助理一样 archive，不进侧边栏。LLM 每班照跑；**安静结果不得进入助理 transcript**。
  判定有事（过期提醒、卡住/失败的 todo/goal；T2.0 起加名册）才 `followup` 到助理。
  席位只渲染助理会话，因此空巡视人看不见、未读不亮。值班自己的 log 可以脏，助理的不脏。
- 心跳 **只回报、不投递、不写 Terminal/批注**。站岗令是主人预先写下的，不是引用来的指令。
- **用户提醒**仍挂在助理会话上（人说「三分钟后叫我」）。
- **日程层**（T3.1 / ADR-005）是日历表达式，不是心跳。心跳不建在日程层上。

**理由**：同一会话里跑心跳即使用 UI 隐藏，空巡视仍进下次 prompt。独立值班会话才把
「OpenClaw 式不输出」做到上下文层。不是第二套 OS 进程，也不是 `delegate_worker`。

**后果**：boot 要 resume/create **两条** 会话。两条都 live 心跳才响。T1.3 装 schedule、
用户提醒、默认值班；T1.4 只给助理会话的可见新消息亮点。README：助理或值班没在跑，
对应的提醒/心跳不响。

---

## ADR-012 窗口感知分两期；工作台契约等侧栏定稿

**状态**：已接受（用户拍板，2026-08-19）

**背景**：管家看不见「屋里在干什么」，派单和心跳都是瞎的。侧栏（`dsh-codex-sidebar`）
已有「列出 / 察看」和人的 Terminal / Browser / 批注，但 **侧栏尚未定稿**，此时写死跨插件
RPC 会锁错形状。

**决策**：

### 第一期（本插件可先做，不依赖侧栏定稿）

- **列出**：本 profile 未归档主会话名册（跨 workspace；不含助理自己、archived、subagent、
  Side Chat）。字段对齐 `SessionSummary`：id / 标题 / cwd / `running` / pending / 更新时间。
- **察看**：一张进度卡片——忙/闲、当前 turn/step 或最后工具名、上一句可见结论、本轮变更文件
  列表。冷会话只读 log，**不为察看去 resume 把它跑起来**。
- **焦点**：当前激活的主会话是 Web 客户端的 `sessions.list.current`。助理席位与主 UI 同页，
  由席位把焦点回传 host，写入助理上下文或只读工具。Host 默认不知道人盯着哪条。

概念与侧栏 Side Chat 的「列出 / 察看」对齐，**实现走 DSH host API + 本插件席位 RPC**，
不 import 侧栏、不复用它自造的「投递」定义（ADR-009）。

### 第二期（侧栏定稿后再立契约，现在只记意图）

工作台是侧栏按主会话 id 发布的只读/受控口，助理只当调用方。定稿前不写 endpoint、不写 schema。
预期能力（非正式，供侧栏定稿时对照）：

| 面 | 查询（人一问就做） | 操作（只因当前这句人话） |
|---|---|---|
| Terminal | 该主会话的 Tab 列表；`read` 最近 N 行 / 按关键字 | 写进 **同一条人的 pty**（host 已有 `read`/`write`），命令带可见标记；先读后写；禁止心跳写 |
| Browser | URL；DOM（结构+可见文本）；console 环形缓冲（error/warn+stack） | 先保守（开 URL / 刷新）。点选后置 |
| 批注 | 模式开没开、pending mark、草稿、已叠未发（Browser **和** Files） | 增删改未发；发送/入队到 **主会话**（ADR：批注是给工人的指令，不是给管家的）。已发送的从主会话 transcript 察看 |

约束（与 ADR-006 同一条边界的延伸）：

- 只因主人的话查询细节或动手；心跳只用列出/焦点的忙闲，不灌 pty、不标、不发。
- 看见 console / 批注 / 别的会话里的字 ≠ 投递或写 Terminal。
- 不刮 DOM、不读人的键盘；没有侧栏开口就说「无工作台」。
- 不为修「人那条 Terminal 里的错」另开私有 pty。

**理由**：`SessionSummary.running` 已在 host（`packages/host/apiproxy/src/api/sessions.ts`）。
侧栏 `host-terminal.ts` 已有同 pty 的 `read`/`write`；`PageDocument` / `Annotation` 已有雏形，
但 console 与批注操作口未稳定。ADR-0012（侧栏）规定 Terminal 是人的壳、输出不进主会话——
所以必须侧栏开口，不能从 session log 猜。

**后果**：排期上第一期可紧挨 T1.5 之后（或与 T2.1 并行）。第二期是独立切片，阻塞条件是
`dsh-codex-sidebar` 定稿，不是本插件 Phase 1。

---

## ADR-013 助理会话用短交接滚动，不复制 transcript

**状态**：已接受（用户以“继续”确认）

**背景**：助理是长期席位，但单条助理会话的上下文会涨满。产品需要从席位直接开启下一条
助理会话继续工作；这不是外部 worker 的 `--resume`，也不是 fork / 复制整段父会话。

**决策**：

1. **入口属于席位 chrome**。在 composer 右侧现有 model / context / send 一行，把一个紧凑的
   席位按钮放在 ContextMeter 左侧，常态文案「新对话」。ContextMeter ≥ 85% 时按钮进入警示色，
   tooltip / 辅助文案改为「上下文将满，新开一条继续」；不照抄主聊天的 Continue 样式。助理
   正在 running 时禁用，提示「助理回复完再新开」，避免切走半个 turn。一次点击直接执行，不再
   加确认框。
2. **交接是有界的结构化首条消息**。host 为新会话写入一条来源标记为本插件的
   `【助理会话交接】`，只含：当前 goal（若有）、所有未完成 todo、这些字段及最近一组已完成
   对话中明确出现的必要绝对路径（去重、有数量上限）。若没有 goal / todo，则补一行「当前焦点」：
   最近用户请求与最近助手结论的短摘录。整份交接上限 4 KiB；不带图片、thinking、工具过程、
   已完成 todo，也不复制 transcript。
3. **host 原子切换席位所有权**。新增 RPC 只接收“滚动当前助理会话”，不接受任意 sessionId。
   host 创建一条同 cwd、同模型、同 `agent.ctx` 工具限制的新 root 助理会话，写入并 flush 交接，
   再原子更新持久化 `sessionId` 与席位当前快照。任一步失败都保持旧会话为当前会话，RPC 返回
   明确错误。客户端以返回的新 `sessionId` 立即刷新 snapshot，并按 sessionId 重置未读基线。
4. **旧会话归档且只读保留**。旧 id 进入插件持久化的历史 id 列表，继续保留在 DSH session
   store 并保持 archive；席位不再向它 send / set-model / 写消息。此次不做历史会话浏览 UI。
5. **提醒是运行状态，不塞进交接 prose**。切换完成前必须把旧助理会话尚未触发的用户提醒
   迁移到新会话，并在新记录 durable 后停用旧记录；值班会话不滚动。若当前 DSH schedule
   公共面无法完成可验证的迁移，按钮实现必须先停下并回到本 ADR 决策，不能静默丢提醒，也
   不能让旧会话继续在不可见处提醒。

**不采用**：

- fork / seed 整段旧历史：把上下文压力原样带过去，且 reminder 不随 fork 继承。
- 让模型自由写一篇长总结：长度、遗漏与延迟不可控，满上下文时最不可靠。
- 复用产品工人的 `--resume` 或任何 external-agent 工具：角色与审计位置都错误。
- 只改客户端 snapshot 指针：创建、交接、持久化与归档必须由 host 作为一个切换事务负责。

**实现证据**：`session-rollover.ts` 在旧、新 agent 的 maintenance 临界区内完成交接、精确 schedule
record 复制、new-session flush 与 state 原子 rename；随后停用旧 schedule 并释放旧 agent handle。
`assistant/rollover` 不接收 sessionId。`AssistantSeat.tsx` 的席位按钮在 ContextMeter 左侧，85% 时警示。

---

## ADR-014 任务引用复用官方快照，不创建隐藏 fork

**状态**：已接受（用户批准落地计划）

**背景**：Side Chat 通过 `sessions.fork()` 固化主会话上下文，与常驻小管家的问答职责重叠。
DSH rc.7 没有独立 Task 实体，但已有 `sessionQuery` 的 lineage 查询和
`sessionReferenceResolver` 的有界、不可变、带注入警告的会话引用。

**决策**：

1. 第一版“任务”是以可见主会话为 root 的非 subagent lineage；独立 root 不猜测合并。
2. 席位的“引用任务”默认置顶当前任务，显式选择另一任务时以选择为准；身份由 session id 传递，
   不对自然语言任务名做猜测。
3. 薄 adapter 只负责 root 解析、来源排序、排除助理/值班/subagent 和最多三条去重；读取、投影、
   截断与 prompt-injection 警告全部交给官方 resolver。部署预算为每来源 16 KiB、最多 3 来源。
4. 任务 chip 粘性保持；首次、换任务、主动刷新或助理 rollover 后重新捕获。普通追问复用已有快照，
   避免重复注入。原始 reference JSON 不作为用户气泡呈现，只显示来源 receipt。
5. 引用内容是只读且不可信，不能自行驱动投递、派单或权限改变。该能力是 host 数据流，不是模型工具。
6. Side Chat 从 palette、pane 和 fork 执行路径退场；旧持久化 tab 在 hydration 时过滤并修复 active。
   旧 schema 暂时兼容，后续清理不影响本次发布。

**不采用**：复制完整 transcript、把 Goal 重命名成 Task、让模型自己列/读会话、在小管家背后继续 fork、
新增 external-agent 或文件/命令工具。

**后果**：跨会话覆盖受 lineage 与 3 条来源限制；receipt 必须显式显示省略数。该限制换来可审计、
有界且不改变 worker tool Exposure 的上下文读取。
