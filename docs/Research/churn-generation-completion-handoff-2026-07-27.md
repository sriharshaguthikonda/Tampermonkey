# Generation-completion handoff (2026-07-27)

Scope: evidence only for the active churn-engine session. No implementation is included here.

## Reusable upstream evidence

- Ophel's ChatGPT adapter treats a *visible* Stop control as the primary generation signal: [`chatgpt.ts:3592-3603`](../../../Chrome_extensions/ophel/src/adapters/chatgpt.ts#L3592-L3603).
- Its manager records that signal, polls at 150 ms after the first check, completes only after the signal disappears, and resets an unstarted DOM-tracked generation after 30 seconds: [`tab-manager.ts:640-692`](../../../Chrome_extensions/ophel/src/core/tab-manager.ts#L640-L692).
- Thinking-mode network completion is only a handoff; completion waits for Stop to appear and disappear: [`tab-manager.ts:820-825`](../../../Chrome_extensions/ophel/src/core/tab-manager.ts#L820-L825). Final state transition is centralized at [`tab-manager.ts:844-873`](../../../Chrome_extensions/ophel/src/core/tab-manager.ts#L844-L873).
- Ophel's queue wait already provides the bounded fallback shape: activity signature plus generation state, 500-ms probes, minimum/quiet gates, and a caught failure path: [`queue-dispatcher.ts:279-343`](../../../Chrome_extensions/ophel/src/core/queue-dispatcher.ts#L279-L343).

## Ordered recommendation

1. Reuse the existing role-resolver metadata (`selector`, `source`, `visible`, `matchedCount`) as the evidence surface; do not introduce a parallel selector result type.
2. Make **Stop observed, then disappeared** the primary completion transition. Do not complete merely because Stop is absent at submit time.
3. Use response/action activity only as a bounded fallback when the primary signal cannot be resolved.
4. Emit bounded diagnostics for unresolved, never-started, timeout, and fallback-completed paths; include resolver source/counts, never page text.

This is deliberately a handoff, not a replacement for the framework acceptance gates in [`01-ROADMAP.md`](../plans/churn-resistant-framework/01-ROADMAP.md).
