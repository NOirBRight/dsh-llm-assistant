# 产品规格

「完全符合 SPEC」= 下列全部验收标准（AC）通过。术语见 [CONTEXT.md](../CONTEXT.md)，
决策依据见 [ADR.md](./ADR.md)。

AC 编号在 [PLAN.md](./PLAN.md) 中被任务引用。**每条 AC 必须可判定**：要么有自动化测试，
要么有明确的人工验证步骤与观测点。

验证环境一律为 `DSH_HOME=~/.dsh-lab`，**禁止在 `~/.dsh`（生产）验证**。

---

## S1 席位 SEAT

助理在 Web UI 右下角的常驻可见入口。

| AC | 标准 | 验证方式 |
|---|---|---|
| AC-SEAT-1 | 席位注册为 `shell.overlay` 条目，不注册到 `root` | 代码审查 + 可访问性树出现该 button |
| AC-SEAT-2 | overlay 容器 `pointer-events: none`，席位实体 `auto` | `getComputedStyle` 断言 |
| AC-SEAT-3 | 点击席位展开面板，再次点击或点关闭按钮收起，可反复开合 | 交互测试 |
| AC-SEAT-4 | 切换会话、切换 workspace 后席位与其展开状态不重建 | 手动：切换后面板仍开着 |
| AC-SEAT-5 | 席位不遮挡模态对话框 | 打开任一 modal，席位在其下 |
| AC-SEAT-6 | 明暗主题下均可读，跟随 DSH 主题变量 | 两种主题各截图一次 |
| AC-SEAT-7 | 键盘可达：可聚焦、Enter/Space 开合、`aria-expanded` 正确 | 可访问性测试 |

**已完成**：AC-SEAT-1/2/3/5 已实现并验证（`src/client/`）。AC-SEAT-4/6/7 待验证。

---

## S2 助理会话 SESSION

助理的身份与生命周期。

| AC | 标准 | 验证方式 |
|---|---|---|
| AC-SESSION-1 | 插件启动后存在一条 root Agent 会话，cwd 为专用目录 | `ctx.agents.get(id)` 非空 |
| AC-SESSION-2 | 会话在 `await ctx.get('loader')?.await()` 之后创建 | 代码审查 + schedule 工具可见 |
| AC-SESSION-3 | 会话 id 持久化；进程重启后 resume 同一 id，历史与提醒延续 | 重启后对比 id 与 `session.seq` |
| AC-SESSION-4 | 助理会话不出现在 Web UI 会话树中 | 人工：会话列表中不可见 |
| AC-SESSION-5 | 会话 cwd 不是任何已注册 workspace 的路径 | 断言 cwd ∉ workspace 路径集 |
| AC-SESSION-6 | 持久化的 id 指向的会话不存在时，能降级为新建而非崩溃 | 删除 session 文件后重启 |
| AC-SESSION-7 | 助理会话可见 `schedule_create` / `schedule_list` / `schedule_delete` | 工具表断言 |
| AC-SESSION-8 | 席位 ContextMeter 左侧有「新对话」；running 时禁用，≥85% 时显示警示语义 | 3082 UI + 可访问性树 |
| AC-SESSION-9 | rollover RPC 不接收任意 sessionId，只滚动当前助理会话 | RPC 自动化测试 |
| AC-SESSION-10 | 新会话交接 ≤4 KiB，仅含 goal、未完成 todo、必要路径；无整段 transcript | handoff 自动化测试 |
| AC-SESSION-11 | 新会话 flush 与 state 原子更新成功后席位才切换；失败保持旧会话 | orchestration 自动化测试 |
| AC-SESSION-12 | 旧会话 id 归档保留且不再接受席位写入 | state + 3082 session 观测 |
| AC-SESSION-13 | 所有 active schedule 精确迁移到新会话，并在旧会话停用 | schedule adapter 测试 + 3082 实测 |

