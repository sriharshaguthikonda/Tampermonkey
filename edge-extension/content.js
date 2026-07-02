// Content script for ChatGPT TTS Reader
// Diagnostic build: safer startup, guarded keyboard handling, single runtime listener.

(() => {
    'use strict';

    const LOG_PREFIX = '[ChatGPT TTS Reader]';
    const DEBUG_STORAGE_KEY = 'chatgptTtsDebug';

    function debugEnabled() {
        try { return localStorage.getItem(DEBUG_STORAGE_KEY) !== 'false'; }
        catch (_) { return true; }
    }

    function log(level, message, details = {}) {
        if (!debugEnabled() && level !== 'warn' && level !== 'error') return;
        const logger = console[level] || console.log;
        try {
            logger.call(console, LOG_PREFIX, message, {
                ts: new Date().toISOString(),
                url: location.href,
                readyState: document.readyState,
                ...details
            });
        } catch (_) {
            console.log(LOG_PREFIX, message);
        }
    }

    function activeElementInfo() {
        const el = document.activeElement;
        if (!el) return null;
        return {
            tagName: el.tagName,
            id: el.id || '',
            role: el.getAttribute?.('role') || '',
            isContentEditable: !!el.isContentEditable,
            className: typeof el.className === 'string' ? el.className.slice(0, 120) : ''
        };
    }

    function sendRuntimeMessage(message) {
        try {
            if (!chrome?.runtime?.id) {
                log('warn', 'Cannot send runtime message because chrome.runtime is unavailable', { message });
                return;
            }
            chrome.runtime.sendMessage(message, () => {
                if (chrome.runtime.lastError) {
                    log('debug', 'Runtime message had no receiver or failed', {
                        error: chrome.runtime.lastError.message,
                        message
                    });
                }
            });
        } catch (error) {
            log('warn', 'Runtime message send threw', { error: error?.message, message });
        }
    }

    class TTSReader {
        constructor() {
            this.speechSynthesis = window.speechSynthesis;
            this.ttsActive = false;
            this.isPaused = false;
            this.continuousReadingActive = false;
            this.pageFullyLoaded = false;
            this.paragraphsList = [];
            this.currentParagraph = null;
            this.currentParagraphIndex = 0;
            this.currentSentences = [];
            this.currentSentenceIndex = 0;
            this.currentUtterance = null;
            this.pointerEl = null;
            this.pointerLoopId = null;
            this.uiContainer = null;
            this.messageListenerRegistered = false;
            this.processedParagraph = { element: null, originalHTML: '' };

            this.CONFIG = {
                CANDIDATE_SELECTORS: 'p, li, h1, h2, h3, h4, h5, h6, td, th, .markdown, div[class*="content"], article',
                IGNORE_SELECTORS: 'nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"], [data-message-author-role="user"], pre, code, [class*="code"], [class*="language-"], [class*="highlight"], .token, #thread-bottom-container, #tts-controls-container, #tts-pointer',
                MIN_TEXT_LENGTH: 10,
                SPEECH_RATE: 1.3,
                HOTKEYS: {
                    ACTIVATE: 'U',
                    PAUSE_RESUME: 'P',
                    NAV_NEXT: 'ArrowRight',
                    NAV_PREV: 'ArrowLeft',
                    STOP: 'Escape'
                },
                EMOJI_REGEX: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/ug
            };

            log('info', 'Reader constructed', {
                hasSpeechSynthesis: !!this.speechSynthesis,
                activeElement: activeElementInfo()
            });
        }

        async init() {
            try {
                log('info', 'Initialising content script', this.getDiagnostics());
                await this.waitForPageLoad();
                this.createUI();
                this.setupKeyboardListener();
                this.setupRuntimeMessageListener();
                await this.loadVoices();
                log('info', 'Reader initialised', this.getDiagnostics());
            } catch (error) {
                log('error', 'Reader initialisation failed', {
                    error: error?.message,
                    stack: error?.stack
                });
            }
        }

        waitForPageLoad() {
            return new Promise(resolve => {
                let done = false;
                const finish = reason => {
                    if (done) return;
                    done = true;
                    this.pageFullyLoaded = true;
                    log('info', 'Page-load wait finished', { reason });
                    resolve();
                };

                if (document.readyState === 'complete') {
                    setTimeout(() => finish('document already complete'), 500);
                    return;
                }

                window.addEventListener('load', () => {
                    setTimeout(() => finish('window load event'), 1000);
                }, { once: true });

                // Important for troubleshooting: do not wait forever if ChatGPT load is stuck.
                setTimeout(() => finish('timeout fallback'), 4000);
            });
        }

        createUI() {
            if (!document.body) {
                log('warn', 'document.body missing during UI creation; retrying');
                setTimeout(() => this.createUI(), 250);
                return;
            }

            const existing = document.getElementById('tts-controls-container');
            if (existing) {
                this.uiContainer = existing;
                log('warn', 'TTS UI already exists; avoiding duplicate');
                return;
            }

            this.uiContainer = document.createElement('div');
            this.uiContainer.id = 'tts-controls-container';
            this.uiContainer.setAttribute('aria-hidden', 'true');
            this.uiContainer.style.position = 'fixed';
            this.uiContainer.style.bottom = '20px';
            this.uiContainer.style.right = '20px';
            this.uiContainer.style.zIndex = '10000';
            this.uiContainer.style.display = 'none';
            document.body.appendChild(this.uiContainer);

            log('info', 'TTS UI created', { bodyChildCount: document.body.children.length });
        }

        setupKeyboardListener() {
            document.addEventListener('keydown', event => {
                if (this.isEditableTarget(event.target)) return;

                const key = event.key;
                const combo = event.ctrlKey && event.shiftKey;
                const HOTKEYS = this.CONFIG.HOTKEYS;

                // Safer: activation and pause/resume need Ctrl+Shift.
                // This avoids hijacking normal ChatGPT page keys while the extension is merely enabled.
                if (combo && key.toUpperCase() === HOTKEYS.ACTIVATE) {
                    event.preventDefault();
                    log('info', 'Activation hotkey pressed', { activeElement: activeElementInfo() });

                    if (this.ttsActive) {
                        this.stopTTS();
                        return;
                    }

                    document.body.style.cursor = 'crosshair';
                    document.addEventListener('click', clickEvent => {
                        clickEvent.preventDefault();
                        clickEvent.stopPropagation();
                        document.body.style.cursor = '';
                        log('info', 'Crosshair click captured', {
                            x: clickEvent.clientX,
                            y: clickEvent.clientY,
                            targetTag: clickEvent.target?.tagName
                        });
                        this.startReadingOnClick(clickEvent);
                    }, { once: true, capture: true });
                    return;
                }

                if (combo && key.toUpperCase() === HOTKEYS.PAUSE_RESUME) {
                    event.preventDefault();
                    log('info', 'Pause/resume hotkey pressed');
                    this.pauseResumeTTS();
                    return;
                }

                if (!this.shouldHandleNavigationKey(key)) return;

                switch (key) {
                    case HOTKEYS.STOP:
                        event.preventDefault();
                        this.stopTTS();
                        break;
                    case HOTKEYS.NAV_NEXT:
                        event.preventDefault();
                        this.navigate('next');
                        break;
                    case HOTKEYS.NAV_PREV:
                        event.preventDefault();
                        this.navigate('prev');
                        break;
                }
            }, { passive: false });

            log('info', 'Keyboard listener registered');
        }

        isEditableTarget(target) {
            if (!target) return false;
            const editable = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                !!target.closest?.('[contenteditable="true"], textarea, input, [role="textbox"]');

            if (editable) {
                log('debug', 'Ignored keyboard event from editable target', {
                    targetTag: target.tagName,
                    activeElement: activeElementInfo()
                });
            }

            return editable;
        }

        shouldHandleNavigationKey(key) {
            const HOTKEYS = this.CONFIG.HOTKEYS;
            const navigationKey = key === HOTKEYS.NAV_NEXT || key === HOTKEYS.NAV_PREV || key === HOTKEYS.STOP;
            if (!navigationKey) return false;

            const active = this.ttsActive ||
                this.isPaused ||
                this.continuousReadingActive ||
                !!this.currentParagraph ||
                this.paragraphsList.length > 0;

            if (!active) {
                log('debug', 'Ignored navigation key because reader is inactive', { key });
            }

            return active;
        }

        setupRuntimeMessageListener() {
            if (this.messageListenerRegistered) {
                log('warn', 'Runtime listener already registered; skipping duplicate');
                return;
            }

            if (!chrome?.runtime?.onMessage) {
                log('warn', 'chrome.runtime.onMessage is unavailable');
                return;
            }

            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                log('info', 'Runtime message received', {
                    action: message?.action,
                    senderId: sender?.id || '',
                    senderUrl: sender?.url || ''
                });

                try {
                    switch (message.action) {
                        case 'startReading':
                            this.startReadingFromCursor();
                            sendResponse?.({ ok: true, ...this.getState() });
                            return true;
                        case 'pauseResume':
                            this.pauseResumeTTS();
                            sendResponse?.({ ok: true, ...this.getState() });
                            return true;
                        case 'stopReading':
                            this.stopTTS();
                            sendResponse?.({ ok: true, ...this.getState() });
                            return true;
                        case 'navigate':
                            this.navigate(message.direction);
                            sendResponse?.({ ok: true, ...this.getState() });
                            return true;
                        case 'setRate':
                            this.setSpeechRate(message.rate);
                            sendResponse?.({ ok: true, rate: this.CONFIG.SPEECH_RATE });
                            return true;
                        case 'getState':
                            sendResponse?.(this.getState());
                            return true;
                        case 'getDiagnostics':
                            sendResponse?.(this.getDiagnostics());
                            return true;
                        default:
                            log('warn', 'Unknown runtime action', { message });
                            sendResponse?.({ ok: false, error: 'Unknown action' });
                            return true;
                    }
                } catch (error) {
                    log('error', 'Runtime message handler failed', {
                        action: message?.action,
                        error: error?.message,
                        stack: error?.stack
                    });
                    sendResponse?.({ ok: false, error: error?.message || String(error) });
                    return true;
                }
            });

            this.messageListenerRegistered = true;
            log('info', 'Runtime message listener registered');
        }

        loadVoices() {
            return new Promise(resolve => {
                if (!this.speechSynthesis) {
                    log('warn', 'Speech synthesis is unavailable');
                    resolve([]);
                    return;
                }

                const voices = this.speechSynthesis.getVoices();
                if (voices.length) {
                    log('info', 'Voices loaded immediately', {
                        count: voices.length,
                        firstVoices: voices.slice(0, 5).map(v => `${v.name} (${v.lang})`)
                    });
                    resolve(voices);
                    return;
                }

                log('info', 'Waiting for voiceschanged event');
                this.speechSynthesis.onvoiceschanged = () => {
                    const loaded = this.speechSynthesis.getVoices();
                    log('info', 'Voices loaded after voiceschanged', { count: loaded.length });
                    resolve(loaded);
                };

                setTimeout(() => {
                    const fallback = this.speechSynthesis.getVoices();
                    log('warn', 'Voice load timeout fallback', { count: fallback.length });
                    resolve(fallback);
                }, 5000);
            });
        }

        startReadingFromCursor() {
            log('info', 'startReadingFromCursor called', this.getState());

            if (this.ttsActive && !this.isPaused) {
                log('debug', 'Start ignored because TTS is already active');
                return;
            }

            if (this.isPaused) {
                this.pauseResumeTTS();
                return;
            }

            const paragraphs = this.findAllParagraphs();
            if (!paragraphs.length) {
                log('warn', 'No readable content found');
                return;
            }

            this.currentParagraphIndex = 0;
            this.continuousReadingActive = true;
            this.readParagraph(paragraphs[0], 0);
        }

        startReadingOnClick(event) {
            this.stopTTS(false);
            this.paragraphsList = this.findAllParagraphs();

            let startIndex = -1;
            const containing = this.paragraphsList.find(p => p.element.contains(event.target));
            if (containing) {
                startIndex = this.paragraphsList.indexOf(containing);
            } else {
                const clickY = event.clientY;
                for (let i = 0; i < this.paragraphsList.length; i++) {
                    if (this.paragraphsList[i].element.getBoundingClientRect().top > clickY) {
                        startIndex = i;
                        break;
                    }
                }
            }

            log('info', 'Resolved click start position', {
                startIndex,
                paragraphCount: this.paragraphsList.length,
                targetTag: event.target?.tagName
            });

            if (startIndex !== -1) {
                this.currentParagraphIndex = startIndex;
                this.continuousReadingActive = true;
                this.readParagraph(this.paragraphsList[startIndex], 0);
            } else {
                log('warn', 'No readable text found at or below click');
            }
        }

        readParagraph(paragraph, startSentence = 0, autoStart = true) {
            if (!paragraph?.element) {
                log('warn', 'readParagraph called with invalid paragraph', { paragraph });
                return;
            }

            this.restoreProcessedParagraph();

            const text = this.getTextFromElement(paragraph.element);
            if (!text) {
                log('warn', 'Selected paragraph has no readable text', {
                    tagName: paragraph.element.tagName
                });
                return;
            }

            this.currentParagraph = paragraph;
            this.currentSentences = this.splitIntoSentences(text);
            this.currentSentenceIndex = startSentence;

            log('info', 'Paragraph prepared for reading', {
                paragraphIndex: this.currentParagraphIndex,
                textLength: text.length,
                sentenceCount: this.currentSentences.length,
                startSentence,
                autoStart,
                tagName: paragraph.element.tagName
            });

            if (autoStart) this.readCurrentSentence();
        }

        readCurrentSentence() {
            if (!this.currentSentences.length) {
                log('warn', 'readCurrentSentence called without current sentences');
                return;
            }

            const sentenceInfo = this.currentSentences[this.currentSentenceIndex];
            if (!sentenceInfo?.text) {
                log('warn', 'Current sentence is empty', { currentSentenceIndex: this.currentSentenceIndex });
                return;
            }

            const utterance = new SpeechSynthesisUtterance(sentenceInfo.text);
            utterance.rate = this.CONFIG.SPEECH_RATE;

            this.currentUtterance = utterance;
            this.ttsActive = true;
            this.isPaused = false;
            this.notifyState();

            log('info', 'Speaking sentence', {
                paragraphIndex: this.currentParagraphIndex,
                sentenceIndex: this.currentSentenceIndex,
                sentenceCount: this.currentSentences.length,
                textLength: sentenceInfo.text.length,
                rate: utterance.rate
            });

            utterance.onboundary = event => {
                if (event.name === 'word' && event.charIndex >= 0) {
                    this.highlightCurrentWord({
                        charIndex: sentenceInfo.start + event.charIndex,
                        charLength: event.charLength
                    }, this.currentParagraph.element);
                }
            };

            utterance.onend = () => {
                log('info', 'Sentence speech ended', {
                    paragraphIndex: this.currentParagraphIndex,
                    sentenceIndex: this.currentSentenceIndex,
                    continuousReadingActive: this.continuousReadingActive
                });
                this.ttsActive = false;
                this.currentUtterance = null;
                this.hidePointerArrow();
                this.notifyState();

                if (this.continuousReadingActive) this.moveToNextSentence();
            };

            utterance.onerror = event => {
                log('error', 'TTS utterance error', {
                    error: event?.error,
                    message: event?.message,
                    paragraphIndex: this.currentParagraphIndex,
                    sentenceIndex: this.currentSentenceIndex
                });
                this.ttsActive = false;
                this.currentUtterance = null;
                this.notifyState();
            };

            try {
                window.speechSynthesis.speak(utterance);
                this.updatePointerArrow();
            } catch (error) {
                log('error', 'speechSynthesis.speak threw', {
                    error: error?.message,
                    stack: error?.stack
                });
                this.ttsActive = false;
                this.currentUtterance = null;
                this.notifyState();
            }
        }

        moveToNextSentence() {
            if (this.currentSentenceIndex < this.currentSentences.length - 1) {
                this.currentSentenceIndex++;
                this.readCurrentSentence();
            } else if (this.paragraphsList.length > this.currentParagraphIndex + 1) {
                this.currentParagraphIndex++;
                this.readParagraph(this.paragraphsList[this.currentParagraphIndex], 0);
            } else {
                log('info', 'Reached end of readable content');
                this.continuousReadingActive = false;
                this.notifyState();
            }
        }

        pauseResumeTTS() {
            if (!this.ttsActive && !this.isPaused) {
                log('debug', 'Pause/resume ignored because TTS is inactive');
                return;
            }

            if (this.isPaused) {
                window.speechSynthesis.resume();
                this.isPaused = false;
                this.ttsActive = true;
                log('info', 'TTS resumed');
            } else {
                window.speechSynthesis.pause();
                this.isPaused = true;
                log('info', 'TTS paused');
            }

            this.notifyState();
        }

        stopTTS(notify = true) {
            log('info', 'stopTTS called', {
                notify,
                hadCurrentUtterance: !!this.currentUtterance,
                wasActive: this.ttsActive,
                wasPaused: this.isPaused
            });

            if (this.currentUtterance || window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                window.speechSynthesis.cancel();
                this.currentUtterance = null;
            }

            this.ttsActive = false;
            this.isPaused = false;
            this.continuousReadingActive = false;
            this.restoreProcessedParagraph();
            this.clearHighlights();
            this.hidePointerArrow();
            this.notifyState();
        }

        navigate(direction) {
            log('info', 'Navigation requested', { direction, state: this.getState() });

            if (!this.paragraphsList.length) {
                log('warn', 'Navigation ignored because paragraph list is empty');
                return;
            }

            this.stopTTS(false);
            this.continuousReadingActive = true;

            if (direction === 'next') {
                if (this.currentSentenceIndex < this.currentSentences.length - 1) {
                    this.currentSentenceIndex++;
                    this.readCurrentSentence();
                } else if (this.currentParagraphIndex < this.paragraphsList.length - 1) {
                    this.currentParagraphIndex++;
                    this.readParagraph(this.paragraphsList[this.currentParagraphIndex], 0);
                } else {
                    log('info', 'Navigation next reached end');
                    this.continuousReadingActive = false;
                }
            } else {
                if (this.currentSentenceIndex > 0) {
                    this.currentSentenceIndex--;
                    this.readCurrentSentence();
                } else if (this.currentParagraphIndex > 0) {
                    this.currentParagraphIndex--;
                    this.readParagraph(this.paragraphsList[this.currentParagraphIndex], 0, false);
                    this.currentSentenceIndex = this.currentSentences.length - 1;
                    this.readCurrentSentence();
                } else {
                    log('info', 'Navigation previous reached start');
                    this.continuousReadingActive = false;
                }
            }

            this.notifyState();
        }

        getTextFromElement(element) {
            if (!element) return '';

            const clone = element.cloneNode(true);
            const blocked = clone.querySelectorAll('button, a, input, textarea, select, [aria-hidden="true"], pre, code, .tts-hidden-emoji, .tts-highlight');
            blocked.forEach(node => node.remove());

            const walker = document.createTreeWalker(
                clone,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: node => node.parentElement?.getAttribute('aria-hidden') === 'true'
                        ? NodeFilter.FILTER_REJECT
                        : NodeFilter.FILTER_ACCEPT
                },
                false
            );

            let text = '';
            while (walker.nextNode()) text += walker.currentNode.textContent;

            return text
                .replace(this.CONFIG.EMOJI_REGEX, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        findAllParagraphs() {
            this.paragraphsList = [];

            const elements = document.querySelectorAll(this.CONFIG.CANDIDATE_SELECTORS);
            elements.forEach((element, index) => {
                if (element.closest(this.CONFIG.IGNORE_SELECTORS)) return;
                if (!this.isVisibleElement(element)) return;

                const text = this.getTextFromElement(element);
                if (text.length < this.CONFIG.MIN_TEXT_LENGTH) return;

                this.paragraphsList.push({ element, text, index });
            });

            log('info', 'Readable paragraph scan completed', {
                candidateCount: elements.length,
                paragraphCount: this.paragraphsList.length
            });

            return this.paragraphsList;
        }

        isVisibleElement(element) {
            if (!element || element.offsetParent === null) return false;
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }

        highlightCurrentWord(event, container) {
            if (!container || typeof event.charIndex !== 'number' || typeof event.charLength !== 'number') return;

            this.clearHighlights();

            const info = this.findTextNode(container, event.charIndex);
            if (!info) {
                log('debug', 'No text node found for highlight index', event);
                return;
            }

            const { node, startIndex } = info;
            const startOffset = event.charIndex - startIndex;
            const endOffset = Math.min(startOffset + event.charLength, node.textContent.length);

            if (event.charLength <= 0 || startOffset < 0 || endOffset > node.textContent.length || startOffset >= endOffset) {
                log('warn', 'Highlight offset out of range', {
                    ...event,
                    startOffset,
                    endOffset,
                    nodeLength: node.textContent.length
                });
                return;
            }

            try {
                if (!this.processedParagraph.element) {
                    this.processedParagraph.element = container;
                    this.processedParagraph.originalHTML = container.innerHTML;
                }

                const range = document.createRange();
                range.setStart(node, startOffset);
                range.setEnd(node, endOffset);

                const highlightSpan = document.createElement('span');
                highlightSpan.className = 'tts-highlight';
                highlightSpan.setAttribute('aria-hidden', 'true');
                highlightSpan.textContent = range.toString();

                range.deleteContents();
                range.insertNode(highlightSpan);
                container.normalize();

                const rect = highlightSpan.getBoundingClientRect();
                if (rect.top < 0 || rect.bottom > window.innerHeight) {
                    highlightSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } catch (error) {
                log('error', 'Error highlighting word', {
                    error: error?.message,
                    stack: error?.stack,
                    ...event
                });
            }
        }

        findTextNode(element, charIndex) {
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: node => node.parentElement?.getAttribute('aria-hidden') === 'true'
                        ? NodeFilter.FILTER_REJECT
                        : NodeFilter.FILTER_ACCEPT
                },
                false
            );

            let currentIndex = 0;
            let node;
            while ((node = walker.nextNode())) {
                const nodeLength = node.textContent.length;
                if (currentIndex + nodeLength > charIndex) return { node, startIndex: currentIndex };
                currentIndex += nodeLength;
            }
            return null;
        }

        splitIntoSentences(text) {
            const regex = /[^.!?]+[.!?]+\s*/g;
            const sentences = [];
            let match;
            let index = 0;

            while ((match = regex.exec(text)) !== null) {
                const sentenceText = match[0].trim();
                if (sentenceText) sentences.push({ text: sentenceText, start: match.index });
                index = regex.lastIndex;
            }

            if (index < text.length) {
                const tail = text.slice(index).trim();
                if (tail) sentences.push({ text: tail, start: index });
            }

            log('debug', 'Text split into sentences', { textLength: text.length, sentenceCount: sentences.length });
            return sentences;
        }

        restoreProcessedParagraph() {
            const { element, originalHTML } = this.processedParagraph;
            if (element && originalHTML) {
                try {
                    element.innerHTML = originalHTML;
                    log('debug', 'Restored processed paragraph HTML');
                } catch (error) {
                    log('error', 'Failed to restore processed paragraph', {
                        error: error?.message,
                        stack: error?.stack
                    });
                }
            }
            this.processedParagraph = { element: null, originalHTML: '' };
        }

        clearHighlights() {
            const highlights = document.querySelectorAll('.tts-highlight');
            highlights.forEach(highlight => {
                const parent = highlight.parentNode;
                if (!parent) return;
                parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                parent.normalize();
            });

            if (highlights.length) log('debug', 'Cleared highlights', { count: highlights.length });
        }

        updatePointerArrow() {
            if (!this.ttsActive || !this.currentParagraph) {
                this.hidePointerArrow();
                return;
            }

            if (!document.body) {
                log('warn', 'Cannot create pointer arrow because body is missing');
                return;
            }

            if (!this.pointerEl) {
                this.pointerEl = document.createElement('div');
                this.pointerEl.id = 'tts-pointer';
                this.pointerEl.className = 'tts-pointer';
                this.pointerEl.setAttribute('aria-hidden', 'true');
                document.body.appendChild(this.pointerEl);
                log('debug', 'Pointer arrow created');
            }

            const rect = this.currentParagraph.element.getBoundingClientRect();
            const viewport = { w: window.innerWidth, h: window.innerHeight };
            const visible = rect.bottom > 0 && rect.top < viewport.h;

            if (visible) {
                this.pointerEl.style.opacity = '0';
            } else {
                const origin = { x: viewport.w / 2, y: viewport.h / 2 };
                const target = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
                const radius = 80;
                this.pointerEl.style.left = `${origin.x + radius * Math.cos(angle)}px`;
                this.pointerEl.style.top = `${origin.y + radius * Math.sin(angle)}px`;
                this.pointerEl.style.transform = `translate(-50%, -50%) rotate(${angle * 180 / Math.PI + 90}deg)`;
                this.pointerEl.style.opacity = '1';
            }

            this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
        }

        hidePointerArrow() {
            if (this.pointerEl) this.pointerEl.style.opacity = '0';
            if (this.pointerLoopId) {
                cancelAnimationFrame(this.pointerLoopId);
                this.pointerLoopId = null;
                log('debug', 'Pointer arrow loop stopped');
            }
        }

        setSpeechRate(rate) {
            const parsed = Number.parseFloat(rate);
            if (!Number.isFinite(parsed) || parsed < 0.5 || parsed > 3) {
                log('warn', 'Rejected invalid speech rate', { rate });
                return;
            }
            this.CONFIG.SPEECH_RATE = parsed;
            log('info', 'Speech rate updated', { rate: parsed });
        }

        notifyState() {
            sendRuntimeMessage({ type: 'stateUpdate', ...this.getState() });
        }

        getState() {
            return {
                state: this.ttsActive ? (this.isPaused ? 'paused' : 'playing') : 'stopped',
                rate: this.CONFIG.SPEECH_RATE,
                continuousReadingActive: this.continuousReadingActive,
                currentParagraphIndex: this.currentParagraphIndex,
                currentSentenceIndex: this.currentSentenceIndex,
                paragraphCount: this.paragraphsList.length
            };
        }

        getDiagnostics() {
            return {
                ok: true,
                prefix: LOG_PREFIX,
                hasBody: !!document.body,
                hasSpeechSynthesis: !!this.speechSynthesis,
                activeElement: activeElementInfo(),
                appRootPresent: !!document.querySelector('#__next, #root, main'),
                bodyTextLength: document.body?.innerText?.length || 0,
                candidateCount: (() => {
                    try { return document.querySelectorAll(this.CONFIG.CANDIDATE_SELECTORS).length; }
                    catch (_) { return null; }
                })(),
                ...this.getState()
            };
        }
    }

    let ttsReader = null;

    function initialise() {
        if (ttsReader) {
            log('warn', 'Initialise called more than once; skipping');
            return;
        }

        log('info', 'Initialise requested', {
            hasBody: !!document.body,
            activeElement: activeElementInfo()
        });

        ttsReader = new TTSReader();
        window.ttsReader = ttsReader;
        ttsReader.init().catch(error => {
            log('error', 'Failed to initialise TTS Reader', {
                error: error?.message,
                stack: error?.stack
            });
        });
    }

    log('info', 'Content script loaded', {
        hasChromeRuntime: !!chrome?.runtime?.id,
        activeElement: activeElementInfo()
    });

    setTimeout(() => log('info', '5-second page health check', {
        hasBody: !!document.body,
        bodyTextLength: document.body?.innerText?.length || 0,
        appRootPresent: !!document.querySelector('#__next, #root, main'),
        ttsReaderInitialised: !!ttsReader
    }), 5000);

    setTimeout(() => log('info', '15-second page health check', {
        hasBody: !!document.body,
        bodyTextLength: document.body?.innerText?.length || 0,
        appRootPresent: !!document.querySelector('#__next, #root, main'),
        ttsReaderInitialised: !!ttsReader
    }), 15000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            log('info', 'DOMContentLoaded observed');
            setTimeout(initialise, 500);
        }, { once: true });
    } else {
        setTimeout(initialise, 500);
    }
})();
