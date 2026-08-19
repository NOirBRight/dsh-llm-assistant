/** Browser half: 一个 shell.overlay 条目 —— 助理的席位。 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import { AssistantController } from './controller.ts'
import { AssistantSeat, type AssistantLocaleFace } from './AssistantSeat.tsx'
import { ensureAssistantStyles } from './css.ts'

export const name = 'dsh-llm-assistant-client'
export const inject = ['slots', 'layout', 'connection', 'locale']

export function apply(ctx: ClientContext): void {
  ensureAssistantStyles()

  const controller = new AssistantController(ctx)
  const locale = (ctx as unknown as { readonly locale: AssistantLocaleFace }).locale

  // shell.overlay 是 ui-layout 声明的 list slot（scope: 'root'）：条目并存而非互相遮蔽，
  // 且不随会话切换重建 —— 这正是常驻助理需要的（AC-SEAT-4）。绝不要注册到 'root'。
  // 面板打开状态留在组件里（root scope，不随会话切换重建），不存进 session-scoped store。
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'llm-assistant-seat',
    order: 60,
    inject: () => ({ controller, locale }),
  }, AssistantSeat))
}
