(function() {
    (async () => {
    try {
      const storageApi = typeof browser !== 'undefined' ? browser : chrome;
      const { appTheme } = await storageApi.storage.local.get('appTheme');
      if (appTheme === 'dark') document.body.classList.add('dark-mode');  
      storageApi.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.appTheme) {
          const newTheme = changes.appTheme.newValue;
          document.body.classList.toggle('dark-mode', newTheme === 'dark');
        }
      });
    } catch (_) {}
  })();
  let selectionOverlay = null;
  let selectionRectDiv = null;
  let startX, startY;
  let isSelecting = false;
  let capturePopup = null;
  let currentOcrText = "";
  let isDraggingCapturePopup = false;
  let capturePopupOffsetX, capturePopupOffsetY;
  function createSelectionUI() {
    if (!selectionOverlay) {
      selectionOverlay = document.createElement("div");
      selectionOverlay.setAttribute("id", "tangoji-capture-overlay");
      document.body.appendChild(selectionOverlay);
      selectionRectDiv = document.createElement("div");
      selectionRectDiv.setAttribute("id", "tangoji-capture-rect");
      selectionOverlay.appendChild(selectionRectDiv);
      selectionOverlay.addEventListener("mousedown", handleMouseDown);
    }
    selectionOverlay.style.display = "block";
  }
  function hideSelectionUI() {
    if (selectionOverlay) {
      selectionOverlay.style.display = "none";
    }
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }
  function handleMouseDown(event) {
    if (event.button !== 0) return;
    isSelecting = true;
    startX = event.clientX;
    startY = event.clientY;
    selectionRectDiv.style.left = `${startX}px`;
    selectionRectDiv.style.top = `${startY}px`;
    selectionRectDiv.style.width = "0px";
    selectionRectDiv.style.height = "0px";
    selectionRectDiv.style.display = "block";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    event.preventDefault();
    event.stopPropagation();
  }
  function handleMouseMove(event) {
    if (!isSelecting) return;
    let currentX = event.clientX;
    let currentY = event.clientY;
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const newX = Math.min(startX, currentX);
    const newY = Math.min(startY, currentY);
    selectionRectDiv.style.left = `${newX}px`;
    selectionRectDiv.style.top = `${newY}px`;
    selectionRectDiv.style.width = `${width}px`;
    selectionRectDiv.style.height = `${height}px`;
  }
  function handleMouseUp(event) {
    if (!isSelecting) return;
    isSelecting = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    const selectionBoundingRect = selectionRectDiv.getBoundingClientRect();
    const finalX = selectionBoundingRect.left;
    const finalY = selectionBoundingRect.top;
    const finalWidth = selectionBoundingRect.width;
    const finalHeight = selectionBoundingRect.height;
    if (selectionRectDiv) selectionRectDiv.style.display = "none";
    if (selectionOverlay) selectionOverlay.style.display = "none";
    if (finalWidth > 5 && finalHeight > 5) {
      browser.runtime.sendMessage({ action: "captureVisibleTab" }, (response) => {
        if (response && response.success && response.dataUrl) {
          cropImageAndProcess(response.dataUrl, finalX, finalY, finalWidth, finalHeight);
        } else {
          alert("Error: Could not capture screen.");
        }
      });
    }
  }
