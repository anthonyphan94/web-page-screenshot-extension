document.getElementById('captureBtn').addEventListener('click', () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Initializing...';
  
  chrome.runtime.sendMessage({ action: 'START_CAPTURE' }, (response) => {
    if (chrome.runtime.lastError) {
      statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
    } else {
      statusDiv.textContent = 'Capturing...';
    }
  });
});
