// result.js

document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    const canvas = document.getElementById('resultCanvas');
    const ctx = canvas.getContext('2d');
    const downloadBtn = document.getElementById('downloadPng');

    function updateStatus(msg) {
        console.log(msg);
        statusDiv.textContent = msg;
    }

    try {
        updateStatus('Loading captured data...');
        const data = await chrome.storage.local.get('capturedData');
        const state = data.capturedData;

        if (!state || !state.images || state.images.length === 0) {
            updateStatus('No data found in storage.');
            return;
        }

        updateStatus(`Found ${state.images.length} images. Processing...`);

        // Calculate dimensions
        const scale = state.devicePixelRatio || 1;
        const overlap = state.overlap || 0;

        // Load all images
        updateStatus('Loading images...');
        const loadedImages = await Promise.all(state.images.map((img, index) => {
            updateStatus(`Loading image ${index + 1}/${state.images.length}...`);
            return loadImage(img.dataUrl, img.y);
        }));

        if (loadedImages.length === 0) {
            updateStatus('Failed to load images.');
            return;
        }

        updateStatus('Stitching images...');
        const width = loadedImages[0].img.width;

        // Calculate total height
        const lastImg = loadedImages[loadedImages.length - 1];
        // Total height calculation:
        // The last image is placed at lastImg.y (logical) * scale.
        // It has height lastImg.img.height (physical).
        // So total canvas height is (lastImg.y * scale) + lastImg.img.height.
        const totalHeight = (lastImg.y * scale) + lastImg.img.height;

        canvas.width = width;
        canvas.height = totalHeight;

        // Draw images
        loadedImages.forEach((item, index) => {
            const img = item.img;
            const drawY = item.y * scale;

            if (index === 0) {
                // First image: draw full
                ctx.drawImage(img, 0, drawY);
            } else {
                // Subsequent images: crop top 'overlap' pixels
                const cropY = overlap * scale; // Amount to crop from top of source image
                const cropHeight = img.height - cropY;

                if (cropHeight > 0) {
                    ctx.drawImage(
                        img,
                        0, cropY, img.width, cropHeight, // Source: skip top 'cropY'
                        0, drawY + cropY, img.width, cropHeight // Dest: place at drawY + cropY
                    );
                }
            }
        });

        updateStatus('Done!');
        statusDiv.style.display = 'none';

        downloadBtn.addEventListener('click', () => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    console.error('Canvas to Blob failed');
                    alert('Failed to create image file.');
                    return;
                }
                const url = URL.createObjectURL(blob);
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `screenshot-${timestamp}.png`;

                chrome.downloads.download({
                    url: url,
                    filename: filename,
                    saveAs: true
                }, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        console.error('Download failed:', chrome.runtime.lastError);
                        alert('Download failed: ' + chrome.runtime.lastError.message);
                    }
                });
            }, 'image/png');
        });

    } catch (err) {
        console.error(err);
        updateStatus('Error: ' + err.message);
    }
});

function loadImage(url, y) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ img, y });
        img.onerror = (e) => reject(new Error(`Failed to load image at y=${y}`));
        img.src = url;
    });
}
