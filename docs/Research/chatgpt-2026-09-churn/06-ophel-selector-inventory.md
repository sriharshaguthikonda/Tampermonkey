# ophel selector inventory (2026-09 chatgpt.com churn)

ophel is GPL-3.0-only and was inventoried read-only under plan S6.2 (no git writes, no edits to any file under `C:/Windows_software/Chrome_extensions/ophel`). These are the pre-September chatgpt.com selectors still present in `src/`. This is inventory only: there is no PR and no edits to ophel. The first command matched **75** lines across **10** files (`git grep -nE` over `src/adapters/chatgpt.ts src/adapters/base.ts src/core src/hooks src/utils src/constants src/platform src/tabs`).

## chatgpt.com adapter and shared code

### src/adapters/base.ts
| line | selector (verbatim) | pack v2 anchor | note |
| --- | --- | --- | --- |
| 1973 | `button, a, [role='button'], [tabindex], md-icon-button, ms-stop-button` | none | generic clickable-target resolver in the shared base adapter; `ms-stop-button` is another site's custom element, not chatgpt.com markup |
| 1979 | `button, a, [role='button'], [tabindex], md-icon-button, ms-stop-button` | none | same shared resolver (`closest` fallback); cross-site, not chatgpt.com |

### src/adapters/chatgpt.ts
| line | selector (verbatim) | pack v2 anchor | note |
| --- | --- | --- | --- |
| 150 | `.markdown.markdown-new-styling` | assistantMarkdownRoot | codex task reply body; `.markdown` target |
| 165 | `div:has(> .ProseMirror.markdown.prose)` | assistantMarkdownRoot | library editor prose/markdown container (shell width measure) |
| 178 | `data-testid="conversation-turn-N"` | exchangeRoot | comment/docstring; sort key read from conversation-turn-N |
| 1022 | `[data-message-author-role="assistant"]` | assistantUnit | comment; assistant message container |
| 1023 | `[data-message-author-role="assistant"]` | assistantUnit | query all assistant messages in a container |
| 1028 | `.markdown, .prose, [class*='prose']` | assistantMarkdownRoot | reply body fallback chain |
| 1143 | `[data-message-author-role="assistant"] p` | assistantUnit | assistant paragraph selector |
| 1149 | `[data-message-author-role="assistant"]` | assistantUnit | closest assistant container |
| 1155 | `[data-message-author-role="assistant"]` | assistantUnit | assistant container reference |
| 1168 | `#prompt-textarea` | composer | composer input; also `textarea[data-id="root"]` and `[contenteditable="true"]` fallbacks |
| 1173 | `[data-testid="send-button"]` | sendButton | send button testid |
| 1182 | `prompt-textarea` | composer | identity check `element.id === "prompt-textarea"` (composer detection), not a query selector |
| 1277 | `[data-message-author-role="assistant"]` | assistantUnit | assistant response selector |
| 1278 | `[data-message-author-role="user"]` | userUnit | user message selector |
| 1279 | `.markdown` | assistantMarkdownRoot | reply body markdown container |
| 1287 | `[data-message-author-role="user"], ${CHATGPT_CODEX_TASK_USER_QUERY_SELECTOR}` | userUnit | user query; also codex user-query fallback |
| 1290 | `[data-message-author-role="user"]` | userUnit | user message selector |
| 1495 | `[data-message-author-role="user"]` | userUnit | `userQuerySelector` config value |
| 1496 | `[data-message-author-role="assistant"]` | assistantUnit | `assistantResponseSelector` config value |
| 1569 | `section[data-turn]`, `conversation-turn-N` | exchangeRoot | comment/docstring; off-screen turn shell markup |
| 1571 | `[data-message-author-role]` | assistantUnit, userUnit | comment; role-agnostic (any author role) - counts toward both roles |
| 1576 | `conversation-turn-N` | exchangeRoot | comment; sort by conversation-turn-N |
| 1586 | `conversation-turn-N` | exchangeRoot | comment; fallback sort key when a turn lacks N |
| 1616 | `conversation-turn-N` | exchangeRoot | comment; first-pass scroll order |
| 1671 | `conversation-turn-N` | exchangeRoot | comment; turn ordering |
| 1681 | `conversation-turn-N` | exchangeRoot | JSDoc; list turns in conversation-turn-N order |
| 1687 | `section[data-turn], [data-testid^="conversation-turn"]` | exchangeRoot | query all turn shells |
| 1705 | `[data-message-author-role]` | assistantUnit, userUnit | role-agnostic; detects any mounted message in a turn |
| 1780 | `[data-message-author-role="user"]` | userUnit | per-turn user messages |
| 1810 | `[data-message-author-role="assistant"]` | assistantUnit | per-turn assistant messages |
| 1860 | `[data-message-author-role="user"], [data-message-author-role="assistant"]` | assistantUnit, userUnit | combined; extreme export fallback selects both roles |
| 1883 | `section[data-turn]`, `conversation-turn-N` | exchangeRoot | comment/docstring; new turn structure markup |
| 1888 | `section[data-turn], [data-testid^="conversation-turn"]` | exchangeRoot | query turn shells (new structure) |
| 1905 | `[data-message-author-role="assistant"]` | assistantUnit | comment; multiple assistant nodes per turn |
| 1950 | `data-message-author-role` | assistantUnit, userUnit | reads the role attribute value (role-agnostic) |
| 2023 | `[data-message-author-role="user"], [data-message-author-role="assistant"]` | assistantUnit, userUnit | combined; collects all author-role messages for a turn |
| 2030 | `section[data-turn], [data-testid^="conversation-turn"]` | exchangeRoot | closest turn shell |
| 2041 | `data-message-author-role === "assistant"` | assistantUnit | checks role equals assistant |
| 2061 | `conversation-turn-N` | exchangeRoot | comment; stable sort key from parent chain |
| 2063 | `section[data-turn], [data-testid^="conversation-turn"]` | exchangeRoot | turn shell selector used as sort key |
| 2079 | `.markdown, .prose` | assistantMarkdownRoot | comment; prefer markdown/prose container |
| 2081 | `.markdown, .prose, [class*='prose']` | assistantMarkdownRoot | reply body fallback chain |
| 2131 | `[data-message-author-role]` | assistantUnit, userUnit | closest any-author-role message (role-agnostic) |
| 2301 | `conversation-turn-N` | exchangeRoot | JSDoc; one conversation-turn-N per turn |
| 2311 | `/^conversation-turn-(\d+)/` | exchangeRoot | regex extracts N from data-testid for sort key |
| 3268 | `[data-message-author-role="assistant"]` | assistantUnit | query all assistant messages |
| 3319 | `.markdown, .prose, [class*='prose']` | assistantMarkdownRoot | reply body markdown container |
| 3598 | `[data-testid="stop-button"]` | stopButton | stop button testid |

