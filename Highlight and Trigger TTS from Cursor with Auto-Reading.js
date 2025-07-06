// ==UserScript==
// @name         Universal TTS Reader with Precision Navigation & Highlighting
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  A robust TTS reader with continuous reading, precise arrow-key navigation, and word-by-word highlighting.
// @author       Your Name (updated by AI)
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const TTSReader = {
        speechSynthesis: window.speechSynthesis,
        ttsActive: false,
        isPaused: false,
        continuousReadingActive: false,
        pageFullyLoaded: false,
        lastScrollTime: 0,
        currentParagraphIndex: -1,
        paragraphsList: [],
        highlightedElements: [],
        processedParagraph: {
            element: null,
            originalHTML: '',
            wordSpans: []
        },

        CONFIG: {
            CANDIDATE_SELECTORS: 'p, li, h1, h2, h3, h4, h5, h6, td, th, pre, div[class*="content"]',
            IGNORE_SELECTORS: 'nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"]',
            MIN_TEXT_LENGTH: 10,
            SPEECH_RATE: 1.5,
            SCROLL_THROTTLE_MS: 3000,
            HOTKEYS: {
                ACTIVATE: 'U',
                PAUSE_RESUME: 'P',
                NAV_NEXT: 'ArrowRight',
                NAV_PREV: 'ArrowLeft',
                STOP: 'Escape'
            }
        },

        init() {
            this.waitForPageLoad();
            this.createUI();
            this.setupEventListeners();
            this.loadVoices().then(() => {
                const startInterval = setInterval(() => {
                    if (this.pageFullyLoaded) {
                        clearInterval(startInterval);
                        this.initParagraphNavigation();
                    }
                }, 500);
            });
        },

        waitForPageLoad() {
            if (document.readyState === 'complete') {
                this.pageFullyLoaded = true;
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

        getTextFromElement(element) {
            if (!element) return '';
            // Use innerText which is better at approximating rendered text, ignoring hidden elements.
            return element.innerText.trim().replace(/\s+/g, ' ');
        },

        isParagraphElement(element) {
            if (!element || !element.tagName || element.offsetParent === null) return false;
            if (element.closest(this.CONFIG.IGNORE_SELECTORS)) return false;
            // Check for direct text content to avoid including parent containers with no text of their own.
            const hasDirectText = Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0);
            if (!hasDirectText && element.children.length > 0) {
                 // It might be a container of other valid elements, but we prefer leaf nodes.
            }
            return this.getTextFromElement(element).length >= this.CONFIG.MIN_TEXT_LENGTH;
        },

        findAllParagraphs() {
            const allCandidates = Array.from(document.querySelectorAll(this.CONFIG.CANDIDATE_SELECTORS));
            const paragraphs = new Set(); // Use a Set to avoid duplicates
            allCandidates.forEach(candidate => {
                if (this.isParagraphElement(candidate)) {
                    // Find the most specific element containing the text
                    let leafElement = candidate;
                    let childElement = candidate.querySelector(this.CONFIG.CANDIDATE_SELECTORS);
                    while(childElement && this.isParagraphElement(childElement)) {
                        leafElement = childElement;
                        childElement = childElement.querySelector(this.CONFIG.CANDIDATE_SELECTORS);
                    }
                    paragraphs.add(leafElement);
                }
            });
            return Array.from(paragraphs).map(element => ({
                element: element,
                text: this.getTextFromElement(element)
            }));
        },

        clearHighlights() {
            this.highlightedElements.forEach(el => el.classList.remove('tts-current-sentence'));
            this.highlightedElements = [];
            const currentWord = document.querySelector('.tts-current-word');
            if(currentWord) currentWord.classList.remove('tts-current-word');
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
            this.revertParagraph(); // Revert any previous paragraph first

            if (!paraElement || !paraElement.parentNode) return null;

            this.processedParagraph.element = paraElement;
            this.processedParagraph.originalHTML = paraElement.innerHTML;

            const wordSpans = [];
            const walker = document.createTreeWalker(paraElement, NodeFilter.SHOW_TEXT, null, false);
            const nodesToProcess = [];
            while(walker.nextNode()) {
                if (walker.currentNode.textContent.trim().length > 0) {
                     nodesToProcess.push(walker.currentNode);
                }
            }

            nodesToProcess.forEach(node => {
                const fragment = document.createDocumentFragment();
                // Split by whitespace but keep it, to preserve document spacing
                const parts = node.textContent.split(/(\s+)/);
                parts.forEach(part => {
                    if (/\S/.test(part)) { // It's a word
                        const span = document.createElement('span');
                        span.textContent = part;
                        fragment.appendChild(span);
                        wordSpans.push(span);
                    } else { // It's whitespace
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
                if (node.parentNode) {
                    node.parentNode.replaceChild(fragment, node);
                }
            });

            this.processedParagraph.wordSpans = wordSpans;
            return paraElement.textContent.trim().replace(/\s+/g, ' ');
        },


        highlightCurrentWord(event) {
            if (event.name !== 'word') return;

            // Clear previous word's highlight
            const prevWord = document.querySelector('.tts-current-word');
            if (prevWord) prevWord.classList.remove('tts-current-word');

            const charIndex = event.charIndex;
            let accumulatedLength = 0;

            for (const span of this.processedParagraph.wordSpans) {
                const wordLength = span.textContent.length;
                if (charIndex >= accumulatedLength && charIndex < accumulatedLength + wordLength) {
                    span.classList.add('tts-current-word');
                    // Gently scroll the word into view if it's off-screen
                    const rect = span.getBoundingClientRect();
                    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
                    if(!isVisible) {
                        span.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                    }
                    return;
                }
                // The +1 accounts for the space character when we joined the text for the utterance
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
                if (onComplete) onComplete();
            };
            utterance.onerror = (e) => {
                console.error("Speech Synthesis Error:", e);
                this.ttsActive = false;
                this.revertParagraph();
                if (onComplete) onComplete();
            };

            this.speechSynthesis.speak(utterance);
        },

        readFromParagraph(index) {
            if (!this.continuousReadingActive || index < 0 || index >= this.paragraphsList.length) {
                this.continuousReadingActive = false;
                this.revertParagraph();
                return;
            }
            this.currentParagraphIndex = index;
            const para = this.paragraphsList[index];

            if (!para || !para.text) {
                this.readFromParagraph(index + 1); // Skip invalid paragraphs
                return;
            }

            const textToRead = this.prepareParagraphForReading(para.element);
             if (!textToRead) {
                this.readFromParagraph(index + 1); // Skip if preparation fails
                return;
            }

            // Highlight the entire paragraph
            para.element.classList.add('tts-current-sentence');
            this.highlightedElements.push(para.element);

            this.gentleScrollToElement(para.element);
            this.triggerTTS(textToRead, () => this.readFromParagraph(index + 1));
        },

        stopTTS(notify = true) {
            this.continuousReadingActive = false;
            if (this.speechSynthesis.speaking || this.speechSynthesis.pending) {
                this.ttsActive = false;
                this.isPaused = false;
                this.speechSynthesis.cancel();
                this.revertParagraph();
                if (notify) this.showNotification('All TTS stopped');
                return true;
            }
            // Even if not speaking, ensure any leftover markup is gone
            this.revertParagraph();
            return false;
        },

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

        initParagraphNavigation() {
            this.paragraphsList = this.findAllParagraphs();
            const threshold = window.innerHeight * 0.2;
            let startIndex = this.paragraphsList.findIndex(p => p.element.getBoundingClientRect().bottom > threshold);
            this.currentParagraphIndex = startIndex !== -1 ? startIndex : 0;
        },

        goToParagraph(index) {
            if (index < 0 || index >= this.paragraphsList.length) {
                this.stopTTS(false);
                return;
            };
            this.stopTTS(false); // Stop any previous reading before starting a new one.
            this.continuousReadingActive = true;
            this.readFromParagraph(index);
        },

        setupEventListeners() {
            document.addEventListener('keydown', (e) => {
                // Ignore key events in input fields
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                    return;
                }

                const key = e.key;
                const combo = e.ctrlKey && e.shiftKey;
                const KEY = this.CONFIG.HOTKEYS;

                if (combo && key.toUpperCase() === KEY.ACTIVATE) {
                    e.preventDefault();
                    if (this.stopTTS(false)) return;
                    document.body.style.cursor = 'crosshair';
                    this.showNotification('Click where you want to start reading');
                    const clickHandler = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        document.body.style.cursor = 'default';
                        this.initParagraphNavigation(); // Re-scan paragraphs on click
                        const clickedElement = ev.target;
                        if(clickedElement){
                             const startParaIndex = this.paragraphsList.findIndex(p => p.element.contains(clickedElement));
                             if (startParaIndex !== -1) {
                                this.goToParagraph(startParaIndex);
                             } else {
                                this.showNotification('No readable text found there.');
                             }
                        }
                    };
                    document.addEventListener('click', clickHandler, { once: true, capture: true });
                } else if (combo && key.toUpperCase() === KEY.PAUSE_RESUME) {
                    e.preventDefault();
                    this.pauseResumeTTS();
                } else if (key === KEY.NAV_NEXT) {
                    e.preventDefault();
                    this.goToParagraph(this.currentParagraphIndex + 1);
                } else if (key === KEY.NAV_PREV) {
                    e.preventDefault();
                    this.goToParagraph(this.currentParagraphIndex - 1);
                } else if (key === KEY.STOP) {
                    this.stopTTS();
                }
            });
            window.addEventListener('beforeunload', () => this.stopTTS(false));
        },

        createUI() {
            const style = document.createElement('style');
            style.textContent = `
                .tts-current-sentence {
                    background-color: rgba(0, 255, 0, 0.2) !important;
                    outline: 1px solid rgba(0, 255, 0, 0.6) !important;
                    transition: background-color 0.3s, outline 0.3s;
                }
                .tts-current-word {
                    background-color: rgba(255, 255, 0, 0.7) !important;
                    color: black !important;
                    border-radius: 3px;
                    box-shadow: 0 0 5px rgba(0,0,0,0.3);
                }
            `;
            document.head.appendChild(style);

            const uiPanel = document.createElement('div');
            uiPanel.id = 'tts-control-panel';
            uiPanel.style.cssText = `position: fixed; top: 80px; right: 20px; width: 180px; padding: 8px; background: rgba(0,0,0,0.7); color: #fff; font-family: Arial, sans-serif; font-size: 13px; border-radius: 6px; cursor: move; z-index: 10001;`;
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

        showNotification(message) {
            let existing = document.getElementById('tts-notification-popup');
            if(existing) existing.remove();

            const notification = document.createElement('div');
            notification.id = 'tts-notification-popup';
            notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: #333; color: white; padding: 10px 20px; border-radius: 5px; font-family: Arial, sans-serif; font-size: 14px; z-index: 10002; opacity: 0; transition: opacity 0.3s;`;
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

        gentleScrollToElement(element) {
            if (Date.now() - this.lastScrollTime < this.CONFIG.SCROLL_THROTTLE_MS) return;
            const rect = element.getBoundingClientRect();
            const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
            if (!isVisible) {
                this.lastScrollTime = Date.now();
                element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
        },
    };

    TTSReader.init();

})();