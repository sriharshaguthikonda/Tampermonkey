// ==UserScript==
// @name         *** Highlight and Trigger TTS from Cursor with Auto-Reading
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Add a highlight class to text under cursor, trigger Edge TTS, and auto-read new paragraphs
// @author       Your Name
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let speechSynthesis = window.speechSynthesis;
    let currentUtterance = null;
    let ttsActive = false;
    let highlightedElements = [];
    let textNodes = [];
    let currentWordIndex = 0;
    let lastScrollTime = 0;
    let scrollThrottle = 6000; // Only scroll every 6 seconds

    // New paragraph monitoring variables
    let autoReadingEnabled = true; // DEFAULT: Auto-reading enabled by default
    let observer = null;
    let lastParagraphCount = 0;
    let knownParagraphs = new Set();
    let readQueue = [];
    let isProcessingQueue = false;
    let pageFullyLoaded = false; // NEW: Track if page is fully loaded
    let autoReadingCurrentUtterance = null; // NEW: Track auto-reading TTS separately


    // For paragraph navigation
    let paragraphsList = [];
    let currentParagraphIndex = -1;




    // NEW: Wait for page to be fully loaded before enabling auto-reading
    function waitForPageLoad() {
        if (document.readyState === 'complete') {
            pageFullyLoaded = true;
            console.log('Page fully loaded, auto-reading can now detect new paragraphs');
        } else {
            window.addEventListener('load', () => {
                // Add a small delay to ensure all dynamic content is loaded
                setTimeout(() => {
                    pageFullyLoaded = true;
                    console.log('Page fully loaded, auto-reading can now detect new paragraphs');
                }, 2000); // 2 second delay after load event
            });
        }
    }

   // —— New: Find nearest paragraph based on viewport ——
    function findNearestParagraphIndex() {
        const threshold = window.innerHeight * 0.2;
        for (let i = 0; i < paragraphsList.length; i++) {
            const rect = paragraphsList[i].element.getBoundingClientRect();
            if (rect.bottom > threshold) {
                return i;
            }
        }
        return 0;
    }

    // —— New: Initialize navigation ——
    function initParagraphNavigation() {
        paragraphsList = findAllParagraphs();
        currentParagraphIndex = findNearestParagraphIndex();
        console.log('Starting navigation at paragraph index', currentParagraphIndex);
    }

    // NEW: Function to apply a visual highlight to the currently active paragraph
    function highlightParagraph(index) {
        // First, remove the highlight from all paragraphs to ensure only one is active
        if (paragraphsList && paragraphsList.length > 0) {
            paragraphsList.forEach(p => {
                if (p.element) {
                    p.element.classList.remove('tts-current-sentence');
                }
            });
        }

        // Now, apply the highlight to the specified paragraph
        if (index >= 0 && index < paragraphsList.length) {
            const para = paragraphsList[index];
            if (para && para.element) {
                para.element.classList.add('tts-current-sentence');
            }
        }
    }

    // —— MODIFIED: Navigate to a paragraph, read it, and chain to the next one ——
    function goToParagraph(index) {
        // Ensure the requested index is valid
        if (index < 0 || index >= paragraphsList.length) {
            return;
        }

        // Update the global state to the new paragraph index
        currentParagraphIndex = index;

        const para = paragraphsList[index];
        if (!para || !para.element) return;

        // Stop any currently playing speech
        stopTTS();

        // Apply highlight and scroll to the new paragraph
        highlightParagraph(currentParagraphIndex);
        gentleScrollToElement(para.element);

        // Define a completion callback for when the TTS finishes
        const onReadingComplete = () => {
            // Check if auto-reading is still enabled and if we are not on the last paragraph
            if (autoReadingEnabled && currentParagraphIndex < paragraphsList.length - 1) {
                // Automatically proceed to the next paragraph
                goToParagraph(currentParagraphIndex + 1);
            }
        };

        // Start reading the paragraph's text and provide the callback
        triggerTTSForText(para.text, onReadingComplete, true);
    }

    // Paragraph navigation is now initialized at the end of the script, after all functions are defined.

    // —— Arrow key handling ——
    document.addEventListener('keydown', function(e) {
        // Only process arrow keys if we have paragraphs
        if (paragraphsList.length === 0) return;

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (currentParagraphIndex < paragraphsList.length - 1) {
                goToParagraph(currentParagraphIndex + 1);
            } else {
                // Already at last paragraph
                showNotification('Reached the end of the document', 1000);
                // Add a subtle visual cue
                const lastPara = paragraphsList[paragraphsList.length - 1];
                if (lastPara && lastPara.element) {
                    lastPara.element.classList.add('tts-boundary-hit');
                    setTimeout(() => {
                        lastPara.element.classList.remove('tts-boundary-hit');
                    }, 500);
                }
            }
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (currentParagraphIndex > 0) {
                goToParagraph(currentParagraphIndex - 1);
            } else {
                // Already at first paragraph
                showNotification('Already at the beginning of the document', 1000);
                // Add a subtle visual cue
                const firstPara = paragraphsList[0];
                if (firstPara && firstPara.element) {
                    firstPara.element.classList.add('tts-boundary-hit');
                    setTimeout(() => {
                        firstPara.element.classList.remove('tts-boundary-hit');
                    }, 500);
                }
            }
        }
    });

    // The main initialization logic is at the end of the script.





    function getTextFromCursor(e) {
        let range;
        if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(e.clientX, e.clientY);
        } else if (document.caretPositionFromPoint) {
            const position = document.caretPositionFromPoint(e.clientX, e.clientY);
            range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
        }

        if (range) {
            const node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) {
                const parent = node.parentNode;

                // Add highlight classes
                parent.classList.add('msreadout-line-highlight','msreadout-word-highlight','msreadout-inactive-highlight');

                // Remove highlight after 5 seconds
                setTimeout(() => {
                    parent.classList.remove('msreadout-line-highlight','msreadout-inactive-highlight','msreadout-word-highlight');
                }, 5000);

                // Get text from cursor position to end of paragraph/element
                const textContent = node.textContent;
                const cursorOffset = range.startOffset;
                const textFromCursor = textContent.substring(cursorOffset);

                // Get all text from cursor position to end of page
                return getAllTextFromCursor(parent, cursorOffset, node);
            }
        }
        return null;
    }

    function getAllTextFromCursor(startElement, offset, textNode) {
        let allText = '';
        textNodes = []; // Reset text nodes array

        // Get remaining text from current text node
        const remainingText = textNode.textContent.substring(offset);
        allText += remainingText;

        // Store the starting text node info
        if (remainingText.trim().length > 0) {
            textNodes.push({
                node: textNode,
                text: remainingText,
                startOffset: offset,
                endOffset: textNode.textContent.length
            });
        }

        // Get all remaining text on the page
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip script, style, and hidden elements
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;

                    const style = window.getComputedStyle(parent);
                    if (style.display === 'none' || style.visibility === 'hidden') {
                        return NodeFilter.FILTER_REJECT;
                    }

                    const tagName = parent.tagName.toLowerCase();
                    if (['script', 'style', 'noscript', 'head'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        // Find the starting position
        let foundStart = false;
        let currentNode;

        while (currentNode = walker.nextNode()) {
            if (currentNode === textNode) {
                foundStart = true;
                continue; // Skip the starting node as we already got its remaining text
            }

            if (foundStart) {
                const text = currentNode.textContent.trim();
                if (text.length > 0) {
                    allText += ' ' + text;
                    textNodes.push({
                        node: currentNode,
                        text: text,
                        startOffset: 0,
                        endOffset: currentNode.textContent.length
                    });
                }
            }
        }

        return allText.trim();
    }

    // Function to get text content from an element
    function getTextFromElement(element) {
        const text = element.textContent || element.innerText;
        return text.trim();
    }

    // Function to identify paragraph-like elements - FOCUSED ON ELEMENTS WITH data-start AND data-end ATTRIBUTES
    function isParagraphElement(element) {
        if (!element || !element.tagName) return false;

        // NEW: Only consider elements that have both data-start and data-end attributes
        const hasDataStart = element.hasAttribute('data-start');
        const hasDataEnd = element.hasAttribute('data-end');

        if (!hasDataStart || !hasDataEnd) return false; // Skip elements without both attributes

        const tagName = element.tagName.toLowerCase();

        // Focus on actual content paragraphs
        if (tagName === 'p') {
            const text = getTextFromElement(element);
            // Only consider paragraphs with substantial text content
            return text.length > 10 && !text.match(/^\s*$/) && !element.querySelector('script, style');
        }

        // Also include headers for context
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
            const text = getTextFromElement(element);
            return text.length > 5;
        }

        // Include divs and other elements that might contain content
        if (['div', 'span', 'section', 'article'].includes(tagName)) {
            const text = getTextFromElement(element);
            return text.length > 10 && !text.match(/^\s*$/) && !element.querySelector('script, style');
        }

        return false;
    }

    // Function to find all current paragraphs - FOCUSED ON ELEMENTS WITH data-start AND data-end ATTRIBUTES
    function findAllParagraphs() {
        console.log('Finding all paragraphs on ChatGPT page...');
        // This selector is specifically for ChatGPT message blocks.
        const elements = Array.from(document.querySelectorAll('div[data-message-id]'));

        console.log(`Found ${elements.length} potential paragraph elements.`);

        const paragraphs = elements
            .map((el, index) => {
                // Within a message block, find the main content, avoiding buttons or other UI elements.
                // The actual text is often in a div with a class like 'markdown'.
                const contentElement = el.querySelector('.markdown') || el;
                const text = getTextFromElement(contentElement);

                // Filter out system messages or elements with no readable text.
                if (text.length < 20) return null;

                return {
                    id: el.getAttribute('data-message-id') || `para-${index}`, // Use message ID as a stable ID
                    element: el,
                    text: text,
                };
            })
            .filter(Boolean); // Remove null entries

        console.log(`Found ${paragraphs.length} valid paragraphs.`);
        return paragraphs;
    }

    // MODIFIED: Check for new paragraphs and queue them for reading
    function checkForNewParagraphs() {
        if (!autoReadingEnabled || !pageFullyLoaded) return; // Only check if page is fully loaded

        const currentParagraphs = findAllParagraphs();
        const newParagraphs = [];

        currentParagraphs.forEach(paragraph => {
            if (!knownParagraphs.has(paragraph.id)) {
                newParagraphs.push(paragraph);
                knownParagraphs.add(paragraph.id);
                console.log('New paragraph detected:', paragraph.id, paragraph.text.substring(0, 50) + '...');
            }
        });

        if (newParagraphs.length > 0) {
            console.log(`Found ${newParagraphs.length} new paragraph(s)`);
            newParagraphs.forEach(paragraph => {
                readQueue.push(paragraph);
            });
            processReadQueue();
        }
    }

    // Process the queue of paragraphs to read
    function processReadQueue() {
        if (isProcessingQueue || readQueue.length === 0 || !autoReadingEnabled) return;

        isProcessingQueue = true;
        const paragraph = readQueue.shift();

        if (paragraph && paragraph.text) {
            console.log('Auto-reading new paragraph:', paragraph.text.substring(0, 100) + '...');

            // Highlight the new paragraph
            paragraph.element.classList.add('new-paragraph-highlight');
            setTimeout(() => {
                paragraph.element.classList.remove('new-paragraph-highlight');
            }, 3000);

            // Read the paragraph
            triggerTTSForText(paragraph.text, () => {
                // When this paragraph is done, process the next one
                isProcessingQueue = false;
                setTimeout(() => processReadQueue(), 500); // Small delay between paragraphs
            }, true); // Pass true to indicate this is auto-reading
        } else {
            isProcessingQueue = false;
        }
    }

   /*
 * Fix for missing highlighting during TTS:
 * The script never listens for Web Speech API boundary events,
 * so `highlightCurrentText` is never invoked. Add `onboundary`.
 */

    let speechRate = 1.5;

    function triggerTTSForText(text, onComplete = null, isAutoReading = false) {
        if (!text || text.length === 0) {
            console.log('No text to read');
            if (onComplete) onComplete();
            return;
        }

        // Stop any current speech
        speechSynthesis.cancel();
        currentUtterance = null;
        autoReadingCurrentUtterance = null;

        // Create utterance
        const utterance = new SpeechSynthesisUtterance(text);

        // Configure voice, rate, pitch, volume as before...
        utterance.rate = speechRate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        const voices = speechSynthesis.getVoices();
        const avaVoice = voices.find(v => v.name.includes('Ava') && !v.name.includes('Multilingual'));
        utterance.voice = avaVoice || voices.find(v => v.lang.startsWith('en') && !v.name.includes('Multilingual'));

        // NEW: Highlight words/sentences as they are spoken
        utterance.onboundary = function(event) {
            if (event.name === 'word' || event.name === 'sentence') {
                highlightCurrentText(event.charIndex, event.charLength);
            }
        };

        // onstart, onend, onerror handlers remain unchanged
        utterance.onstart = () => { if (!isAutoReading) ttsActive = true; };
        utterance.onend = () => {
            if (isAutoReading) autoReadingCurrentUtterance = null;
            else {
                currentUtterance = null;
                ttsActive = false;
                clearHighlights();
            }
            if (onComplete) onComplete();
        };
        utterance.onerror = () => {
            if (isAutoReading) autoReadingCurrentUtterance = null;
            else {
                currentUtterance = null;
                ttsActive = false;
                clearHighlights();
            }
            if (onComplete) onComplete();
        };

        // Track utterance for manual vs. auto
        if (isAutoReading) {
            autoReadingCurrentUtterance = utterance;
        } else {
            currentUtterance = utterance;
        }

        speechSynthesis.speak(utterance);
    }



    function triggerTTS(text) {
        triggerTTSForText(text);
        console.log('Reading from cursor to end of page. Text length:', text.length, 'characters');
        console.log('First 100 characters:', text.substring(0, 100) + '...');
    }

    // MODIFIED: Start monitoring for new paragraphs
    function startAutoReading() {
        if (autoReadingEnabled && observer) return; // Already running

        autoReadingEnabled = true;

        // Wait for page to be fully loaded before initializing
        if (!pageFullyLoaded) {
            console.log('Waiting for page to fully load before starting auto-reading...');
            return;
        }

        // Initialize paragraph navigation first, which finds all paragraphs and sets the starting index.
        initParagraphNavigation();

        // Now, initialize the set of known paragraphs for the auto-reader, using the list we just created.
        console.log('Initializing known paragraphs...');
        knownParagraphs.clear();
        paragraphsList.forEach(paragraph => {
            knownParagraphs.add(paragraph.id);
            console.log('Added to known:', paragraph.id, paragraph.text.substring(0, 30) + '...');
        });
        console.log(`Initialized with ${knownParagraphs.size} known paragraphs`);

        // Set up DOM observer - FOCUSED ON ELEMENTS WITH data-start AND data-end ATTRIBUTES
        observer = new MutationObserver((mutations) => {
            if (!pageFullyLoaded) return; // Don't process mutations until page is loaded

            let shouldCheck = false;

            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if any added nodes have data-start and data-end attributes
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if the added node itself has both attributes
                            const hasDataAttributes = node.hasAttribute &&
                                                    node.hasAttribute('data-start') &&
                                                    node.hasAttribute('data-end');

                            // Check if the added node contains elements with both attributes
                            const hasChildrenWithDataAttributes = node.querySelector &&
                                                                node.querySelector('[data-start][data-end]');

                            if (hasDataAttributes || hasChildrenWithDataAttributes) {
                                const text = getTextFromElement(node);
                                if (text.length > 10) {
                                    shouldCheck = true;
                                    const dataStart = node.getAttribute('data-start') || 'inherited';
                                    const dataEnd = node.getAttribute('data-end') || 'inherited';
                                    console.log(`Detected element with data attributes change: data-start="${dataStart}" data-end="${dataEnd}": ${text.substring(0, 50)}...`);
                                }
                            }
                        }
                    });
                }

                // Also check for attribute changes on existing elements
                if (mutation.type === 'attributes' &&
                    (mutation.attributeName === 'data-start' || mutation.attributeName === 'data-end')) {
                    const element = mutation.target;
                    if (element.hasAttribute('data-start') && element.hasAttribute('data-end')) {
                        const text = getTextFromElement(element);
                        if (text.length > 10) {
                            shouldCheck = true;
                            const dataStart = element.getAttribute('data-start');
                            const dataEnd = element.getAttribute('data-end');
                            console.log(`Detected data attribute change: data-start="${dataStart}" data-end="${dataEnd}": ${text.substring(0, 50)}...`);
                        }
                    }
                }
            });

            if (shouldCheck) {
                // Debounce the check to avoid too frequent calls
                clearTimeout(checkForNewParagraphs.timeout);
                checkForNewParagraphs.timeout = setTimeout(checkForNewParagraphs, 1000);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true, // NEW: Also observe attribute changes
            attributeFilter: ['data-start', 'data-end'] // NEW: Only observe these specific attributes
        });

        console.log('Auto-reading monitoring started');
        showNotification('Auto-reading enabled - new paragraphs will be read automatically');
    }

    // Stop monitoring for new paragraphs
    function stopAutoReading() {
        if (!autoReadingEnabled) return;

        autoReadingEnabled = false;

        if (observer) {
            observer.disconnect();
            observer = null;
        }

        // Clear the queue
        readQueue = [];
        isProcessingQueue = false;

        // NEW: Stop auto-reading TTS if it's currently speaking
        if (autoReadingCurrentUtterance) {
            speechSynthesis.cancel();
            autoReadingCurrentUtterance = null;
        }

        console.log('Auto-reading disabled');
        showNotification('Auto-reading disabled');
    }

    function handleMouseClick(e) {
        const text = getTextFromCursor(e);
        if (text) {
            triggerTTS(text);
        }
    }

    // Load voices (some browsers need this)
    function loadVoices() {
        return new Promise((resolve) => {
            const voices = speechSynthesis.getVoices();
            if (voices.length > 0) {
                resolve(voices);
            } else {
                speechSynthesis.onvoiceschanged = () => {
                    resolve(speechSynthesis.getVoices());
                };
            }
        });
    }

    // Add CSS for boundary hit effect
    const boundaryHitStyle = document.createElement('style');
    boundaryHitStyle.textContent = `
        .tts-boundary-hit {
            animation: boundaryPulse 0.5s ease-in-out;
        }
        @keyframes boundaryPulse {
            0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.2); }
            50% { box-shadow: 0 0 0 10px rgba(255, 0, 0, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
        }
    `;
    document.head.appendChild(boundaryHitStyle);

    // Initialize and show available voices
    loadVoices().then(() => {
        const voices = speechSynthesis.getVoices();
        console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));

        const avaVoice = voices.find(voice =>
            voice.name.includes('Ava') &&
            !voice.name.includes('Multilingual')
        );

        if (avaVoice) {
            console.log('✓ Ava voice found:', avaVoice.name);
        } else {
            console.log('✗ Ava voice not found');
        }

        // NEW: Initialize page loading detection
        waitForPageLoad();

        // Start auto-reading monitoring after voices are loaded and page is ready
        if (pageFullyLoaded) {
            startAutoReading();
        } else {
            // Set up a check to start auto-reading when page is loaded
            const checkPageLoaded = setInterval(() => {
                if (pageFullyLoaded) {
                    startAutoReading();
                    clearInterval(checkPageLoaded);
                }
            }, 1000);
        }
    });

    function isElementInViewport(element) {
        const rect = element.getBoundingClientRect();
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        const windowWidth = window.innerWidth || document.documentElement.clientWidth;

        // Check if element is reasonably visible (at least 30% in viewport)
        const verticalInView = rect.top <= windowHeight * 0.7 && rect.bottom >= windowHeight * 0.3;
        const horizontalInView = rect.left <= windowWidth && rect.right >= 0;

        return verticalInView && horizontalInView;
    }

    function gentleScrollToElement(element) {
        const now = Date.now();

        // Throttle scrolling - only scroll if enough time has passed
        if (now - lastScrollTime < scrollThrottle) {
            return;
        }

        // Only scroll if element is not reasonably visible
        if (!isElementInViewport(element)) {
            lastScrollTime = now;

            element.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest'
            });
        }
    }

    function clearHighlights() {
        highlightedElements.forEach(element => {
            element.classList.remove('tts-current-word', 'tts-current-sentence');
        });
        highlightedElements = [];
    }

    function highlightCurrentText(charIndex, length) {
        // Find which text node contains the current character
        let currentCharCount = 0;
        let targetNode = null;
        let relativeIndex = 0;

        for (let i = 0; i < textNodes.length; i++) {
            const nodeInfo = textNodes[i];
            const nodeTextLength = nodeInfo.text.length;

            if (currentCharCount + nodeTextLength >= charIndex) {
                targetNode = nodeInfo;
                relativeIndex = charIndex - currentCharCount;
                break;
            }
            currentCharCount += nodeTextLength + 1; // +1 for space between nodes
        }

        if (targetNode) {
            clearHighlights();

            // Highlight the parent element
            const parentElement = targetNode.node.parentElement;
            if (parentElement) {
                parentElement.classList.add('tts-current-sentence');
                highlightedElements.push(parentElement);

                // Gentle scroll to the highlighted element
                gentleScrollToElement(parentElement);
            }
        }
    }

    // MODIFIED: Stop TTS function that handles both manual and auto-reading
    function stopTTS() {
        let stoppedSomething = false;

        // Stop manual TTS
        if (currentUtterance || ttsActive) {
            speechSynthesis.cancel();
            currentUtterance = null;
            ttsActive = false;
            document.body.style.cursor = 'default';
            clearHighlights();
            console.log('Manual TTS stopped');
            stoppedSomething = true;
        }

        // Stop auto-reading TTS
        if (autoReadingCurrentUtterance) {
            speechSynthesis.cancel();
            autoReadingCurrentUtterance = null;
            console.log('Auto-reading TTS stopped');
            stoppedSomething = true;
        }

        // Stop auto-reading queue processing
        if (isProcessingQueue) {
            isProcessingQueue = false;
            readQueue = []; // Clear the queue
            console.log('Auto-reading queue stopped and cleared');
            stoppedSomething = true;
        }

        if (stoppedSomething) {
            showNotification('All TTS stopped');
        }

        return stoppedSomething;
    }

    // MODIFIED: Listen for Ctrl + Shift + U to toggle TTS (now stops everything)
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'U') {
            e.preventDefault();

            // Stop all TTS activity first
            if (stopTTS()) {
                return; // If something was stopped, don't activate new TTS
            }

            // Otherwise, activate TTS mode
            console.log('TTS mode activated - click where you want to start reading to end of page');

            // Add one-time mouse click listener
            document.addEventListener('click', handleMouseClick, { once: true });

            // Visual feedback
            document.body.style.cursor = 'crosshair';

            // Show notification
            showNotification('Click where you want to start reading to end of page');

            // Auto-cancel crosshair mode after 10 seconds
            setTimeout(() => {
                document.body.style.cursor = 'default';
            }, 10000);
        }

        // Listen for Ctrl + Shift + A to toggle auto-reading
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();

            if (autoReadingEnabled) {
                stopAutoReading();
            } else {
                startAutoReading();
            }
        }

        // Stop TTS with Escape key
        if (e.key === 'Escape') {
            stopTTS();
        }
    });

    // Visual notification function
    function showNotification(message, duration = 3000) {
        // Remove any existing notification
        const existing = document.getElementById('tts-notification');
        if (existing) {
            document.body.removeChild(existing);
        }

        const notification = document.createElement('div');
        notification.id = 'tts-notification';
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.left = '50%';
        notification.style.transform = 'translateX(-50%)';
        notification.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '5px';
        notification.style.zIndex = '10000';
        notification.style.transition = 'opacity 0.3s';
        notification.style.fontFamily = 'Arial, sans-serif';
        notification.style.fontSize = '14px';
        notification.style.pointerEvents = 'none';
        notification.style.whiteSpace = 'nowrap';
        notification.style.maxWidth = '90%';
        notification.style.overflow = 'hidden';
        notification.style.textOverflow = 'ellipsis';

        document.body.appendChild(notification);

        // Auto-remove after specified duration (default 3 seconds)
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        document.body.removeChild(notification);
                    }
                }, 300);
            }
        }, duration);
    }

    document.addEventListener('beforeunload', () => {
        stopTTS();
    });

    window.addEventListener('pagehide', () => {
        stopTTS();
    });

    // Add CSS for highlighting
    const style = document.createElement('style');
    style.textContent = `
        .msreadout-line-highlight {
            background-color: rgba(255, 255, 0, 0.3) !important;
        }
        .msreadout-word-highlight {
            background-color: rgba(255, 255, 0, 0.5) !important;
        }
        .msreadout-inactive-highlight {
            background-color: rgba(255, 255, 0, 0.2) !important;
        }
        .tts-current-sentence {
            background-color: rgba(0, 255, 0, 0.3) !important;
            border-left: 4px solid #00ff00 !important;
            padding-left: 5px !important;
            transition: all 0.3s ease !important;
        }
        .tts-current-word {
            background-color: rgba(255, 255, 0, 0.6) !important;
            border-radius: 3px !important;
            padding: 2px !important;
            transition: all 0.2s ease !important;
        }
        .new-paragraph-highlight {
            background-color: rgba(0, 150, 255, 0.4) !important;
            border-left: 4px solid #0096ff !important;
            padding-left: 5px !important;
            transition: all 0.3s ease !important;
            animation: pulse 1s ease-in-out 3 !important;
        }
        @keyframes pulse {
            0% { background-color: rgba(0, 150, 255, 0.4); }
            50% { background-color: rgba(0, 150, 255, 0.6); }
            100% { background-color: rgba(0, 150, 255, 0.4); }
        }
    `;
    document.head.appendChild(style);

    // ——— TTS Control Panel UI ———
    const uiPanel = document.createElement('div');
    uiPanel.id = 'tts-control-panel';
    uiPanel.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        width: 180px;
        padding: 8px;
        background: rgba(0,0,0,0.7);
        color: #fff;
        font-family: Arial, sans-serif;
        font-size: 13px;
        border-radius: 6px;
        cursor: move;
        z-index: 10001;
    `;
    uiPanel.innerHTML = `
        <label for="tts-speed" style="display:block; margin-bottom:4px;">Speed: <span id="speed-value">1.0</span>x</label>
        <input type="range" id="tts-speed" min="0.5" max="2" step="0.1" value="1" style="width:100%;">
    `;
    document.body.appendChild(uiPanel);

    // Update speechRate when slider moves
    const speedInput = document.getElementById('tts-speed');
    const speedDisplay = document.getElementById('speed-value');
    speedInput.addEventListener('input', e => {
        speechRate = parseFloat(e.target.value);
        speedDisplay.textContent = speechRate.toFixed(1);
    });
    // stop drag-init when you click on the slider itself
    speedInput.addEventListener('mousedown', e => e.stopPropagation());

    // Make uiPanel draggable
    (function makeDraggable(el) {
        let isDown = false, startX, startY, origX, origY;
        el.addEventListener('mousedown', e => {
            isDown = true;
            startX = e.clientX; startY = e.clientY;
            const rect = el.getBoundingClientRect();
            origX = rect.left; origY = rect.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!isDown) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            el.style.left = (origX + dx) + 'px';
            el.style.top = (origY + dy) + 'px';
        });
        document.addEventListener('mouseup', () => { isDown = false; });
    })(uiPanel);
    // ——— end UI code ———

})();