function cropImageAndProcess(fullImageDataUrl, cropX, cropY, cropWidth, cropHeight) {
    const img = new Image();
    img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const physicalCropX = cropX * dpr;
        const physicalCropY = cropY * dpr;
        const physicalCropWidth = cropWidth * dpr;
        const physicalCropHeight = cropHeight * dpr;
        const canvas = document.createElement('canvas');
        canvas.width = physicalCropWidth;
        canvas.height = physicalCropHeight;
        const ctx = canvas.getContext('2d');
    console.log("Tangoji Capture Debug:");
    console.log("Device Pixel Ratio:", dpr);
    console.log("CSS Crop Rect (X,Y,W,H):", cropX, cropY, cropWidth, cropHeight);
    console.log("Physical Crop Rect (X,Y,W,H):", physicalCropX, physicalCropY, physicalCropWidth, physicalCropHeight);
    console.log("Original Image (captureVisibleTab) Dimensions (natural W,H):", img.naturalWidth, img.naturalHeight);
    console.log("Viewport Dimensions (inner W,H):", window.innerWidth, window.innerHeight);
    console.log("Expected Physical Capture Dim (approx):", window.innerWidth * dpr, window.innerHeight * dpr);
        ctx.drawImage(
            img,
            physicalCropX,
            physicalCropY,
            physicalCropWidth,
            physicalCropHeight,
            0, 0, 
            physicalCropWidth,
            physicalCropHeight
        );
        try {
            const croppedImageDataUrl = canvas.toDataURL('image/png');
            const popupBaseRect = {
                top: cropY, left: cropX, bottom: cropY + cropHeight, 
                right: cropX + cropWidth, width: cropWidth, height: cropHeight
            };
            showCapturePopup("Processing image...", popupBaseRect);
            browser.runtime.sendMessage({ action: "getAiMultimodalAnalysis", imageData: croppedImageDataUrl }, (aiResponse) => { 
                if (capturePopup) {
                    const loadingEl = document.getElementById("tangoji-capture-popup-loading");
                    const contentEl = document.getElementById("tangoji-capture-popup-content");
                    if (loadingEl) loadingEl.style.display = "none";
                    if (contentEl) contentEl.style.display = "block";
                    if (aiResponse && aiResponse.success && aiResponse.data) {
                        currentOcrText = aiResponse.data.ocr_text || "";
                        document.getElementById("tangoji-capture-ocr-text").textContent = aiResponse.data.ocr_text || "(No text detected)";
                        document.getElementById("tangoji-capture-translation").textContent = aiResponse.data.translation || "N/A";
                    } else {
                        document.getElementById("tangoji-capture-ocr-text").textContent = "Error processing image.";
                        document.getElementById("tangoji-capture-translation").textContent = aiResponse.data && aiResponse.data.translation ? aiResponse.data.translation : "Error"; 
            if (aiResponse && !aiResponse.success) {
                console.error("Tangoji AI Error:", aiResponse.error);
            }
                    }
                }
            });
        } catch (e) {
            console.error("Error processing captured image:", e);
            alert("Error: Could not process captured image. " + e.message);
        }
    };
    img.onerror = () => {
        console.error("Error: Could not load captured image for cropping. URL was:", fullImageDataUrl.substring(0,100) + "...");
        alert("Error: Could not load captured image.");
    };
    img.src = fullImageDataUrl;
}
  function createCapturePopup() {
    if (capturePopup) return;
    capturePopup = document.createElement("div");
    capturePopup.setAttribute("id", "tangoji-capture-popup");
    capturePopup.innerHTML = `
      <div class="tangoji-popup-header" style="cursor: move;">
        <strong>Image Analysis</strong>
        <button id="tangoji-capture-popup-close" title="Close">✕</button>
      </div>
      <div id="tangoji-capture-popup-loading">Loading analysis...</div>
      <div id="tangoji-capture-popup-content" style="display:none;">
        <p><strong>Detected Text:</strong> <span id="tangoji-capture-ocr-text" style="white-space: pre-wrap; font-style: italic;"></span></p>
        <p><strong>Translation:</strong> <span id="tangoji-capture-translation"></span></p>
      </div>
      <div class="tangoji-popup-actions">
        <button id="tangoji-capture-popup-save" class="tangoji-btn">Save to Tangoji</button>
      </div>
    `;
    document.body.appendChild(capturePopup);
    const header = capturePopup.querySelector(".tangoji-popup-header");
    header.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isDraggingCapturePopup = true;
        const popupRect = capturePopup.getBoundingClientRect();
        capturePopupOffsetX = e.clientX - popupRect.left;
        capturePopupOffsetY = e.clientY - popupRect.top;
        e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
        if (!isDraggingCapturePopup) return;
        let newTop = e.clientY - capturePopupOffsetY;
        let newLeft = e.clientX - capturePopupOffsetX;
        const popupWidth = capturePopup.offsetWidth;
        const popupHeight = capturePopup.offsetHeight;
        const margin = 5;
        if (newLeft < margin) newLeft = margin;
        if (newTop < margin) newTop = margin;
        if (newLeft + popupWidth > window.innerWidth - margin) newLeft = window.innerWidth - popupWidth - margin;
        if (newTop + popupHeight > window.innerHeight - margin) newTop = window.innerHeight - popupHeight - margin;
        capturePopup.style.left = `${newLeft}px`;
        capturePopup.style.top = `${newTop}px`;
    });
    document.addEventListener("mouseup", () => {
        if(isDraggingCapturePopup) { 
            isDraggingCapturePopup = false;
        }
    });
    document.getElementById("tangoji-capture-popup-close").addEventListener("click", hideCapturePopup);
    document.getElementById("tangoji-capture-popup-save").addEventListener("click", () => {
      if (currentOcrText && currentOcrText.trim() !== "") {
        browser.runtime.sendMessage({ action: "saveToTangojiViaPopup", text: currentOcrText.trim() }, (response) => {
          if (response && response.success) {
            console.log("Capture Popup: Save successful", response.data.message);
          } else {
            console.error("Capture Popup: Save failed", response ? response.error : "No response");
          }
        });
      } else {
        alert("No text was detected in the image to save.");
      }
      hideCapturePopup();
    });
  }
  function showCapturePopup(message, baseRect) {
    if (!capturePopup) createCapturePopup();
    const loadingEl = document.getElementById("tangoji-capture-popup-loading");
    const contentEl = document.getElementById("tangoji-capture-popup-content");
    if (loadingEl) {
        loadingEl.textContent = message;
        loadingEl.style.display = "block";
    }
    if (contentEl) {
        contentEl.style.display = "none";
        const ocrTextEl = document.getElementById("tangoji-capture-ocr-text");
        const translationEl = document.getElementById("tangoji-capture-translation");
        if (ocrTextEl) ocrTextEl.textContent = "";
        if (translationEl) translationEl.textContent = "";
    }
    let initialPopupTop = baseRect.bottom + 10;
    let initialPopupLeft = baseRect.left;
    const popupIsFixed = capturePopup && window.getComputedStyle(capturePopup).position === 'fixed';
    if (!popupIsFixed) {
        initialPopupTop += window.scrollY;
        initialPopupLeft += window.scrollX;
    }
    capturePopup.style.top = `${initialPopupTop}px`;
    capturePopup.style.left = `${initialPopupLeft}px`;
    capturePopup.style.display = "block";
    const popupWidth = capturePopup.offsetWidth;
    const popupHeight = capturePopup.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 10;
    let finalPopupTop = parseFloat(capturePopup.style.top);
    let finalPopupLeft = parseFloat(capturePopup.style.left);
    if (popupIsFixed) {
        if (finalPopupLeft + popupWidth > viewportWidth - margin) {
            finalPopupLeft = viewportWidth - popupWidth - margin;
        }
        if (finalPopupLeft < margin) {
            finalPopupLeft = margin;
        }
        if (finalPopupTop + popupHeight > viewportHeight - margin) {
            finalPopupTop = baseRect.top - popupHeight - margin;
            if (finalPopupTop < margin) finalPopupTop = margin;
        } else if (finalPopupTop < margin) {
            finalPopupTop = margin;
        }
    } else {
        if (finalPopupLeft + popupWidth > window.scrollX + viewportWidth - margin) {
            finalPopupLeft = window.scrollX + viewportWidth - popupWidth - margin;
        }
        if (finalPopupLeft < window.scrollX + margin) {
            finalPopupLeft = window.scrollX + margin;
        }
        if (finalPopupTop + popupHeight > window.scrollY + viewportHeight - margin) {
            finalPopupTop = window.scrollY + baseRect.top - popupHeight - margin;
            if (finalPopupTop < window.scrollY + margin) finalPopupTop = window.scrollY + margin;
        } else if (finalPopupTop < window.scrollY + margin) {
            finalPopupTop = window.scrollY + margin;
        }
    }
    capturePopup.style.top = `${finalPopupTop}px`;
    capturePopup.style.left = `${finalPopupLeft}px`;
  }
  function hideCapturePopup() {
    if (capturePopup) capturePopup.style.display = "none";
    currentOcrText = "";
  }
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "initiateAreaSelection") {
      createSelectionUI();
      sendResponse({ success: true });
    }
  });
})();