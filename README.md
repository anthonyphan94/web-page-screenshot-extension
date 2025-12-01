# Full Page Screenshot Extension

A robust Chrome Extension (Manifest V3) that captures full-page screenshots of any website, including modern Single Page Applications (SPAs) and complex scrollable content.

## Features

*   **Full Page Capture**: Automatically scrolls and stitches the entire page content.
*   **Smart Scroll Detection**: Intelligently identifies the main *visible* scroll container (e.g., `#root`, `#app`, or nested divs), ignoring hidden menus.
*   **High Resolution**: Respects `devicePixelRatio` for crisp screenshots on Retina/High-DPI displays.
*   **Sticky Element Handling**: Temporarily hides fixed headers/footers during capture to prevent duplication.
*   **Seamless Stitching**: Uses overlap cropping to ensure perfect alignment without cut-off text.
*   **Robust Saving**: Saves large images directly to your disk using the native "Save As" dialog.
*   **Progress Indicator**: Shows a visible progress bar during the capture process.

## Installation

1.  Clone or download this repository.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the directory containing this project.

## Usage

1.  Navigate to the web page you want to capture.
2.  Click the extension icon (camera) in the Chrome toolbar.
3.  Click the **Take Screenshot** button.
4.  Wait for the scrolling and capture process to complete.
    *   *Note: Please do not interact with the page while capturing.*
5.  A new tab will open with the result.
6.  Click **Download PNG** to save the screenshot to your computer.

## Technologies

*   **Manifest V3**: Compliant with the latest Chrome Extension standards.
*   **Vanilla JavaScript**: No external dependencies or build steps required.
*   **HTML5 Canvas**: Used for high-performance image stitching.
*   **Chrome APIs**: `activeTab`, `scripting`, `storage`, `downloads`.