### src/constants/ui.ts
| line | selector (verbatim) | pack v2 anchor | note |
| --- | --- | --- | --- |
| 273 | `content.markdownFix`, `gemini-markdown-fix` | none | settings key + value string, not a DOM selector; markdownFix is a cross-site feature flag |
| 283 | `aistudio.markdownFix`, `aistudio-markdown-fix` | none | settings key + value string, not a DOM selector; cross-site feature flag |
| 284 | `chatgpt.markdownFix`, `chatgpt-markdown-fix` | none | settings key + value string for the chatgpt markdownFix flag; not a DOM selector |

### src/core/modules-init.ts
| line | selector (verbatim) | pack v2 anchor | note |
| --- | --- | --- | --- |
| 226 | `settings.content?.markdownFix` | none | reads cross-site content.markdownFix feature flag; not a selector |
| 228 | `settings.aistudio?.markdownFix` | none | reads aistudio feature flag; generic, not chatgpt.com markup |
| 230 | `settings.chatgpt?.markdownFix` | none | reads chatgpt markdownFix feature flag; a toggle, not a DOM selector |
| 245 | `modules.markdownFixer` | none | MarkdownFixer module instance name; generic cross-site feature |
| 246 | `modules.markdownFixer.start()` | none | MarkdownFixer start call; generic feature lifecycle |
| 530 | `modules.markdownFixer` | none | MarkdownFixer presence check; generic feature lifecycle |
| 531 | `modules.markdownFixer` | none | MarkdownFixer instantiation; generic feature lifecycle |
| 533 | `modules.markdownFixer` | none | MarkdownFixer start call; generic feature lifecycle |
| 535 | `modules.markdownFixer?.stop()` | none | MarkdownFixer stop call; generic feature lifecycle |

