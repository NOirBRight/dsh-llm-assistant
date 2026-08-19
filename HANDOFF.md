# Handoff — dsh-llm-assistant

给执行 Agent 的开工简报。读完本文件即可动手。不要重新论证产品定义，不要重写规划。

---

## Task

从 Phase 1 / **T1.1** 开始，把本插件做成一个真正活着的常驻助理，再按 `docs/PLAN.md` 的依赖图一路做到 Phase 1 完成（0→1），然后是 Phase 2 / 3 直到 SPEC 全部 AC 通过。

**现在立刻做的事是 T1.1**：在 `src/index.ts` 实现 host 半边——插件启动时 create 或 resume 一条常驻助理会话，并持久化其 id。

---

## Who you are

你是执行者，不是设计者。

- 决策权威：`docs/ADR.md`（9 条，每条附证据。没有新证据不得推翻。）
- 完成定义：`docs/SPEC.md`（11 组、64 条可判定 AC）
- 任务包：`docs/PLAN.md`（接口签名与文件路径已核实，不必重新勘探）
- 术语：`CONTEXT.md`（含 *Avoid* 列表；用错词等于做错产品）

与 ADR 冲突的实现必须先更新 ADR（附新证据）再改代码，不得静默偏离。

---

## Product in one paragraph

这是 DeepSeek Harness 里的**脑**，不是第 21 个桌宠皮。插件持有一条不属于任何 workspace 的常驻 root Agent（助理）。席位挂在 `shell.overlay`。能力是跨项目**引用**（读）、**投递**（写进已有会话）、**派单**（在目标 workspace 建会话再投递）、以及挂在助理会话上的**提醒**。授权模式是**完全信任**（投递/派单不问主人），配套硬约束是**引用不驱动投递**。

---

## Current state（2026-08-19 核实过仓库）

仓库**不是 git 仓库**（没有 `.git`）。没有 README，没有测试。DSH 版本基线 `0.1.0-rc.7`。

| 路径 | 状态 |
|---|---|
| `CONTEXT.md` | 完成。词汇表 + 产品边界 + 组装前提 |
| `docs/ADR.md` | 完成。ADR-001…009 已接受 |
| `docs/SPEC.md` | 完成。S1–S11 |
| `docs/PLAN.md` | 完成。T1.1–T3.3 |
| `package.json` / `tsdown.config.ts` / `cordis.patch.yml` | 双半边插件骨架，构建通过 |
| `src/index.ts` | **空壳**。`apply()` 是空函数 |
| `src/client/` | 席位已挂 `shell.overlay`。面板是静态占位：「席位已挂载。下一步把这里接到常驻的助理会话。」 |
| `probe.mjs` + `probe.log` | T1.1 的直接蓝本。create / resume / schedule 全链路已在 lab 跑通 |
| `~/.dsh-lab/profiles/pet-probe` | 本插件已 `link:` 安装。`@deepseek-ai/dsh-schedule` 已 insert |

**Phase 0 已完成。Phase 1 未开始。**

已通过的席位 AC：AC-SEAT-1/2/3/5（注册 overlay、click-through、开合、不挡 modal）。
未做：AC-SEAT-4/6/7，以及 SESSION / CHAT / REMIND / BUBBLE 全部。

可行性已由探针证明、尚未写入产品代码：AC-SESSION-1/2/3/4/7，AC-REMIND-3/5/6。

席位与 `probe.mjs` 是参考实现，不是既成事实。更好的组织方式可以换，但 AC 与 ADR 不能换。

---

## Environment

**所有验证在 `DSH_HOME=/home/noirbright/.dsh-lab`。严禁碰 `~/.dsh`（生产）。**

```bash
# 构建
cd /home/noirbright/Workstation/dsh-llm-assistant && pnpm run build

# 启动实验环境
cd /home/noirbright/.dsh-lab/profiles/pet-probe
DSH_HOME=/home/noirbright/.dsh-lab dsh --profile pet-probe --port 3099

# 只看组装，不启动
DSH_HOME=/home/noirbright/.dsh-lab dsh --profile pet-probe --dump-config
```

- 源码参照：`~/Workstation/deepseek-harness`（包版本标 rc.5，本项目涉及的 API 与 rc.7 一致）
- 同作者插件、client 注册写法已被沿用：`~/Workstation/dsh-codex-sidebar`
- 官方 create Agent 范例：`~/Workstation/deepseek-harness/packages/bundle/headless/src/index.ts:96-140`
- 席位已 link 进 `pet-probe`。改完 `pnpm run build` 即可在 lab 看效果
- lab 启动时可能弹出「内测声明」mask，会吃掉所有 pointer events。点「继续」或在 lab settings 写 `ui-onboarding.welcomeNoticeVersion`。不要为了点掉它去改生产 `~/.dsh`

