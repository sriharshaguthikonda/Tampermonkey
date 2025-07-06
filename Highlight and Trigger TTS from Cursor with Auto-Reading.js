// ==UserScript==
// @name         Universal TTS Reader with Precision Navigation & Highlighting
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  A robust TTS reader with continuous reading, precise navigation, word-by-word highlighting, and auto-reading of new content on dynamic sites like ChatGPT.
// @author       Your Name (updated by AI)
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const TTSReader = {
        // --- Core State ---
        speechSynthesis: window.speechSynthesis,
        ttsActive: false,
        isPaused: false,
        continuousReadingActive: false, // Flag for continuous reading (manual or auto)
        pageFullyLoaded: false,
        lastScrollTime: 0,
        currentParagraphIndex: -1,
        paragraphsList: [], // The master list of all readable paragraphs on the page
        
        // --- Word Highlighting State ---
        processedParagraph: {
            element: null,
            originalHTML: '',
            wordSpans: []
        },

        // --- Auto-Reading State ---
        autoReadingEnabled: true,
        observer: null,
        knownParagraphs: new Set(), // Tracks paragraphs that have already been seen
        readQueue: [], // Queue for paragraphs to be read automatically
        isProcessingQueue: false,
        checkParagraphsTimeout: null,

        // --- Configuration ---
        CONFIG: {
            // **TUNED FOR CHATGPT**: These selectors are specific to chat interfaces.
            CANDIDATE_SELECTORS: 'div[data-message-author-role="assistant"] .markdown p, div[data-message-author-role="assistant"] .markdown li, div[data-message-author-role="assistant"] .markdown th, div[data-message-author-role="assistant"] .markdown td',
            OBSERVER_ROOT_SELECTOR: '#thread, main', // The element to watch for new content
            IGNORE_SELECTORS: 'nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"], .btn, [role="button"]',
            MIN_TEXT_LENGTH: 10,
            SPEECH_RATE: 1.5,
            SCROLL_THROTTLE_MS: 2000,
            DEBOUNCE_CHECK_MS: 1500, // Wait this long after a DOM change before checking for new text
            HOTKEYS: {
                ACTIVATE: 'U',
                PAUSE_RESUME: 'P',
                NAV_NEXT: 'ArrowRight',
                NAV_PREV: 'ArrowLeft',
                STOP: 'Escape',
                TOGGLE_AUTO_READ: 'A'
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
                        if (this.autoReadingEnabled) {
                            this.startAutoReading();
                        }
                    }
                }, 500);
            });
        },

        waitForPageLoad() {
            if (document.readyState === 'complete') {
                setTimeout(() => { this.pageFullyLoaded = true; }, 1000);
            } else {
                window.addEventListener('load', () => setTimeout(() => { this.pageFullyLoaded = true; }, 2000));
            }
        },

        loadVoices() {
            return new Promise((resolve) => {
                const setAndResolve = () => resolve(this.speechSynthesis.getVoices());
                if (this.speechSynthesis.getVoices().length > 0) {
                    setAndResolve();
                } else {
                    this.speechSynthesis.onvoiceschanged = setAndResolve;
                }
            });
        },
        
        isParagraphElement(element) {
            if (!element || !element.tagName || element.offsetParent === null) return false;
            if (element.closest(this.CONFIG.IGNORE_SELECTORS)) return false;
            return element.innerText.trim().replace(/\s+/g, ' ').length >= this.CONFIG.MIN_TEXT_LENGTH;
        },

        findAllParagraphs() {
            const candidates = Array.from(document.querySelectorAll(this.CONFIG.CANDIDATE_SELECTORS));
            return candidates
                .filter(el => this.isParagraphElement(el))
                .map(element => ({
                    element: element,
                    text: element.innerText.trim().replace(/\s+/g, ' ')
                }));
        },
        
        initParagraphNavigation(isFullRescan = true) {
            this.paragraphsList = this.findAllParagraphs();
            if (isFullRescan) {
                this.knownParagraphs = new Set(this.paragraphsList.map(p => p.text));
                console.log(`TTS Reader: Initialized with ${this.knownParagraphs.size} paragraphs.`);
            }
            const threshold = window.innerHeight * 0.2;
            let startIndex = this.paragraphsList.findIndex(p => p.element.getBoundingClientRect().bottom > threshold);
            this.currentParagraphIndex = startIndex !== -1 ? startIndex : 0;
        },

        clearHighlights() {
            document.querySelectorAll('.tts-current-sentence, .tts-current-word, .tts-auto-read-highlight')
                .forEach(el => el.classList.remove('tts-current-sentence', 'tts-current-word', 'tts-auto-read-highlight'));
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
            const walker = document.createTreeWalker(paraElement, NodeFilter.SHOW_TEXT);
            const nodesToProcess = [];
            while(walker.nextNode()) nodesToProcess.push(walker.currentNode);

            nodesToProcess.forEach(node => {
                if (node.textContent.trim().length === 0) return;
                const fragment = document.createDocumentFragment();
                const parts = node.textContent.split(/(\s+)/);
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
                if (node.parentNode) {
                    node.parentNode.replaceChild(fragment, node);
                }
            });

            this.processedParagraph.wordSpans = wordSpans;
            return paraElement.innerText.trim().replace(/\s+/g, ' ');
        },

        highlightCurrentWord(event) {
            if (event.name !== 'word') return;
            document.querySelector('.tts-current-word')?.classList.remove('tts-current-word');
            
            let charIndex = event.charIndex;
            let accumulatedLength = 0;

            for (const span of this.processedParagraph.wordSpans) {
                const wordLength = span.textContent.length;
                const nextAccumulatedLength = accumulatedLength + wordLength + 1;
                
                if (charIndex >= accumulatedLength && charIndex < nextAccumulatedLength) {
                    span.classList.add('tts-current-word');
                    const rect = span.getBoundingClientRect();
                    if (rect.top < 0 || rect.bottom > window.innerHeight) {
                        span.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                    }
                    return;
                }
                accumulatedLength = nextAccumulatedLength;
            }
        },

        triggerTTS(text, onComplete = null) {
            if (!text) {
                if (onComplete) onComplete();
                return;
            }
            this.ttsActive = true;
            this.isPaused = false;
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = this.CONFIG.SPEECH_RATE;
            const voices = this.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes('Ava')) || voices.find(v => v.lang.startsWith('en'));
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
                this.stopTTS(false);
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
                this.readFromParagraph(index + 1);
                return;
            }
            
            para.element.classList.add('tts-current-sentence');
            this.gentleScrollToElement(para.element);

            // Chain the next paragraph read in the onComplete callback
            this.triggerTTS(textToRead, () => this.readFromParagraph(index + 1));
        },

        // --- Auto-Reading Logic ---
        startAutoReading() {
            if (this.observer) return; // Already running
            this.autoReadingEnabled = true;
            
            const rootNode = document.querySelector(this.CONFIG.OBSERVER_ROOT_SELECTOR);
            if (!rootNode) {
                console.warn("TTS Reader: Could not find observer root. Auto-reading disabled.");
                return;
            }

            this.observer = new MutationObserver(() => {
                clearTimeout(this.checkParagraphsTimeout);
                this.checkParagraphsTimeout = setTimeout(() => this.checkForNewParagraphs(), this.CONFIG.DEBOUNCE_CHECK_MS);
            });

            this.observer.observe(rootNode, { childList: true, subtree: true });
            this.showNotification('Auto-reading enabled');
        },

        stopAutoReading() {
            if (!this.observer) return; // Already stopped
            this.autoReadingEnabled = false;
            this.observer.disconnect();
            this.observer = null;
            this.readQueue = [];
            this.isProcessingQueue = false;
            this.showNotification('Auto-reading disabled');
        },

        checkForNewParagraphs() {
            const currentParagraphs = this.findAllParagraphs();
            currentParagraphs.forEach(p => {
                if (!this.knownParagraphs.has(p.text)) {
                    this.knownParagraphs.add(p.text);
                    this.readQueue.push(p);
                    console.log('TTS Reader: Queued new paragraph.', p.text.substring(0, 50));
                }
            });
            if (!this.isProcessingQueue) this.processReadQueue();
        },

        processReadQueue() {
            if (this.readQueue.length === 0 || !this.autoReadingEnabled) {
                this.isProcessingQueue = false;
                return;
            }
            this.isProcessingQueue = true;
            const paraInfo = this.readQueue.shift();

            // Find the paragraph in the main list to get its index
            const paraIndex = this.paragraphsList.findIndex(p => p.element === paraInfo.element);
            if (paraIndex === -1) {
                // The element might be new, rescan and find it.
                this.initParagraphNavigation(false);
                const newIndex = this.paragraphsList.findIndex(p => p.element === paraInfo.element);
                 if (newIndex !== -1) {
                    this.goToParagraph(newIndex, true);
                 }
            } else {
                 this.goToParagraph(paraIndex, true);
            }
            
            // Highlight it to show it's from auto-read
            paraInfo.element.classList.add('tts-auto-read-highlight');
            // The read chain will handle the rest.
        },

        // --- Controls ---
        stopTTS(notify = true) {
            this.continuousReadingActive = false;
            this.readQueue = [];
            this.isProcessingQueue = false;
            
            if (this.speechSynthesis.speaking || this.speechSynthesis.pending) {
                this.speechSynthesis.cancel(); // This will trigger onend handlers
                if (notify) this.showNotification('All TTS stopped');
            }
            this.revertParagraph();
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

        goToParagraph(index, isAuto = false) {
            if (index < 0 || index >= this.paragraphsList.length) {
                this.stopTTS(false);
                return;
            };
            // If reading is already active, let it finish. Only interrupt if it's a manual override.
            if(this.ttsActive && !isAuto) {
                this.stopTTS(false); 
            }
            this.continuousReadingActive = true;
            this.readFromParagraph(index);
        },

        setupEventListeners() {
            document.addEventListener('keydown', (e) => {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;

                const KEY = this.CONFIG.HOTKEYS;
                const combo = e.ctrlKey && e.shiftKey;

                let handled = true;
                if (combo && e.key.toUpperCase() === KEY.ACTIVATE) {
                    if (this.speechSynthesis.speaking) { this.stopTTS(); return; }
                    this.showNotification('Click where you want to start reading');
                    document.addEventListener('click', (ev) => {
                        ev.preventDefault(); ev.stopPropagation();
                        this.initParagraphNavigation(); 
                        const clickedElement = ev.target;
                        const startParaIndex = this.paragraphsList.findIndex(p => p.element.contains(clickedElement));
                        if (startParaIndex !== -1) this.goToParagraph(startParaIndex);
                    }, { once: true, capture: true });
                } else if (combo && e.key.toUpperCase() === KEY.PAUSE_RESUME) {
                    this.pauseResumeTTS();
                } else if (combo && e.key.toUpperCase() === KEY.TOGGLE_AUTO_READ) {
                    this.autoReadingEnabled ? this.stopAutoReading() : this.startAutoReading();
                } else if (e.key === KEY.NAV_NEXT) {
                    this.goToParagraph(this.currentParagraphIndex + 1);
                } else if (e.key === KEY.NAV_PREV) {
                    this.goToParagraph(this.currentParagraphIndex - 1);
                } else if (e.key === KEY.STOP) {
                    this.stopTTS();
                } else {
                    handled = false;
                }
                if(handled) e.preventDefault();
            });
            window.addEventListener('beforeunload', () => this.stopTTS(false));
        },
        
        // --- UI & Utilities ---
        createUI() {
            const style = document.createElement('style');
            style.textContent = `
                .tts-current-sentence { background-color: rgba(0, 255, 0, 0.2) !important; transition: background-color 0.3s; }
                .tts-current-word { background-color: rgba(255, 255, 0, 0.7) !important; color: black !important; border-radius: 3px; box-shadow: 0 0 5px rgba(0,0,0,0.3); }
                .tts-auto-read-highlight { background-color: rgba(0, 150, 255, 0.2) !important; animation: tts-pulse 1.5s 2; }
                @keyframes tts-pulse { 50% { background-color: rgba(0, 150, 255, 0.4); } }
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
                origLeft = el.offsetLeft;
                origTop = el.offsetTop;
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
            if (rect.top < 0 || rect.bottom > window.innerHeight) {
                this.lastScrollTime = Date.now();
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        },
    };

    TTSReader.init();

})();