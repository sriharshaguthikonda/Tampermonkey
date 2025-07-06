// ==UserScript==
// @name         Universal TTS Reader with Precision Navigation & Highlighting
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  A highly accurate TTS reader with continuous reading, precise navigation on complex sites, preview highlights, and word-by-word highlighting.
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
        lastSpokenElement: null,
        navigationTimeoutId: null,
        processedParagraph: {
            element: null,
            originalHTML: '',
            wordSpans: []
        },

        CONFIG: {
            CANDIDATE_SELECTORS: 'p, li, h1, h2, h3, h4, h5, h6, td, th, pre, .markdown, div[class*="content"], article',
            IGNORE_SELECTORS: 'nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"], [data-message-author-role="user"]',
            MIN_TEXT_LENGTH: 20,
            SPEECH_RATE: 1.3, // CHANGED: Lowered default speed for more comfortable initial use.
            SCROLL_THROTTLE_MS: 1500,
            NAV_READ_DELAY_MS: 650, // CHANGED: Increased delay for a more deliberate navigation feel.
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
            this.loadVoices();
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
                const voices = this.speechSynthesis.getVoices();
                if (voices.length > 0) resolve(voices);
                else this.speechSynthesis.onvoiceschanged = () => resolve(this.speechSynthesis.getVoices());
            });
        },

        getTextFromElement(element) {
            if (!element) return '';
            return element.innerText.trim().replace(/\s+/g, ' ');
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
                    if (el !== otherEl && el.contains(otherEl)) {
                        return false;
                    }
                }
                return true;
            });

            return finalParagraphs.map(element => ({
                element: element,
                text: this.getTextFromElement(element)
            }));
        },

        clearHighlights() {
            document.querySelectorAll('.tts-current-sentence, .tts-current-word, .tts-navigation-focus').forEach(el => {
                el.classList.remove('tts-current-sentence', 'tts-current-word', 'tts-navigation-focus');
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
                if (node.parentNode) node.parentNode.replaceChild(fragment, node);
            });

            this.processedParagraph.wordSpans = wordSpans;
            return paraElement.innerText.trim().replace(/\s+/g, ' ');
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
                    if (rect.top < 0 || rect.bottom > window.innerHeight) {
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
                if (onComplete && this.continuousReadingActive) {
                    onComplete();
                } else {
                    this.revertParagraph();
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
        
            this.clearHighlights();
            para.element.classList.add('tts-current-sentence');
            this.gentleScrollToElement(para.element);
            
            this.triggerTTS(textToRead, () => this.navigate(1));
        },
        
        stopTTS(notify = true) {
            this.continuousReadingActive = false;
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
            this.stopTTS(false);
            
            this.paragraphsList = this.findAllParagraphs();
            if (this.paragraphsList.length === 0) {
                this.showNotification("No readable text found.");
                return;
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
                this.clearHighlights();
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

        startReadingAtElement(element) {
            this.stopTTS(false);
            this.paragraphsList = this.findAllParagraphs();
            
            const startParaIndex = this.paragraphsList.findIndex(p => p.element.contains(element));
            if (startParaIndex !== -1) {
                this.continuousReadingActive = true;
                this.readFromParagraph(startParaIndex);
            } else {
                this.showNotification('No readable text found there.');
            }
        },

        setupEventListeners() {
            document.addEventListener('keydown', (e) => {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                    return;
                }

                const key = e.key;
                const combo = e.ctrlKey && e.shiftKey;
                const KEY = this.CONFIG.HOTKEYS;

                switch (key) {
                    case KEY.NAV_NEXT:
                        e.preventDefault();
                        this.navigate(1);
                        break;
                    case KEY.NAV_PREV:
                        e.preventDefault();
                        this.navigate(-1);
                        break;
                    case KEY.STOP:
                        e.preventDefault();
                        this.stopTTS();
                        break;
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
                        this.startReadingAtElement(ev.target);
                    };
                    document.addEventListener('click', clickHandler, { once: true, capture: true });
                } else if (combo && key.toUpperCase() === KEY.PAUSE_RESUME) {
                    e.preventDefault();
                    this.pauseResumeTTS();
                }
            });
            window.addEventListener('beforeunload', () => this.stopTTS(false));
        },
        




        createUI() {
            const style = document.createElement('style');
            style.textContent = `
                .tts-current-sentence {
                    background-color: rgba(20, 180, 20, 0.15) !important;
                    border-left: 4px solid rgba(0, 255, 0, 1) !important;
                    padding-left: 8px !important;
                    outline: 1px solid rgba(20, 180, 20, 0.4) !important;
                    transition: all 0.3s ease-in-out !important;
                }
                .tts-current-word {
                    background-color: rgba(255, 255, 0, 0.85) !important;
                    border-left: 4px solid rgba(238, 255, 0, 1) !important;
                    color: black !important;
                    border-radius: 3px;
                }
                .tts-navigation-focus {
                    background-color: rgba(0, 123, 255, 0.3) !important;
                    outline: 2px solid rgba(0, 123, 255, 0.9) !important;
                    border-left: 4px solid #3498db !important;
                    padding-left: 8px !important;
                    box-shadow: 0 0 12px rgba(0, 123, 255, 0.7) !important;
                    transition: all 0.1s ease-in-out !important;
                    animation: tts-pulse 0.5s infinite ease-in-out;
                }
                @keyframes tts-pulse {
                    0% { background-color: rgba(0, 123, 255, 0.15); box-shadow: 0 0 8px rgba(0, 123, 255, 0.4); }
                    50% { background-color: rgba(0, 123, 255, 0.25); box-shadow: 0 0 16px rgba(0, 123, 255, 0.7); }
                    100% { background-color: rgba(0, 123, 255, 0.15); box-shadow: 0 0 8px rgba(0, 123, 255, 0.4); }
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















##       ######## ######## ####  ######      ######  ######## ########    ##     ##  #######  ##      ##    ##     ## ######## ########   ######   #### ##    ##  ######      ##      ##  #######  ########  ##    ##  ######      
##       ##          ##    #### ##    ##    ##    ## ##       ##          ##     ## ##     ## ##  ##  ##    ###   ### ##       ##     ## ##    ##   ##  ###   ## ##    ##     ##  ##  ## ##     ## ##     ## ##   ##  ##    ##     
##       ##          ##     ##  ##          ##       ##       ##          ##     ## ##     ## ##  ##  ##    #### #### ##       ##     ## ##         ##  ####  ## ##           ##  ##  ## ##     ## ##     ## ##  ##   ##           
##       ######      ##    ##    ######      ######  ######   ######      ######### ##     ## ##  ##  ##    ## ### ## ######   ########  ##   ####  ##  ## ## ## ##   ####    ##  ##  ## ##     ## ########  #####     ######      
##       ##          ##               ##          ## ##       ##          ##     ## ##     ## ##  ##  ##    ##     ## ##       ##   ##   ##    ##   ##  ##  #### ##    ##     ##  ##  ## ##     ## ##   ##   ##  ##         ##     
##       ##          ##         ##    ##    ##    ## ##       ##          ##     ## ##     ## ##  ##  ##    ##     ## ##       ##    ##  ##    ##   ##  ##   ### ##    ##     ##  ##  ## ##     ## ##    ##  ##   ##  ##    ## ### 
######## ########    ##          ######      ######  ######## ########    ##     ##  #######   ###  ###     ##     ## ######## ##     ##  ######   #### ##    ##  ######       ###  ###   #######  ##     ## ##    ##  ######  ### 