**lab Home 现状（与 PLAN / profile 注释有一处偏差）**：`~/.dsh-lab/settings.yaml` **现在存在**，是 user layer，优先级高于 profile 的 `cordis.patch.yml`。`pet-probe/cordis.patch.yml` 里「这个 Home 的 settings.yaml 已不存在」已经过时。模型写在 patch 里仍可能被 user layer 覆盖。当前 settings.yaml 未见 `agent-default-model` 键，但动手前仍应用 `--dump-config` 确认实际生效的 provider/model。

`pet-probe` 当前模型意图：`provider: ollama-cloud`（**不是**插件 id `llm-ollama`），`model: deepseek-v4-flash:0731`。

---

## Five traps（先读再写代码）

1. `$DSH_HOME/settings.yaml` 是 user layer，压过 profile 的 `cordis.patch.yml`。
2. provider 名 ≠ 插件 id。`dsh-llm-ollama` 的插件 id 是 `llm-ollama`，注册的 provider 名是 `ollama-cloud`。写错得 `NO_ADAPTER`。
3. disable 一个提供服务的插件却不给替代品，整棵树激活失败。症状会伪装成「工具表为空、turn 秒退」。真实错误在启动输出：`pending (waiting for service: X)`。
4. `@deepseek-ai/dsh-schedule` 不在任何官方 bundle 里，必须自己 insert。lab profile 已经 insert 了；产品插件的 `cordis.patch.yml` 目前只 insert 了自己，T1.3 要补 schedule（或缺失时明确提示，AC-NFR-1）。
5. 必须 `await ctx.get('loader')?.await()` 之后再 create/resume Agent。否则 scoped 工具（含 schedule）可能只组装了一半。

---

## Do this now: T1.1

验收：AC-SESSION-1/2/3/5/6/7。无依赖。

在 `src/index.ts` 实现：

1. `export const inject` 至少 `['agents', 'sessions', 'agentDefaultModel']`；要读工具表再加 `'tools'`。cordis 的 service 属性代理只对 inject 过的键生效。
2. `await ctx.get('loader')?.await()`。
3. 从本插件自己的持久化读 session id（`$DSH_HOME` 下自有文件，或 `ctx.storageDomain`）。选型自定。
4. 有 id 则 `ctx.agents.resume({ resumeSessionId, agentOptions })`；id 指向的会话已不存在则降级新建，不崩溃（AC-SESSION-6）。
5. 无 id 则 `ctx.agents.create({ sessionId, meta: { cwd }, agentOptions })`。
   - `sessionId`：`SessionId(\`session-${randomUUID()}\`)`
   - `cwd`：专用目录，建议 `$DSH_HOME/assistant-workspace`。**不要**用任何项目路径，否则污染会话树（AC-SESSION-4/5）。探针用的是 `/home/noirbright/.dsh-lab/pet-workspace`，产品代码应换成自己的约定并写进文档。
   - `agentOptions`：`defaultModel.currentSelection()` 的 provider/model。
6. 把 id 写回持久化。

蓝本：`probe.mjs` 的 `run()`（约 95–140 行）。官方范例见上面 headless 路径。

`SessionId` / `createUserMessage` 必须从**运行中的 dsh entry** 解析，不能从本插件 `node_modules` 里那份 nested 副本 import——副本与运行时不是同一个实现。`probe.mjs` 开头的 `createRequire(realpathSync(process.argv[1]))` 就是这个问题的解法。

验证：启动 → 停止 → 再启动，两次 sessionId 相同且 `session.seq` 延续。

T1.1 完成判据：AC-SESSION-1/2/3/5/6/7 在 lab 可观测通过。不要顺便做 T1.2。

---

## After T1.1

按 `docs/PLAN.md` 的图，不要跳：

```
T1.1 ──┬── T1.2 ──┬── T1.4 ── T1.5     ← Phase 1 = 0→1
       └── T1.3 ──┘
                    │
      T2.1 ∥ T2.2 → T2.3 → T2.4       ← T2.3 不可省略、不可与 T2.4 对调
                    │
                  T3.1 → T3.3 → (T3.2 可选，最低优先)
```

