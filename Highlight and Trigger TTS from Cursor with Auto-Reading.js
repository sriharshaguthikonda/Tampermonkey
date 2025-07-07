// ==UserScript==
// @name         *** ChatGPT Universal TTS Reader with Precision Navigation & Highlighting
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  An intelligent, content-aware TTS reader with a responsive, "in-game" waypoint arrow that only appears for off-screen content. Features continuous reading and word-by-word highlighting.
// @author       Your Name (updated by AI)
// @match        https://chat.openai.com/c/*
// @match        https://chat.openai.com/g/*
// @match        https://chat.openai.com/?*
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/c/*
// @match        https://chatgpt.com/g/*
// @match        https://chatgpt.com/?*
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==


(function() {
    'use strict';

    const TTSReader = {
        speechSynthesis: window.speechSynthesis,
        ttsActive: false,
        isPaused: false,
        isNavigating: false,
        continuousReadingActive: false,
        pageFullyLoaded: false,
        lastSpokenElement: null,
        navigationTimeoutId: null,
        pointerLoopId: null,
        paragraphsList: [],
        processedParagraph: { element: null, originalHTML: '', wordSpans: [] },

        CONFIG: {
            CANDIDATE_SELECTORS: 'p, li, h1, h2, h3, h4, h5, h6, td, th, .markdown, div[class*="content"], article',
            IGNORE_SELECTORS: 'nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"], [data-message-author-role="user"], pre, code, [class*="code"], [class*="language-"], [class*="highlight"], .token, #thread-bottom-container',
            MIN_TEXT_LENGTH: 10,
            SPEECH_RATE: 1.3,
            NAV_READ_DELAY_MS: 0,
            NAV_THROTTLE_MS: 20,
            HOTKEYS: { ACTIVATE: 'U', PAUSE_RESUME: 'P', NAV_NEXT: 'ArrowRight', NAV_PREV: 'ArrowLeft', STOP: 'Escape' },
            EMOJI_REGEX: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/ug
        },

        init() {
            this.waitForPageLoad();
            this.createUI();
            this.setupEventListeners();
            this.loadVoices();
        },

        // ... (All functions from waitForPageLoad to triggerTTS are unchanged) ...
        waitForPageLoad() {
            if (document.readyState === 'complete') {
                setTimeout(() => { this.pageFullyLoaded = true; }, 1000);
            } else {
                window.addEventListener('load', () => setTimeout(() => { this.pageFullyLoaded = true; }, 2000));
            }
        },

        loadVoices() {
            return new Promise((resolve) => {
                const voices = this.speechSynthesis.getVoices();
                if (voices.length > 0) resolve(voices);
                else this.speechSynthesis.onvoiceschanged = () => resolve(this.speechSynthesis.getVoices());
            });
        },

        cleanTextForTTS(text) {
            return text.replace(this.CONFIG.EMOJI_REGEX, '').replace(/\s+/g, ' ');
        },

        getTextFromElement(element) {
            if (!element) return '';
            const rawText = element.innerText || '';
            return this.cleanTextForTTS(rawText);
        },

        isVisiblyReadable(element) {
            if (!element || !element.tagName || element.offsetParent === null || window.getComputedStyle(element).visibility === 'hidden' || window.getComputedStyle(element).display === 'none') {
                return false;
            }
            if (element.closest(this.CONFIG.IGNORE_SELECTORS)) return false;
            const text = this.getTextFromElement(element);
            return text.length >= this.CONFIG.MIN_TEXT_LENGTH;
        },

        findAllParagraphs() {
            let candidates = Array.from(document.querySelectorAll(this.CONFIG.CANDIDATE_SELECTORS));
            let readableCandidates = candidates.filter(el => this.isVisiblyReadable(el));
            const candidateSet = new Set(readableCandidates);

            const finalParagraphs = readableCandidates.filter(el => {
                for (const otherEl of candidateSet) {
                    if (el !== otherEl && el.contains(otherEl)) return false;
                }
                return true;
            });

            return finalParagraphs.map(element => ({
                element: element,
                text: this.getTextFromElement(element)
            }));
        },

        clearHighlights(keepFading = false) {
            const selectors = ['.tts-current-sentence', '.tts-current-word'];
            if (!keepFading) {
                selectors.push('.tts-navigation-focus', '.tts-focus-fade-out');
            }
            document.querySelectorAll(selectors.join(', ')).forEach(el => {
                el.classList.remove(...selectors.map(s => s.substring(1)));
            });
        },

        revertParagraph() {
            const { element, originalHTML } = this.processedParagraph;
            if (element && originalHTML) {
                element.innerHTML = originalHTML;
            }
            this.processedParagraph = { element: null, originalHTML: '', wordSpans: [] };
            this.clearHighlights();
        },

        prepareParagraphForReading(paraElement) {
            this.revertParagraph();
            if (!paraElement || !paraElement.parentNode) return null;

            this.processedParagraph.element = paraElement;
            this.processedParagraph.originalHTML = paraElement.innerHTML;
            const wordSpans = [];
            const walker = document.createTreeWalker(paraElement, NodeFilter.SHOW_TEXT, null, false);
            const nodesToProcess = [];
            while(walker.nextNode()) {
                if (walker.currentNode.textContent.trim().length > 0) nodesToProcess.push(walker.currentNode);
            }

            nodesToProcess.forEach(node => {
                const fragment = document.createDocumentFragment();
                const cleanedText = this.cleanTextForTTS(node.textContent);
                const parts = cleanedText.split(/(\s+)/);

                parts.forEach(part => {
                    if (/\S/.test(part)) {
                        const span = document.createElement('span');
                        span.textContent = part;
                        fragment.appendChild(span);
                        wordSpans.push(span);
                    } else {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
                if (node.parentNode) node.parentNode.replaceChild(fragment, node);
            });

            this.processedParagraph.wordSpans = wordSpans;
            return this.processedParagraph.wordSpans.map(s => s.textContent).join(' ');
        },

        highlightCurrentWord(event) {
            if (event.name !== 'word') return;
            const prevWord = document.querySelector('.tts-current-word');
            if (prevWord) prevWord.classList.remove('tts-current-word');

            let accumulatedLength = 0;
            for (const span of this.processedParagraph.wordSpans) {
                const wordLength = span.textContent.length;
                if (event.charIndex >= accumulatedLength && event.charIndex < accumulatedLength + wordLength) {
                    span.classList.add('tts-current-word');
                    return;
                }
                accumulatedLength += wordLength + 1;
            }
        },

        triggerTTS(text, onComplete = null) {
            if (!text || text.length === 0) {
                if (onComplete) onComplete();
                return;
            }

            this.ttsActive = true;
            this.isPaused = false;
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = this.CONFIG.SPEECH_RATE;
            const voices = this.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes('Ava') && !v.name.includes('Multilingual')) || voices.find(v => v.lang.startsWith('en'));
            if(preferredVoice) utterance.voice = preferredVoice;

            utterance.onboundary = (event) => this.highlightCurrentWord(event);

            utterance.onend = () => {
                this.ttsActive = false;
                if (onComplete && this.continuousReadingActive) {
                    onComplete();
                } else {
                    this.stopTTS(false);
                }
            };
            utterance.onerror = (e) => {
                console.error("Speech Synthesis Error:", e);
                this.ttsActive = false;
                this.revertParagraph();
                if (onComplete && this.continuousReadingActive) onComplete();
            };

            this.speechSynthesis.speak(utterance);
        },

        readFromParagraph(index) {
            if (!this.continuousReadingActive) {
                this.revertParagraph();
                return;
            }

            if (index < 0 || index >= this.paragraphsList.length) {
                this.stopTTS(false);
                return;
            }

            this.currentParagraphIndex = index;
            const para = this.paragraphsList[index];
            this.lastSpokenElement = para.element;

            const textToRead = this.prepareParagraphForReading(para.element);
            if (!textToRead) {
                this.navigate(1);
                return;
            }

            this.clearHighlights(true);
            para.element.classList.add('tts-current-sentence');

            // Start the pointer arrow update loop
            if (this.pointerLoopId) cancelAnimationFrame(this.pointerLoopId);
            this.updatePointerArrow();


            this.triggerTTS(textToRead, () => this.navigate(1));
        },

        stopTTS(notify = true) {
            this.continuousReadingActive = false;
            clearTimeout(this.navigationTimeoutId);
            if (this.speechSynthesis.speaking || this.speechSynthesis.pending) {
                this.speechSynthesis.cancel();
            }
            this.revertParagraph();

            // Stop the pointer arrow loop and hide the arrow
            if (this.pointerLoopId) {
                cancelAnimationFrame(this.pointerLoopId);
                this.pointerLoopId = null;
            }
            this.hidePointerArrow();

            if (notify) this.showNotification('All TTS stopped');
            return true;
        },

        // ... (pauseResumeTTS, navigate, startReadingOnClick, setupEventListeners are unchanged) ...
        pauseResumeTTS() {
            if (!this.speechSynthesis.speaking && !this.isPaused) return;
            if (this.isPaused) {
                this.speechSynthesis.resume();
                this.isPaused = false;
                this.showNotification('Resumed');
            } else {
                this.speechSynthesis.pause();
                this.isPaused = true;
                this.showNotification('Paused');
            }
        },

        navigate(direction) {
            if (this.isNavigating) return;
            this.isNavigating = true;
            setTimeout(() => { this.isNavigating = false; }, this.CONFIG.NAV_THROTTLE_MS);

            this.stopTTS(false);

            this.paragraphsList = this.findAllParagraphs();
            if (this.paragraphsList.length === 0) return this.showNotification("No readable text found.");

            const currentFocus = document.querySelector('.tts-navigation-focus');
            if(currentFocus) {
                currentFocus.classList.remove('tts-navigation-focus');
                currentFocus.classList.add('tts-focus-fade-out');
                setTimeout(() => currentFocus.classList.remove('tts-focus-fade-out'), 500);
            }

            let currentIndex = -1;
            if (this.lastSpokenElement) {
                currentIndex = this.paragraphsList.findIndex(p => p.element === this.lastSpokenElement);
            }

            if (currentIndex === -1) {
                const threshold = window.innerHeight * 0.2;
                currentIndex = this.paragraphsList.findIndex(p => p.element.getBoundingClientRect().bottom > threshold);
                currentIndex = (currentIndex === -1) ? 0 : currentIndex - 1;
            }

            const newIndex = currentIndex + direction;

            if (newIndex >= 0 && newIndex < this.paragraphsList.length) {
                const targetElement = this.paragraphsList[newIndex].element;
                this.clearHighlights(true);
                targetElement.classList.add('tts-navigation-focus');
                this.gentleScrollToElement(targetElement); // Still useful for navigation highlight
                this.lastSpokenElement = targetElement;

                this.navigationTimeoutId = setTimeout(() => {
                    this.continuousReadingActive = true;
                    this.readFromParagraph(newIndex);
                }, this.CONFIG.NAV_READ_DELAY_MS);
            } else {
                 this.showNotification(direction > 0 ? "End of page." : "Start of page.");
            }
        },

        startReadingOnClick(event) {
            if (event.target.closest('#thread-bottom-container')) return;

            this.stopTTS(false);
            this.paragraphsList = this.findAllParagraphs();
            let startParaIndex = -1;

            const containingParagraph = this.paragraphsList.find(p => p.element.contains(event.target));
            if (containingParagraph) {
                startParaIndex = this.paragraphsList.indexOf(containingParagraph);
            } else {
                const clickY = event.clientY;
                for(let i = 0; i < this.paragraphsList.length; i++) {
                    const rect = this.paragraphsList[i].element.getBoundingClientRect();
                    if (rect.top > clickY) {
                        startParaIndex = i;
                        break;
                    }
                }
            }

            if (startParaIndex !== -1) {
                this.continuousReadingActive = true;
                this.readFromParagraph(startParaIndex);
            } else {
                this.showNotification('No readable text found at or below your click.');
            }
        },

        setupEventListeners() {
            document.addEventListener('keydown', (e) => {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;

                const key = e.key;
                const combo = e.ctrlKey && e.shiftKey;
                const KEY = this.CONFIG.HOTKEYS;

                switch (key) {
                    case KEY.NAV_NEXT: e.preventDefault(); this.navigate(1); break;
                    case KEY.NAV_PREV: e.preventDefault(); this.navigate(-1); break;
                    case KEY.STOP: e.preventDefault(); this.stopTTS(); break;
                }

                if (combo && key.toUpperCase() === KEY.ACTIVATE) {
                    e.preventDefault();
                    if (this.ttsActive) { this.stopTTS(); return; }
                    document.body.style.cursor = 'crosshair';
                    this.showNotification('Click where you want to start reading');

                    const clickHandler = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        document.body.style.cursor = 'default';
                        this.startReadingOnClick(ev);
                    };
                    document.addEventListener('click', clickHandler, { once: true, capture: true });
                } else if (combo && key.toUpperCase() === KEY.PAUSE_RESUME) {
                    e.preventDefault();
                    this.pauseResumeTTS();
                }
            });
            window.addEventListener('beforeunload', () => this.stopTTS(false));
        },

        // --- UI AND POINTER LOGIC ---

        createUI() {
            const style = document.createElement('style');
            style.textContent = `
                /* ... (highlighting styles are the same) ... */
                .tts-current-sentence { background-color: rgba(46, 204, 113, 0.08) !important; border-left: 4px solid #2ecc71 !important; padding-left: 10px !important; transition: background-color 0.3s, border-color 0.3s; }
                .tts-current-word { background-color: rgba(250, 210, 50, 0.9) !important; font-weight: bold !important; color: black !important; border-radius: 3px; transform: scale(1.02); box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: background-color 0.1s, transform 0.1s; }
                .tts-navigation-focus { background-color: rgba(52, 152, 219, 0.3) !important; border-left: 4px solid #3498db !important; padding-left: 10px !important; transition: background-color 0.3s, border-color 0.3s; }
                .tts-focus-fade-out { border-left-color: transparent !important; background-color: transparent !important; }

                /* NEW: In-game waypoint style pointer */
                #tts-pointer {
                    position: fixed;
                    width: 36px;
                    height: 44px;
                    background-color: #e74c3c;
                    opacity: 0;
                    visibility: hidden;
                    cursor: pointer;
                    z-index: 2147483646;
                    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
                    filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));
                    transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.1s linear;
                    pointer-events: none; /* Hide from mouse until visible */
                }
                #tts-pointer.visible {
                    opacity: 0.9;
                    visibility: visible;
                    pointer-events: auto; /* Allow clicks when visible */
                }
                #tts-pointer:hover {
                    opacity: 1;
                    transform: scale(1.15);
                }
            `;
            document.head.appendChild(style);

            // Create the single waypoint pointer
            const pointer = document.createElement('div');
            pointer.id = 'tts-pointer';
            document.body.appendChild(pointer);

            pointer.addEventListener('click', () => {
                const currentSentence = document.querySelector('.tts-current-sentence');
                if (currentSentence) {
                    currentSentence.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            // ... (rest of the UI panel code remains the same) ...
            const uiPanel = document.createElement('div');
            uiPanel.id = 'tts-control-panel';
            uiPanel.style.cssText = `position: fixed; top: 80px; right: 20px; width: 180px; padding: 8px; background: rgba(0,0,0,0.7); color: #fff; font-family: Arial, sans-serif; font-size: 13px; border-radius: 6px; cursor: move; z-index: 2147483647;`;
            uiPanel.innerHTML = `<div style="font-weight:bold; text-align:center; margin-bottom: 5px;">TTS Reader</div><label for="tts-speed" style="display:block; margin-bottom:4px;">Speed: <span id="speed-value">${this.CONFIG.SPEECH_RATE.toFixed(1)}</span>x</label><input type="range" id="tts-speed" min="0.5" max="2.5" step="0.1" value="${this.CONFIG.SPEECH_RATE}" style="width:100%;">`;
            document.body.appendChild(uiPanel);

            const speedInput = document.getElementById('tts-speed');
            speedInput.addEventListener('input', e => {
                this.CONFIG.SPEECH_RATE = parseFloat(e.target.value);
                document.getElementById('speed-value').textContent = this.CONFIG.SPEECH_RATE.toFixed(1);
            });
            speedInput.addEventListener('mousedown', e => e.stopPropagation());
            this.makeDraggable(uiPanel);
        },

        // MODIFIED: This function is now mostly disabled for TTS reading.
        gentleScrollToElement(element) {

        },

        // REWRITTEN: New intelligent waypoint arrow logic
        updatePointerArrow() {
            const currentSentence = document.querySelector('.tts-current-sentence');
            const pointer = document.getElementById('tts-pointer');

            // Exit conditions: No sentence, paused, or no pointer element.
            if (!currentSentence || !pointer || this.isPaused || !this.continuousReadingActive) {
                this.hidePointerArrow();
                this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
                return;
            }

            const rect = currentSentence.getBoundingClientRect();
            const viewport = { w: window.innerWidth, h: window.innerHeight };

            // THE CRUCIAL CHECK: If the element is visible on screen, hide the arrow.
            const isVisible = rect.bottom > 0 && rect.top < viewport.h;
            if (isVisible) {
                this.hidePointerArrow();
                this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
                return;
            }

            // --- If we reach here, the element is OFF-SCREEN ---
            pointer.classList.add('visible');

            // 1. Define the center of the screen (our arrow's origin)
            const origin = { x: viewport.w / 2, y: viewport.h / 2 };

            // 2. Define the target (the center of the off-screen element)
            const target = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

            // 3. Calculate the angle from origin to target
            const angleDeg = Math.atan2(target.y - origin.y, target.x - origin.x) * (180 / Math.PI) + 90;

            // 4. Position the arrow on a small circle around the screen's center
            const radius = 80; // How far from the center the arrow sits
            const angleRad = (angleDeg - 90) * (Math.PI / 180);
            const pointerPos = {
                x: origin.x + radius * Math.cos(angleRad),
                y: origin.y + radius * Math.sin(angleRad)
            };

            // 5. Apply the position and rotation
            pointer.style.left = `${pointerPos.x}px`;
            pointer.style.top = `${pointerPos.y}px`;
            pointer.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;

            this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
        },

        // Helper to hide the single arrow
        hidePointerArrow() {
            const pointer = document.getElementById('tts-pointer');
            if (pointer) {
                pointer.classList.remove('visible');
            }
        },

        // ... (showNotification and makeDraggable are unchanged) ...
        showNotification(message) {
            let existing = document.getElementById('tts-notification-popup');
            if(existing) existing.remove();

            const notification = document.createElement('div');
            notification.id = 'tts-notification-popup';
            notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: #333; color: white; padding: 10px 20px; border-radius: 5px; font-family: Arial, sans-serif; font-size: 14px; z-index: 2147483647; opacity: 0; transition: opacity 0.3s;`;
            notification.textContent = message;
            document.body.appendChild(notification);
            setTimeout(() => { notification.style.opacity = '1'; }, 10);
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
            }, 2500);
        },

        makeDraggable(el) {
            let isDown = false, startX, startY, origLeft, origTop;
            el.addEventListener('mousedown', e => {
                if(e.target.tagName === 'INPUT') return;
                isDown = true;
                startX = e.clientX;
                startY = e.clientY;
                const style = window.getComputedStyle(el);
                origLeft = parseInt(style.left, 10);
                origTop = parseInt(style.top, 10);
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (!isDown) return;
                el.style.left = (origLeft + e.clientX - startX) + 'px';
                el.style.top = (origTop + e.clientY - startY) + 'px';
            });
            document.addEventListener('mouseup', () => { isDown = false; });
        },
    };

    TTSReader.init();

})();