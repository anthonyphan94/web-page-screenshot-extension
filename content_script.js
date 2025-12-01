// content_script.js

if (window.hasRun) {
    // Already injected
} else {
    window.hasRun = true;

    let originalStyles = new Map();
    let originalScrollY = 0;
    let scrollContainer = null; // The element we are scrolling
    let progressBarContainer = null;
    let progressBarFill = null;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'INIT_CAPTURE') {
            initCapture().then(metrics => sendResponse(metrics));
            return true; // async response
        } else if (message.action === 'SCROLL_TO') {
            scrollToAndReady(message.y).then((actualY) => sendResponse({ status: 'scrolled', actualY }));
            return true;
        } else if (message.action === 'UPDATE_PROGRESS') {
            updateProgressBar(message.percent);
            sendResponse({ status: 'updated' });
        } else if (message.action === 'RESTORE') {
            restorePage(message.originalScrollY);
            sendResponse({ status: 'restored' });
        }
    });

    // --- UI Functions ---

    function createProgressBar() {
        if (progressBarContainer) return;

        progressBarContainer = document.createElement('div');
        progressBarContainer.id = 'fps-extension-progress-bar';
        progressBarContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 5px;
      background-color: rgba(0, 0, 0, 0.2);
      z-index: 2147483647; /* Max z-index */
      pointer-events: none;
    `;

        progressBarFill = document.createElement('div');
        progressBarFill.style.cssText = `
      width: 0%;
      height: 100%;
      background-color: #4285f4;
      transition: width 0.3s ease;
    `;

        progressBarContainer.appendChild(progressBarFill);
        document.body.appendChild(progressBarContainer);
    }

    function updateProgressBar(percent) {
        if (!progressBarContainer) createProgressBar();
        if (progressBarFill) {
            progressBarFill.style.width = percent + '%';
        }
    }

    function removeProgressBar() {
        if (progressBarContainer) {
            progressBarContainer.remove();
            progressBarContainer = null;
            progressBarFill = null;
        }
    }

    // --- Core Logic ---

    function findScrollableElement() {
        // Helper to check if element is scrollable
        function isScrollable(el) {
            const style = window.getComputedStyle(el);
            const hasScrollableOverflow = ['auto', 'scroll', 'overlay'].includes(style.overflowY);
            return hasScrollableOverflow && el.scrollHeight > el.clientHeight;
        }

        // Helper to check if element is strictly visible
        function isVisible(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;

            // Check if it's actually within the viewport
            if (rect.top >= window.innerHeight || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.right <= 0) {
                return false;
            }

            // Optional: Check if it's covered? (Too expensive to check every point)
            return true;
        }

        // 1. Collect all potential candidates
        const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
            // Filter out small elements to optimize
            if (el.clientWidth < window.innerWidth * 0.5 || el.clientHeight < window.innerHeight * 0.5) return false;

            // CRITICAL: Must be visible and scrollable
            return isVisible(el) && isScrollable(el);
        });

        // Add document.scrollingElement (html/body) to candidates if it scrolls
        if (document.scrollingElement && document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight) {
            candidates.push(document.scrollingElement);
        }

        // 2. Sort by scrollHeight (descending)
        candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);

        // 3. Pick the best one
        if (candidates.length > 0) {
            console.log('Found scrollable candidates:', candidates);
            // Log the chosen one for debugging
            const chosen = candidates[0];
            console.log('Selected scroll container:', chosen.tagName, chosen.className, chosen.id);
            return chosen;
        }

        // 4. Fallback
        console.log('No specific scroll container found, using document.documentElement');
        return document.documentElement;
    }

    async function initCapture() {
        // Find the scroll container
        scrollContainer = findScrollableElement();

        // Save original scroll position
        originalScrollY = scrollContainer === document.documentElement ? window.scrollY : scrollContainer.scrollTop;

        // Create progress bar
        createProgressBar();

        // Hide fixed/sticky elements
        hideFixedElements();

        // Hide scrollbars
        document.documentElement.style.overflow = 'hidden';
        if (scrollContainer !== document.documentElement) {
            scrollContainer.style.overflow = 'hidden'; // Temporarily hide scrollbar on container too? 
            // Actually, if we hide overflow, we might lose scrolling capability if we are not careful.
            // But we are scrolling programmatically.
            // 'overflow: hidden' usually still allows programmatic scroll.
        }

        // Get metrics
        const fullHeight = scrollContainer.scrollHeight;
        const visibleHeight = scrollContainer.clientHeight; // Viewport height of the container

        // Note: captureVisibleTab captures the *window* viewport.
        // If we are scrolling an inner div, we need to make sure it takes up the viewport.
        // If the inner div is small, captureVisibleTab will capture the whole page, but we only care about the div content.
        // However, the requirement is "Full Page Screenshot". 
        // Usually this implies the main content area.
        // If the container is the main scroller, it usually fills the screen.

        return {
            fullHeight: fullHeight,
            visibleHeight: visibleHeight, // This is used for stepping
            devicePixelRatio: window.devicePixelRatio,
            originalScrollY: originalScrollY
        };
    }

    function hideFixedElements() {
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            if (el.id === 'fps-extension-progress-bar') return;

            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'sticky') {
                originalStyles.set(el, {
                    visibility: el.style.visibility,
                    position: el.style.position
                });
                el.style.visibility = 'hidden';
            }
        });
    }

    async function scrollToAndReady(y) {
        if (scrollContainer === document.documentElement) {
            window.scrollTo(0, y);
        } else {
            scrollContainer.scrollTop = y;
        }

        // Wait for layout/rendering
        await wait(1000);

        // Return actual scroll position
        if (scrollContainer === document.documentElement) {
            return window.scrollY;
        } else {
            return scrollContainer.scrollTop;
        }
    }

    function restorePage(savedScrollY) {
        removeProgressBar();

        originalStyles.forEach((styles, el) => {
            el.style.visibility = styles.visibility;
        });
        originalStyles.clear();

        document.documentElement.style.overflow = '';
        if (scrollContainer && scrollContainer !== document.documentElement) {
            scrollContainer.style.overflow = '';
        }

        if (scrollContainer === document.documentElement) {
            window.scrollTo(0, savedScrollY);
        } else if (scrollContainer) {
            scrollContainer.scrollTop = savedScrollY;
        }
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Export for testing
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            findScrollableElement,
            // We need to expose the helper functions if we want to test them individually, 
            // but they are defined inside findScrollableElement scope in the previous version.
            // Wait, in the previous version they were defined INSIDE findScrollableElement.
            // I should probably move them out or just test findScrollableElement.
            // Let's check the file content again to be sure where they are.
        };
    }
}