- **T1.2** 席位连通会话。host↔client 走 Connection RPC。参考 `dsh-codex-sidebar` 的 `src/contract.ts` + `src/host-rpc.ts` + `src/client/controller.ts`。或 Typert API Gateway（`@Remote`）。订阅 `ctx.on('session/event', …)`。面板状态不要存进 session-scoped store（AC-SEAT-4）。
- **T1.3** 提醒。产品 `cordis.patch.yml` insert `@deepseek-ai/dsh-schedule@0.1.0-rc.7`。`schedule_create` 恰好一个 `after_seconds` / `at` / `every_seconds`；`every_seconds` ≥ 300；`at` 必须带显式 offset 或 `time_zone`。提醒到达**没有系统通知**，只是会话里多一轮 `source={kind:'plugin',plugin:'schedule'}`。
- **T1.4** 气泡。未读基线是「上次打开面板时的 seq」，刷新后不能把历史全算未读（AC-BUBBLE-3）。
- **T1.5** `pnpm run check`、错误边界、主题、键盘、README。README 必须写清：**助理不活着时提醒不触发。**
- **T2.1** `ctx.sessionReferenceResolver`。超限抛 `SESSION_REFERENCE_BUDGET_EXCEEDED`，不要自行截断。`prepare()` 的 `additionalContext` 要在 `followup()`/`steer()` **之前**送入。
- **T2.2** `ctx.agents.get(id)?.followup(message)`，`source` 用官方 `relay`。**不要**用 subagent 的 `send_message`（`authorizeLineage` 会 `UNAUTHORIZED`）。目标可能是 cold 的，先 `resume`。
- **T2.3** 「引用不驱动投递」写入 system prompt + AC-INJ-1 测试。这是完全信任模式的安全支柱。
- **T2.4** 派单：在目标 workspace 建会话（`meta.cwd` = 该路径）→ 投递 → 引用观察。不要把 in-process subagent 派到别的目录。
- **T3.1** 自建 cron 层，只向原生 schedule 登记**下一次**一次性 `after`。AC-CRON-5（长关机跨多周期只补一次）是整份规划里**唯一尚未实测**的行为，必须自己验证。
- **T3.2** 皮可插拔，可跳过。
- **T3.3** `ctx.locale.register`。

一次只做一个 PLAN 任务。做完再开下一个。

---

## Hard constraints

- 术语用 `CONTEXT.md`。不要把助理叫桌宠/subagent/守护进程，不要把投递叫 `send_message`，不要把引用叫同步。
- 不修改 DSH 内核，不绕过 `authorizeLineage`。
- 不做投递事前确认，不撤销已投递消息。
- 不做状态动画 / 换装 / 投喂 / 亲密度（ADR-008）。席位有个能开合的入口就够；皮不是本阶段工作。
- 不把本插件并入 `dsh-codex-sidebar`（ADR-009）。可以抄它的 RPC / tsdown / client 注册写法。
- 不要为小改动新建测试基础设施；有现成 vitest（`package.json` 的 `pnpm run check`）时，按任务补最小合同测试。T1.5 才要求测试齐。
- 不要 commit / push（本仓库目前甚至没有 git）。不要写 secrets。

---

## What was tried / do not redo

前一会话（Claude，只读，已结束）做了定义、勘探、探针、骨架、规划。它在用户要求写本 handoff 时因 API 529 中断。不要重做：

- 不要再讨论「助理是不是应该做成 fork / subagent / 纯 UI」。ADR-001/003/004 已否。
- 不要再验证「schedule 能不能在没浏览器时触发」——`probe.log` 已证明，误差 2ms，重启后 9ms 补投。
- 不要再验证「席位能不能挂上 overlay」——已挂上，AC-SEAT-1/2/3/5 已过。
- 不要读 sidebar 的 `CONTEXT.md` 来定义本项目的「投递」。本项目锚定官方 `relay` / `recall`。

---

## Acceptance for this handoff's first slice

T1.1 完成时必须能指出：

- [ ] `src/index.ts` 在 `loader.await()` 之后 create/resume
- [ ] session id 持久化；杀进程再启动，id 不变、`seq` 延续
- [ ] cwd 是专用目录，不在任何已注册 workspace 路径下
- [ ] 持久化 id 对应会话被删后，重启是新建而不是崩溃
- [ ] 助理会话工具表含 `schedule_create` / `schedule_list` / `schedule_delete`（lab profile 已挂 schedule；若产品 patch 还没 insert，至少在 lab 里能看到工具——T1.3 再把 insert 收进本插件）
- [ ] 生产 `~/.dsh` 未被修改
- [ ] 未做 T1.2 及以后

然后停下来，按 PLAN 开 T1.2。