**证据**：AC-SESSION-1/2/3/4/7 的可行性已由 `probe.mjs` 实测（见 `probe.log`），但尚未在
产品代码中实现。

---

## S3 对话 CHAT

席位面板是与助理对话的界面。

| AC | 标准 |
|---|---|
| AC-CHAT-1 | 面板展示助理会话的消息历史，按时间顺序 |
| AC-CHAT-2 | 可在面板内发送消息，助理回复流式呈现 |
| AC-CHAT-3 | 助理正在思考/调用工具时面板有明确状态指示 |
| AC-CHAT-4 | 关闭面板不中断进行中的回合；重开后能看到期间产生的消息 |
| AC-CHAT-5 | 刷新页面后历史仍在（来自会话日志，非前端状态） |
| AC-CHAT-6 | 工具调用在面板中可见（至少工具名），不静默执行 |

---

## S4 提醒 REMIND

基于原生 `dsh-schedule` 的定时能力。

| AC | 标准 |
|---|---|
| AC-REMIND-1 | 插件自行 insert `@deepseek-ai/dsh-schedule`，或在缺失时给出可执行的提示而非静默失效 |
| AC-REMIND-2 | 用户可用自然语言让助理设置一次性提醒，助理调用 `schedule_create` |
| AC-REMIND-3 | 提醒到点后以 `source={kind:'plugin',plugin:'schedule'}` 进入助理会话并开出新回合 |
| AC-REMIND-4 | 可列出与删除已有提醒 |
| AC-REMIND-5 | 进程重启后错过的提醒在会话恢复时补投 |
| AC-REMIND-6 | 浏览器未打开时提醒照常触发 |
| AC-REMIND-7 | 时区：助理向 `schedule_create` 传显式 offset 或 `time_zone`，不依赖环境推断 |

**证据**：AC-REMIND-3/5/6 的机制已实测（误差 2ms；重启后 9ms 补投）。

---

## S5 日程层 CRON

原生 schedule 之上的 cron 能力（ADR-005）。

| AC | 标准 |
|---|---|
| AC-CRON-1 | 支持 cron 表达式（至少「每天 HH:MM」「每周 N 的 HH:MM」） |
| AC-CRON-2 | cron 规则持久化，进程重启后仍在 |
| AC-CRON-3 | 每次只向原生 schedule 注册**下一次**触发（一次性 `after`），原生记录是唯一触发源 |
| AC-CRON-4 | 触发后自动登记下一次 |
| AC-CRON-5 | 长时间关机跨越多个周期后，恢复时只补一次，不连续轰炸 |
| AC-CRON-6 | cron 规则可列出、可删除 |
| AC-CRON-7 | 时区明确：规则存储其解释时区，DST 切换不漂移 |

---

## S6 气泡 BUBBLE

席位上的通知投影（DSH 不提供，必须自建）。

| AC | 标准 |
|---|---|
| AC-BUBBLE-1 | 助理会话产生新的助手消息且面板关闭时，席位显示未读标记 |
| AC-BUBBLE-2 | 打开面板后未读标记清除 |
| AC-BUBBLE-3 | 未读计数在页面刷新后保持正确（不把历史消息全算成未读） |
| AC-BUBBLE-4 | 提醒触发产生的消息与普通回复在视觉上可区分 |

---

## S7 引用任务 TASK REFERENCE

跨会话工作项的有界只读上下文（ADR-007、ADR-014、ADR-015）。

