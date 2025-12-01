# Implementation Log

This document serves as the "source of truth" for the Full Page Screenshot Extension. It documents the architecture, key technical challenges faced during development, and the solutions implemented to overcome them.

## 1. High-Level Architecture

This is a Chrome Extension (Manifest V3) designed to capture full-page screenshots of any website, including complex Single Page Applications (SPAs).

**Core Files:**

*   **`manifest.json`**: The configuration file defining permissions (`activeTab`, `scripting`, `storage`, `unlimitedStorage`), background scripts, and extension metadata.
*   **`background.js`**: The central orchestrator (Service Worker) that manages the capture loop, stores image chunks, and opens the result page.
*   **`content_script.js`**: Injected into the webpage to handle scrolling, identify the correct scroll container, hide sticky elements, and display the progress bar.
*   **`result.html` / `result.js`**: The post-capture UI that retrieves image chunks from storage, stitches them onto an HTML5 Canvas, and handles the file download.
*   **`popup.html` / `popup.js`**: The entry point UI allowing the user to initiate the capture process.

## 2. The "Problem & Solution" Log

During development, we encountered several significant technical hurdles. Here is how we solved them.

### Challenge 1: The "Hidden Scrollbar" Trap (SPA Support)

**The Symptom:**
On modern Single Page Applications (like React or Vue apps), the extension would only capture the visible viewport and fail to scroll, even though the page clearly had a scrollbar.

**The Technical Root Cause:**
The initial logic assumed that `document.documentElement` (the `<html>` tag) or `document.body` was always the scroll container. In many SPAs, the main scrollbar is actually attached to a nested `div` (e.g., `#root`, `#app`, or a wrapper) with `height: 100vh` and `overflow-y: auto`. Scrolling the window had no effect because the window itself wasn't scrollable.

**The Fix:**
We implemented a robust heuristic in `content_script.js` to "hunt" for the correct scroll container. It scans the DOM for large elements that have scrollable overflow styles (`auto`, `scroll`) and a `scrollHeight` larger than their `clientHeight`. It prioritizes the largest such element.

**Code Snippet:**
```javascript
function findScrollableElement() {
    // Helper to check if element is scrollable
    function isScrollable(el) {
        const style = window.getComputedStyle(el);
        const hasScrollableOverflow = ['auto', 'scroll', 'overlay'].includes(style.overflowY);
        return hasScrollableOverflow && el.scrollHeight > el.clientHeight;
    }

    // Collect candidates and sort by scrollHeight (descending)
    const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
        if (el.clientWidth < window.innerWidth * 0.5) return false; // Optimization
        return isScrollable(el);
    });
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);

    return candidates.length > 0 ? candidates[0] : document.documentElement;
}
```

### Challenge 2: The "Self-Hiding" UI

**The Symptom:**
We implemented a progress bar to show capture status, but it would mysteriously disappear the moment the capture started.

**The Technical Root Cause:**
To prevent sticky headers and footers from cluttering the screenshot, we implemented a `hideFixedElements()` function that hides all elements with `position: fixed`. Since our progress bar was also a `position: fixed` element injected into the page, the script inadvertently hid its own UI!

**The Fix:**
We added a specific ID check (`fps-extension-progress-bar`) within the loop to exclude our progress bar from being hidden.

**Code Snippet:**
```javascript
function hideFixedElements() {
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
        // CRITICAL: Skip our own progress bar!
        if (el.id === 'fps-extension-progress-bar') return;

        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
            // ... logic to hide element ...
        }
    });
}
```

### Challenge 3: The "Storage Quota" Wall

**The Symptom:**
Capturing long pages resulted in a generic error: `Error: Resource::kQuotaBytes quota exceeded`.

**The Technical Root Cause:**
We use `chrome.storage.local` to pass the captured image chunks from the background script to the result page. The default quota for this storage is 5MB. A full-page PNG screenshot of a long page easily exceeds this limit.

**The Fix:**
We added the `"unlimitedStorage"` permission to `manifest.json`. This allows the extension to store as much data as the user's hard drive allows, bypassing the 5MB limit.

**Code Snippet:**
```json
// manifest.json
{
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "downloads",
    "unlimitedStorage" // <--- The fix
  ]
}
```

### Challenge 4: The "Data URL" Crash

**The Symptom:**
When clicking "Download PNG" for very large screenshots, nothing would happen, or the browser tab would crash.

**The Technical Root Cause:**
We were originally using `canvas.toDataURL()` and setting it as the `href` of an anchor tag. For large images, this creates a massive Base64 string that can exceed browser URL length limits or consume excessive memory, causing silent failures.

**The Fix:**
We switched to using `canvas.toBlob()`. This creates a binary Blob object, which is much more memory-efficient. We then create a temporary object URL (`URL.createObjectURL(blob)`) and use the `chrome.downloads` API to save it.

**Code Snippet:**
```javascript
canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
    });
}, 'image/png');
    });
}, 'image/png');
```

### Challenge 5: The "Phantom Scrollbar" (Repeating Screenshots)

**The Symptom:**
On some websites, the resulting screenshot would be extremely long but consist of the same viewport image repeated over and over again.

**The Technical Root Cause:**
The extension's scroll detection logic was finding a "scrollable" element (like a hidden mobile menu or a background wrapper) that had `overflow-y: scroll` but was not actually visible or active. The script would scroll this invisible element, but since the main visible page didn't move, every screenshot captured the exact same view.

**The Fix:**
We updated `findScrollableElement` to strictly check for visibility. We now verify that the candidate element has `display: block` (not none), `visibility: visible`, non-zero dimensions, and is actually within the viewport bounds.

**Code Snippet:**
```javascript
function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    
    // Check if within viewport
    if (rect.top >= window.innerHeight || rect.bottom <= 0) return false;
    
    return true;
}
```

## 3. Edge Cases Handled

*   **Retina/High-DPI Displays**: The extension captures `window.devicePixelRatio` and scales the canvas accordingly, ensuring screenshots are crisp and not blurry on high-res screens.
*   **Sticky Headers**: By overlapping screenshots (80px) and cropping the top of subsequent chunks, we prevent sticky headers from appearing repeatedly in the final image.
*   **Infinite Loops**: We implemented a `MAX_STEPS` limit (50) and a "stuck detection" check (if scroll position doesn't change) to prevent the extension from running forever on infinite-scroll pages or broken sites.
*   **Lazy Loading**: The script pauses for 1000ms after every scroll to allow lazy-loaded images and content to render before capturing.

## 4. Future Improvements

1.  **Dynamic Wait Times**: Instead of a hardcoded 1000ms wait, we could use `requestIdleCallback` or observe network activity to capture as soon as the page is settled, speeding up the process.
2.  **PDF Export**: Currently, we only support PNG. Adding a library like `jsPDF` would allow users to save directly as a multi-page PDF.
3.  **Virtualization Support**: For complex virtualized lists (where content is destroyed as you scroll), the current "stitch later" approach works, but a "stitch as you go" approach might be more memory efficient for extremely long pages.
