// ==UserScript==
// @name         Universal TTS Reader with Precision Navigation & Highlighting
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  A robust TTS reader with continuous reading, precise arrow-key navigation on complex sites, word-by-word highlighting, and pause/resume.
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
        textNodesForHighlighting: [],

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
            let text = '';
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            while(walker.nextNode()) {
                text += walker.currentNode.textContent + ' ';
            }
            return text.trim().replace(/\s+/g, ' ');
        },

        isParagraphElement(element) {
            if (!element || !element.tagName || element.offsetParent === null) return false;
            if (element.closest(this.CONFIG.IGNORE_SELECTORS)) return false;
            return this.getTextFromElement(element).length >= this.CONFIG.MIN_TEXT_LENGTH;
        },

        findAllParagraphs() {
            const allCandidates = Array.from(document.querySelectorAll(this.CONFIG.CANDIDATE_SELECTORS));
            const paragraphs = [];
            const leafElements = allCandidates.filter(candidate => {
                if (!this.isParagraphElement(candidate)) return false;
                return !candidate.querySelector(this.CONFIG.CANDIDATE_SELECTORS);
            });
            leafElements.forEach(element => {
                const text = this.getTextFromElement(element);
                if (text) {
                    paragraphs.push({ element: element, text: text });
                }
            });
            return paragraphs;
        },

        getTextNodesForElement(element) {
            const nodes = [];
            if (!element) return nodes;
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            while (walker.nextNode()) {
                const trimmedText = walker.currentNode.textContent.trim().replace(/\s+/g, ' ');
                if (trimmedText.length > 0) {
                    nodes.push({ node: walker.currentNode, text: trimmedText });
                }
            }
            return nodes;
        },

        clearHighlights() {
            this.highlightedElements.forEach(el => el.classList.remove('tts-current-sentence'));
            this.highlightedElements = [];
        },

        highlightCurrentText(event) {
            if (event.name !== 'word') return;
            this.clearHighlights();
            let charIndex = event.charIndex;
            let totalCharCount = 0;

            for (const nodeInfo of this.textNodesForHighlighting) {
                const nodeTextLength = nodeInfo.text.length;
                if (charIndex >= totalCharCount && charIndex < totalCharCount + nodeTextLength) {
                    let parentElement = nodeInfo.node.parentElement;
                     while(parentElement && !this.paragraphsList.some(p => p.element === parentElement)) {
                        parentElement = parentElement.parentElement;
                    }
                    if (parentElement) {
                        parentElement.classList.add('tts-current-sentence');
                        this.highlightedElements.push(parentElement);
                        this.gentleScrollToElement(parentElement);
                    }
                    return;
                }
                totalCharCount += nodeTextLength + 1;
            }
        },

        triggerTTS(text, onComplete = null) {
            if (!text || text.length === 0) {
                if (onComplete) onComplete();
                return;
            }
            // This is a crucial change: we only cancel if we're starting a completely new thought.
            // The continuous reading chain will manage its own flow via onend.
            if (!this.continuousReadingActive) {
                this.speechSynthesis.cancel();
            }

            this.ttsActive = true;
            this.isPaused = false;
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = this.CONFIG.SPEECH_RATE;
            const voices = this.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes('Ava') && !v.name.includes('Multilingual')) || voices.find(v => v.lang.startsWith('en'));
            if(preferredVoice) utterance.voice = preferredVoice;

            utterance.onend = () => {
                this.ttsActive = false;
                if (onComplete) onComplete();
            };
            utterance.onerror = (e) => {
                console.error("Speech Synthesis Error:", e);
                this.ttsActive = false;
                this.clearHighlights();
                if (onComplete) onComplete();
            };

            this.speechSynthesis.speak(utterance);
        },

        readFromParagraph(index) {
            if (!this.continuousReadingActive || index < 0 || index >= this.paragraphsList.length) {
                this.continuousReadingActive = false;
                this.clearHighlights();
                return;
            }
            this.currentParagraphIndex = index;
            const para = this.paragraphsList[index];

            if (!para || !para.text) {
                this.readFromParagraph(index + 1); // Skip invalid paragraphs
                return;
            }

            this.textNodesForHighlighting = this.getTextNodesForElement(para.element);
            const textToRead = this.textNodesForHighlighting.map(n => n.text).join(' ');

            this.gentleScrollToElement(para.element);
            // The magic is here: the onComplete callback chains to the next paragraph.
            this.triggerTTS(textToRead, () => this.readFromParagraph(index + 1));
        },

        stopTTS(notify = true) {
            this.continuousReadingActive = false;
            if (this.speechSynthesis.speaking || this.speechSynthesis.pending) {
                this.ttsActive = false;
                this.isPaused = false;
                this.speechSynthesis.cancel();
                this.clearHighlights();
                if (notify) this.showNotification('All TTS stopped');
                return true;
            }
            return false;
        },

        pauseResumeTTS() {
            if (!this.ttsActive && !this.speechSynthesis.speaking) return;
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
                this.continuousReadingActive = false;
                return;
            };
            this.stopTTS(false); // Stop any previous reading chain before starting a new one.
            this.continuousReadingActive = true;
            this.readFromParagraph(index);
        },

        setupEventListeners() {
            document.addEventListener('keydown', (e) => {
                const key = e.key;
                const combo = e.ctrlKey && e.shiftKey;
                const KEY = this.CONFIG.HOTKEYS;

                if (combo && key.toUpperCase() === KEY.ACTIVATE) {
                    e.preventDefault();
                    if (this.stopTTS()) return;
                    document.body.style.cursor = 'crosshair';
                    this.showNotification('Click where you want to start reading');
                    document.addEventListener('click', (ev) => {
                        this.initParagraphNavigation(); // Re-scan paragraphs on click
                        let range;
                        if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
                        if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
                            const startNode = range.startContainer;
                            const startParaIndex = this.paragraphsList.findIndex(p => p.element.contains(startNode));
                            if (startParaIndex !== -1) this.goToParagraph(startParaIndex);
                        }
                        document.body.style.cursor = 'default';
                    }, { once: true });
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
            window.addEventListener('beforeunload', () => this.stopTTS());
        },

        createUI() {
            const style = document.createElement('style');
            style.textContent = `.tts-current-sentence { background-color: rgba(0, 255, 0, 0.2) !important; outline: 1px solid rgba(0, 255, 0, 0.6) !important; transition: all 0.2s; }`;
            document.head.appendChild(style);

            const uiPanel = document.createElement('div');
            uiPanel.id = 'tts-control-panel';
            uiPanel.style.cssText = `position: fixed; top: 80px; right: 20px; width: 180px; padding: 8px; background: rgba(0,0,0,0.7); color: #fff; font-family: Arial, sans-serif; font-size: 13px; border-radius: 6px; cursor: move; z-index: 10001;`;
            uiPanel.innerHTML = `<label for="tts-speed" style="display:block; margin-bottom:4px;">Speed: <span id="speed-value">${this.CONFIG.SPEECH_RATE.toFixed(1)}</span>x</label><input type="range" id="tts-speed" min="0.5" max="2.5" step="0.1" value="${this.CONFIG.SPEECH_RATE}" style="width:100%;">`;
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
            const notification = document.createElement('div');
            notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: #333; color: white; padding: 10px 20px; border-radius: 5px; font-family: Arial, sans-serif; font-size: 14px; z-index: 10002;`;
            notification.textContent = message;
            document.body.appendChild(notification);
            setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 2500);
        },

        makeDraggable(el) {
            let isDown = false, startX, startY, origX, origY;
            el.addEventListener('mousedown', e => {
                isDown = true; startX = e.clientX; startY = e.clientY;
                const rect = el.getBoundingClientRect();
                origX = rect.left; origY = rect.top;
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (!isDown) return;
                el.style.left = (origX + e.clientX - startX) + 'px';
                el.style.top = (origY + e.clientY - startY) + 'px';
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