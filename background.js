// background.js

// Constants
const OVERLAP = 80;
const MAX_STEPS = 50;

// State to track capture progress per tab
const captureState = {};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_CAPTURE') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab) {
                startCapture(activeTab.id);
            }
        });
        sendResponse({ status: 'started' });
    }
    return true; // Keep channel open
});

async function startCapture(tabId) {
    try {
        // Inject content script if not already present (or just ensure it's there)
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content_script.js']
        });

        // Initialize capture in content script
        const response = await sendMessageToTab(tabId, { action: 'INIT_CAPTURE' });

        if (!response) {
            console.error('Failed to initialize capture');
            return;
        }

        const { fullHeight, visibleHeight, devicePixelRatio, originalScrollY } = response;

        captureState[tabId] = {
            images: [],
            fullHeight,
            visibleHeight,
            devicePixelRatio,
            originalScrollY,
            currentY: 0,
            steps: 0,
            overlap: OVERLAP
        };

        captureLoop(tabId);

    } catch (err) {
        console.error('Error starting capture:', err);
    }
}

async function captureLoop(tabId) {
    const state = captureState[tabId];
    if (!state) return;

    // Check max steps
    if (state.steps >= MAX_STEPS) {
        console.warn('Reached max steps, finishing capture.');
        finishCapture(tabId);
        return;
    }
    state.steps++;

    // Scroll to currentY
    const response = await sendMessageToTab(tabId, { action: 'SCROLL_TO', y: state.currentY });

    // Update currentY to what was actually scrolled to
    const actualY = response && response.actualY !== undefined ? response.actualY : state.currentY;

    // Capture visible tab
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
            console.error('Capture failed:', chrome.runtime.lastError);
            finishCapture(tabId);
            return;
        }

        state.images.push({
            y: actualY,
            dataUrl: dataUrl
        });

        // Send progress update
        const percent = Math.min(Math.round((actualY / state.fullHeight) * 100), 100);
        sendMessageToTab(tabId, { action: 'UPDATE_PROGRESS', percent: percent });

        // Calculate next scroll position
        // Step size = visibleHeight - OVERLAP
        const nextY = actualY + state.visibleHeight - OVERLAP;

        // Check if we are done
        // 1. If we reached the bottom (nextY >= fullHeight)
        // 2. If we are stuck (actualY didn't move much despite asking to scroll)
        //    We need to compare actualY with previous actualY? 
        //    Actually, if nextY is what we *want* to scroll to, and actualY is what we *did* scroll to.
        //    If we are at the bottom, actualY will be maxScroll.
        //    If we try to scroll to nextY > maxScroll, actualY will stay maxScroll.
        //    So if nextY > actualY + visibleHeight? No.

        // Simple check: if actualY + visibleHeight >= fullHeight, we have captured the bottom.
        // BUT, fullHeight might be dynamic.
        // Better check: If actualY didn't change from previous step?
        // We can store prevY.

        if (state.prevY !== undefined && actualY === state.prevY) {
            console.log('Scroll stuck, finishing.');
            finishCapture(tabId);
            return;
        }
        state.prevY = actualY;
        state.currentY = nextY;

        // If we have covered the full height (or close enough)
        if (actualY + state.visibleHeight >= state.fullHeight) {
            finishCapture(tabId);
        } else {
            captureLoop(tabId);
        }
    });
}

async function finishCapture(tabId) {
    const state = captureState[tabId];

    // Restore page
    await sendMessageToTab(tabId, { action: 'RESTORE', originalScrollY: state.originalScrollY });

    // Save data to storage
    try {
        await chrome.storage.local.set({ 'capturedData': state });
        chrome.tabs.create({ url: 'result.html' });
    } catch (e) {
        console.error('Error saving to storage:', e);
        alert('Image too large to process with simple storage.');
    }

    delete captureState[tabId];
}

function sendMessageToTab(tabId, message) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            resolve(response);
        });
    });
}

