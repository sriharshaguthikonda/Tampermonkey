// ==UserScript==
// @name         Highlight and Trigger TTS from Cursor with Auto-Reading
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Add a highlight class to text under cursor, trigger Edge TTS, and auto-read new paragraphs
// @author       Your Name
// @match        https://chatgpt.com/c/*
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
        lastScrollTime: 0,
        lastSpokenElement: null,
        navigationTimeoutId: null,
        
        // --- Auto-reading properties ---
        autoReadingEnabled: true,
        observer: null,
        knownParagraphs: new Set(),
        readQueue: [],
        isProcessingQueue: false,
        
        processedParagraph: {
            element: null,
            originalHTML: '',
            wordSpans: []
        },

        CONFIG: {
            CANDIDATE_SELECTORS: 'p, li, h1, h2, h3, h4, h5, h6, td, th, .markdown, div[class*="content"], article',
            IGNORE_SELECTORS: 'nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"], [data-message-author-role="user"], pre, code, [class*="code"], [class*="language-"], [class*="highlight"], .token',
            MIN_TEXT_LENGTH: 10,
            SPEECH_RATE: 1.3,
            SCROLL_THROTTLE_MS: 1500,
            NAV_READ_DELAY_MS: 350,
            NAV_THROTTLE_MS: 30,
            HOTKEYS: {
                ACTIVATE: 'U',
                PAUSE_RESUME: 'P',
                NAV_NEXT: 'ArrowRight',
                NAV_PREV: 'ArrowLeft',
                STOP: 'Escape',
                TOGGLE_AUTO_READ: 'A'
            },
            EMOJI_REGEX: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/ug
        },











        init() {
            this.waitForPageLoad(() => {
                this.startAutoReading();
            });
            this.createUI();
            this.setupEventListeners();
            this.loadVoices();
        },

        waitForPageLoad(callback) {
            const checkReadyState = () => {
                if (document.readyState === 'complete') {
                    setTimeout(() => {
                        this.pageFullyLoaded = true;
                        if (callback) callback();
                    }, 1000);
                } else {
                    window.addEventListener('load', () => setTimeout(() => {
                        this.pageFullyLoaded = true;
                        if (callback) callback();
                    }, 2000), { once: true });
                }
            };
            checkReadyState();
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
            return this.cleanTextForTTS(element.innerText || '');
        },

        isVisiblyReadable(element) {
            if (!element || !element.tagName || element.offsetParent === null || window.getComputedStyle(element).visibility === 'hidden' || window.getComputedStyle(element).display === 'none') return false;
            if (element.closest(this.CONFIG.IGNORE_SELECTORS)) return false;
            return this.getTextFromElement(element).length >= this.CONFIG.MIN_TEXT_LENGTH;
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

        // --- Auto-Reading Methods ---
        startAutoReading() {
            if (this.observer) return; // Already running
            
            this.autoReadingEnabled = true;
            this.paragraphsList = this.findAllParagraphs();
            this.knownParagraphs = new Set(this.paragraphsList.map(p => p.element));
            console.log(`Auto-reading enabled. Initialized with ${this.knownParagraphs.size} known paragraphs.`);

            this.observer = new MutationObserver(mutations => {
                let shouldCheck = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        shouldCheck = true;
                        break;
                    }
                }
                if (shouldCheck) this.checkForNewParagraphs();
            });

            this.observer.observe(document.body, { childList: true, subtree: true });
            this.showNotification("Auto-reading enabled.");
        },

        stopAutoReading() {
            if (!this.observer) return;
            this.observer.disconnect();
            this.observer = null;
            this.autoReadingEnabled = false;
            this.readQueue = [];
            this.isProcessingQueue = false;
            this.showNotification("Auto-reading disabled.");
        },

        checkForNewParagraphs() {
            if (!this.autoReadingEnabled) return;
            const currentParagraphs = this.findAllParagraphs();
            currentParagraphs.forEach(p => {
                if (!this.knownParagraphs.has(p.element)) {
                    this.knownParagraphs.add(p.element);
                    this.readQueue.push(p);
                }
            });
            if (!this.isProcessingQueue) {
                this.processReadQueue();
            }
        },

        processReadQueue() {
            if (this.isProcessingQueue || this.readQueue.length === 0 || !this.autoReadingEnabled || this.ttsActive) {
                return;
            }
            this.isProcessingQueue = true;
            
            const para = this.readQueue.shift();
            
            if (para && para.text) {
                console.log("Auto-reading new paragraph:", para.text.substring(0, 50));
                para.element.classList.add('tts-new-paragraph-highlight');
                this.gentleScrollToElement(para.element);
                
                this.triggerTTS(para.text, () => {
                    para.element.classList.remove('tts-new-paragraph-highlight');
                    this.isProcessingQueue = false;
                    setTimeout(() => this.processReadQueue(), 500);
                });
            } else {
                this.isProcessingQueue = false;
            }
        },

        // --- Core TTS & Navigation ---
        clearHighlights(keepFading = false) {
            const selectors = ['.tts-current-sentence', '.tts-current-word', '.tts-new-paragraph-highlight'];
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
                    const rect = span.getBoundingClientRect();
                    if (rect.top < -50 || rect.bottom > window.innerHeight + 50) {
                        span.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                    }
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
                if (onComplete && (this.continuousReadingActive || this.isProcessingQueue)) {
                    onComplete();
                } else {
                    this.revertParagraph();
                }
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
            if (!this.continuousReadingActive) { this.revertParagraph(); return; }
            if (index < 0 || index >= this.paragraphsList.length) { this.stopTTS(false); return; }
        
            this.currentParagraphIndex = index;
            const para = this.paragraphsList[index];
            this.lastSpokenElement = para.element;
        
            const textToRead = this.prepareParagraphForReading(para.element);
            if (!textToRead) { this.navigate(1); return; }
        
            this.clearHighlights(true);
            para.element.classList.add('tts-current-sentence');
            this.triggerTTS(textToRead, () => this.navigate(1));
        },
        
        stopTTS(notify = true) {
            this.continuousReadingActive = false;
            this.readQueue = [];
            this.isProcessingQueue = false;
            clearTimeout(this.navigationTimeoutId);
            if (this.speechSynthesis.speaking || this.speechSynthesis.pending) {
                this.speechSynthesis.cancel();
            }
            this.revertParagraph();
            if (notify) this.showNotification('All TTS stopped');
            return true;
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

            let currentIndex = this.lastSpokenElement ? this.paragraphsList.findIndex(p => p.element === this.lastSpokenElement) : -1;

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
                this.gentleScrollToElement(targetElement);
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
                } else if (combo && key.toUpperCase() === KEY.TOGGLE_AUTO_READ) {
                    e.preventDefault();
                    if(this.autoReadingEnabled) this.stopAutoReading();
                    else this.startAutoReading();
                }
            });
            window.addEventListener('beforeunload', () => this.stopTTS(false));
        },
        
   






        createUI() {
            const style = document.createElement('style');
            style.textContent = `
                .tts-current-sentence {
                    background-color: rgba(46, 204, 113, 0.08) !important;
                    border-left: 4px solid #2ecc71 !important;
                    border-right: 1px solid #2ecc71 !important;
                    border-bottom: 1px solid #2ecc71 !important;
                    border-top: 1px solid #2ecc71 !important;
                    padding-left: 10px !important;
                }
                .tts-current-word {
                    background-color: rgba(250, 210, 50, 0.9) !important;
                    font-weight: bold !important;
                    color: black !important;
                    border-radius: 3px;
                    transform: scale(1.02);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }
                .tts-navigation-focus {
                    background-color: rgba(52, 152, 219, 0.3) !important;
                    border-left: 4px solid #3498db !important;
                    border-bottom: 1px solid #3498db !important;
                    border-right: 1px solid #3498db !important;
                    border-top: 1px solid #3498db !important;
                    padding-left: 10px !important;
                }
                .tts-focus-fade-out {
                    border-left-color: transparent !important;
                    background-color: transparent !important;
                }

            `;
            document.head.appendChild(style);





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

        gentleScrollToElement(element) {
            if (Date.now() - this.lastScrollTime < 1000) return;
            const rect = element.getBoundingClientRect();
            if (rect.top < 0 || rect.bottom > window.innerHeight) {
                this.lastScrollTime = Date.now();
                element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
        },
    };

    TTSReader.init();

})();