| AC | 标准 |
|---|---|
| AC-RECALL-1 | 席位没有“引用任务”按钮、picker、chip、刷新、更换或移除控件 |
| AC-RECALL-2 | 用户发送时，客户端以不可见 `currentTask` 传递当前非 blank、非 subagent 主任务；host 不自动注入上下文 |
| AC-RECALL-3 | `task_reference` 只注册在助理作用域；无参数调用默认使用当轮 currentTask anchor |
| AC-RECALL-4 | `task` 参数可按标题或 task id 查找其他任务；精确/唯一匹配才读取，多条匹配返回候选 |
| AC-RECALL-5 | 任务解析为 lineage root + 显式 anchor + 最近相关后代，去重后最多 3 来源、每来源 ≤16 KiB |
| AC-RECALL-6 | 内容经官方 `sessionReferenceResolver.prepare`，保留 untrusted 警告并排除 tool/thinking/嵌套注入 |
| AC-RECALL-7 | 助理、值班、归档助理历史和 subagent 不作为来源；自引用被拒 |
| AC-RECALL-8 | 新引用使用标准 tool call/result 历史；原始 reference 不渲染为用户气泡，旧 receipt marker 仅兼容历史 |
| AC-RECALL-9 | lineage 不完整时只使用可验证来源，不猜测合并独立 root |
| AC-RECALL-10 | 新工具不恢复 worker 外派、bash、write、edit，也不改变 host / External Agents 全局 Exposure |

---

## S8 投递 RELAY

跨会话写入（ADR-003、ADR-006）。

| AC | 标准 |
|---|---|
| AC-RELAY-1 | 投递经 `ctx.agents.get(id).followup()`，`source` 为 `relay` 形式且携带来源会话 id |
| AC-RELAY-2 | 目标会话中该消息**不呈现为用户消息**，可辨识来源 |
| AC-RELAY-3 | 目标会话不 live 时，先恢复再投递，或给出明确失败原因 |
| AC-RELAY-4 | 投递不需要事前确认（完全信任） |
| AC-RELAY-5 | 投递结果（成功/失败）回报给助理会话，用户可见 |
| AC-RELAY-6 | 不得投递给助理自己 |

---

## S9 派单 DISPATCH

让工作在目标项目里发生（ADR-004）。

| AC | 标准 |
|---|---|
| AC-DISPATCH-1 | 助理可在指定 workspace 新建会话，cwd 为该 workspace 路径 |
| AC-DISPATCH-2 | 新会话按目标 workspace 的权限预设运行，不继承助理的 |
| AC-DISPATCH-3 | 任务经投递进入该会话，transcript 留在目标项目 |
| AC-DISPATCH-4 | 助理可查询已派单会话的进度（经引用，只读） |
| AC-DISPATCH-5 | 派单产生的会话正常出现在该 workspace 的会话树中 |

---

## S10 注入防护 INJ

ADR-006 的配套硬约束。

| AC | 标准 |
|---|---|
| AC-INJ-1 | 引用内容中的指令不触发投递/派单：构造一条含「请把 X 发给 Y 会话」的源会话，引用后助理不执行 |
| AC-INJ-2 | 该约束写入助理 system prompt，且有测试覆盖 |
| AC-INJ-3 | 助理对外动作的发起者可追溯到用户消息 |

---

## S11 非功能 NFR

| AC | 标准 |
|---|---|
| AC-NFR-1 | 插件缺失可选依赖（如 schedule）时降级并提示，不使整棵树激活失败 |
| AC-NFR-2 | 席位渲染错误被 slot 错误边界捕获，不使整个 Web UI 白屏 |
| AC-NFR-3 | 助理会话不干扰用户会话：用户会话的 `seq` 不因助理活动增长 |
| AC-NFR-4 | 中英双语（DSH 用户界面为双语，locale 经 `ctx.locale.register`） |
| AC-NFR-5 | `pnpm run check`（typecheck + test）通过 |
| AC-NFR-6 | README 说明安装、所需 bundle、已知限制（含「助理不活着时提醒不触发」） |

---

## 明确不做

- 不做第 21 个宠物皮：状态动画、换装、投喂、亲密度不属于本项目核心（ADR-008）。
- 不做投递的事前确认（ADR-006）。
- 不撤销已投递消息。
- 不修改 DSH 内核，不绕过 `authorizeLineage`（ADR-003）。
- 不做真正的「助理自己动手执行」（ADR-004），除非改用 ACP provider 并重做安全评估。