### src/hooks/useShortcuts.ts
| line | selector (verbatim) | pack v2 anchor | note |
| --- | --- | --- | --- |
| 551 | `[data-testid="stop-button"]` | none | generic multi-site stop fallback for Alt+K; array targets many sites, not chatgpt.com-specific |
| 554 | `.stop-button` | none | generic multi-site stop fallback for Alt+K; cross-site last-resort selector |

### src/platform/userscript/entry.tsx
| line | selector (verbatim) | pack v2 anchor | note |
| --- | --- | --- | --- |
| 140 | `USERSCRIPT_RESOURCE_DEFINITIONS.markdownPreviewStyles.metaName` | none | platform resource-definition name for markdown preview styles; generic, not a chatgpt.com selector |

### src/platform/userscript/resource-manifest.ts
| line | selector (verbatim) | pack v2 anchor | note |
| --- | --- | --- | --- |
| 31 | `ophel.markdown-preview.css` | none | CSS resource file name; generic platform asset, not a DOM selector |

### src/tabs/options/pages/SiteSettingsPage.tsx
| line | selector (verbatim) | pack v2 anchor | note |
| --- | --- | --- | --- |
| 378 | `settings.content?.markdownFix` | none | settings toggle UI for cross-site content.markdownFix; not a selector |
| 380 | `updateNestedSetting("content", "markdownFix", ...)` | none | settings update call for a feature flag; not a selector |
| 589 | `settings.aistudio?.markdownFix` | none | settings toggle UI for cross-site aistudio flag; not a selector |
| 594 | `markdownFix: !settings.aistudio?.markdownFix` | none | settings value write for a feature flag; not a selector |
| 612 | `settings.chatgpt?.markdownFix` | none | settings toggle UI for the chatgpt markdownFix flag; not a DOM selector |
| 617 | `markdownFix: !settings.chatgpt?.markdownFix` | none | settings value write for a feature flag; not a selector |

### src/utils/exporter.ts
| line | selector (verbatim) | pack v2 anchor | note |
| --- | --- | --- | --- |
| 970 | `input.markdownFilename`, `conversation.md` | none | exporter input field name and literal string; not a DOM selector |
| 976 | `input.markdownContent` | none | exporter input field; not a selector |

### src/utils/settings-normalize.ts
| line | selector (verbatim) | pack v2 anchor | note |
| --- | --- | --- | --- |
| 239 | `contentSettings?.markdownFix`, `defaults.markdownFix` | none | settings normalization for cross-site markdownFix flag; not a selector |

## Other site adapters (not chatgpt.com)
| file | hits |
| --- | --- |
| src/adapters/aistudio.ts | 3 |
| src/adapters/chatglm.ts | 9 |
| src/adapters/claude.ts | 1 |
| src/adapters/gemini-enterprise.ts | 12 |
| src/adapters/gemini.ts | 5 |
| src/adapters/kimi.ts | 13 |
| src/adapters/qianwen.ts | 1 |
| src/adapters/qwen-studio.ts | 4 |
| src/adapters/zai.ts | 9 |

Not affected by the chatgpt.com churn; listed for completeness.

## Summary
| pack v2 anchor | hit count |
| --- | --- |
| exchangeRoot | 15 |
| assistantMarkdownRoot | 7 |
| assistantUnit | 17 |
| userUnit | 11 |
| composer | 2 |
| sendButton | 1 |
| stopButton | 1 |
| codeBlock | 0 |
| responseActionBar | 0 |
| editMessageButton | 0 |
| copyResponseButton | 0 |
| composerForm | 0 |
| pendingComposerInput | 0 |
| editSurfaceForm | 0 |

The six `[data-message-author-role]` rows that are combined or role-agnostic (lines 1571, 1705, 1860, 1950, 2023, 2131) are counted under both `userUnit` and `assistantUnit`, so the two role totals overlap. The zero-hit anchors have no matching pre-September selector in `src/`.

## Status
verified: 2026-09-22 (git grep of ophel src at f1b0ae5 chore(repo-map): refresh manifest)
recheck_after: next chatgpt.com churn or ophel upstream sync