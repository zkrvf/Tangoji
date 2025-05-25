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
  let floatingIcon;
  let translatePopup;
  let currentSelectedText = "";
  let currentSelectionRange = null;
  let isDraggingTextPopup = false;
  let textPopupOffsetX, textPopupOffsetY;
  function createFloatingIcon() {
    if (floatingIcon) return;
    floatingIcon = document.createElement("div");
    floatingIcon.setAttribute("id", "tangoji-floating-icon");
    const iconImage = document.createElement("img");
    try {
      iconImage.src = browser.runtime.getURL("../../icons/icon-128.png");
    } catch (e) {
      iconImage.src = ""; 
    }
    iconImage.alt = "Translate with Tangoji";
    iconImage.classList.add("tangoji-icon-image"); 
    iconImage.style.width = "24px"; 
    iconImage.style.height = "24px"; 
    iconImage.style.display = "block"; 
    floatingIcon.appendChild(iconImage);
    floatingIcon.style.position = "absolute"; 
    floatingIcon.style.zIndex = "2147483640";  
    floatingIcon.style.cursor = "pointer";
    floatingIcon.style.display = "none"; 
    document.body.appendChild(floatingIcon);
    floatingIcon.addEventListener("mousedown", (e) => e.stopPropagation()); 
    floatingIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentSelectedText && currentSelectionRange) {
        const rect = currentSelectionRange.getBoundingClientRect();
        showTranslatePopup(currentSelectedText, rect);
        hideFloatingIcon();
      } else if (currentSelectedText) { 
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              currentSelectionRange = range; 
              const rect = range.getBoundingClientRect();
              showTranslatePopup(currentSelectedText, rect);
              hideFloatingIcon();
          }
      }
    });
  }
  function showFloatingIcon(x, y) {
    if (!floatingIcon) createFloatingIcon();
    floatingIcon.style.left = `${x}px`;
    floatingIcon.style.top = `${y}px`;
    floatingIcon.style.display = "inline-flex"; 
  }
  function hideFloatingIcon() {
    if (floatingIcon) {
      floatingIcon.style.display = "none";
    }
  }
  document.addEventListener("mouseup", (event) => {
    if (event.target.closest("#tangoji-translate-popup") || event.target.closest("#tangoji-floating-icon")) {
        return;
    }
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (selectedText.length > 0 && selection.rangeCount > 0) {
      currentSelectedText = selectedText;
      currentSelectionRange = selection.getRangeAt(0);
      const rect = currentSelectionRange.getBoundingClientRect();
      const iconImageHeight = 24; 
      const iconX = window.scrollX + rect.right + 5;
      const iconY = window.scrollY + rect.top + (rect.height / 2) - (iconImageHeight / 2); 
      showFloatingIcon(iconX, iconY);
    } else {
      hideFloatingIcon();
      if (translatePopup && translatePopup.style.display !== 'none') {
        hideTranslatePopup(); 
      }
      currentSelectedText = ""; 
      currentSelectionRange = null;
    }
  });
  document.addEventListener("mousedown", (event) => {
    if (floatingIcon && floatingIcon.style.display !== "none" && 
        event.target !== floatingIcon && !floatingIcon.contains(event.target) &&
        (!translatePopup || !translatePopup.contains(event.target))) { 
      hideFloatingIcon();
    }
    if (translatePopup && translatePopup.style.display !== "none" && 
        !translatePopup.contains(event.target) && 
        event.target !== floatingIcon && !floatingIcon.contains(event.target)) {
      hideTranslatePopup();
    }
  });
  function createTranslatePopup() {
    if (translatePopup) return;
    translatePopup = document.createElement("div");
    translatePopup.setAttribute("id", "tangoji-translate-popup");
    translatePopup.innerHTML = `
      <div class="tangoji-popup-header" style="cursor: move;">
        <strong id="tangoji-selected-text-header"></strong>
        <button id="tangoji-popup-close" title="Close">✕</button>
      </div>
      <div id="tangoji-popup-loading">Loading translation...</div>
      <div id="tangoji-popup-content" style="display:none;">
        <p><strong>Translation:</strong> <span id="tangoji-translation"></span></p>
        <p><strong>Explanation:</strong> <span id="tangoji-explanation"></span></p> 
        <p><strong>Example:</strong> <span id="tangoji-example"></span></p>
      </div>
      <div class="tangoji-popup-actions">
        <button id="tangoji-popup-save" class="tangoji-btn">Save to Tangoji</button>
      </div>
    `;
    document.body.appendChild(translatePopup);
    const header = translatePopup.querySelector(".tangoji-popup-header");
    header.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return; 
        isDraggingTextPopup = true;
        const popupRect = translatePopup.getBoundingClientRect();
        textPopupOffsetX = e.clientX - popupRect.left;
        textPopupOffsetY = e.clientY - popupRect.top;
        e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
        if (!isDraggingTextPopup) return;
        let newTop = e.clientY - textPopupOffsetY;
        let newLeft = e.clientX - textPopupOffsetX;
        const popupWidth = translatePopup.offsetWidth;
        const popupHeight = translatePopup.offsetHeight;
        const margin = 5; 
        if (newLeft < margin) newLeft = margin;
        if (newTop < margin) newTop = margin;
        if (newLeft + popupWidth > window.innerWidth - margin) newLeft = window.innerWidth - popupWidth - margin;
        if (newTop + popupHeight > window.innerHeight - margin) newTop = window.innerHeight - popupHeight - margin;
        translatePopup.style.left = `${newLeft}px`;
        translatePopup.style.top = `${newTop}px`;
    });
    document.addEventListener("mouseup", () => {
        isDraggingTextPopup = false;
    });
    document.getElementById("tangoji-popup-close").addEventListener("click", hideTranslatePopup);
    document.getElementById("tangoji-popup-save").addEventListener("click", () => {
      if (currentSelectedText) {
        browser.runtime.sendMessage({ action: "saveToTangojiViaPopup", text: currentSelectedText }, (response) => {
          if (response && response.success) {
            console.log("Text Popup: Save successful", response.data.message);
          } else {
            console.error("Text Popup: Save failed", response ? response.error : "No response");
          }
        });
        hideTranslatePopup(); 
      }
    });
  }
  function showTranslatePopup(text, baseRect) {
    if (!translatePopup) createTranslatePopup();
    const selectedTextHeaderEl = document.getElementById("tangoji-selected-text-header");
    const loadingEl = document.getElementById("tangoji-popup-loading");
    const contentEl = document.getElementById("tangoji-popup-content");
    const translationEl = document.getElementById("tangoji-translation");
    const explanationEl = document.getElementById("tangoji-explanation"); 
    const exampleEl = document.getElementById("tangoji-example");
    if(selectedTextHeaderEl) selectedTextHeaderEl.textContent = `"${text}"`;
    if(loadingEl) loadingEl.style.display = "block";
    if(contentEl) contentEl.style.display = "none";
    if(translationEl) translationEl.textContent = "";
    if(explanationEl) explanationEl.textContent = ""; 
    if(exampleEl) exampleEl.textContent = "";
    let initialPopupTop, initialPopupLeft;
    const popupIsFixed = translatePopup && window.getComputedStyle(translatePopup).position === 'fixed';
    if (popupIsFixed) {
        initialPopupTop = baseRect.bottom + 10; 
        initialPopupLeft = baseRect.left;
    } else { 
        initialPopupTop = window.scrollY + baseRect.bottom + 10;
        initialPopupLeft = window.scrollX + baseRect.left;
    }
    translatePopup.style.top = `${initialPopupTop}px`;
    translatePopup.style.left = `${initialPopupLeft}px`;
    translatePopup.style.display = "block"; 
    const popupWidth = translatePopup.offsetWidth;
    const popupHeight = translatePopup.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight; 
    const margin = 10;
    let finalPopupTop = parseFloat(translatePopup.style.top);
    let finalPopupLeft = parseFloat(translatePopup.style.left);
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
    translatePopup.style.top = `${finalPopupTop}px`;
    translatePopup.style.left = `${finalPopupLeft}px`;
    browser.runtime.sendMessage({ action: "getAiTranslation", text: text }, (response) => {
      if(loadingEl) loadingEl.style.display = "none";
      if(contentEl) contentEl.style.display = "block";
      if (response && response.success && response.data) {
        if(translationEl) translationEl.textContent = response.data.translation || "N/A";
        if(explanationEl) explanationEl.textContent = response.data.explanation || "N/A"; 
        if(exampleEl) exampleEl.textContent = response.data.example || "N/A";
      } else {
        if(translationEl) translationEl.textContent = "Error fetching translation.";
        if(explanationEl) explanationEl.textContent = "N/A";
        if(exampleEl) exampleEl.textContent = "N/A";
        console.error("Error displaying translation in text popup:", response ? response.error : "No response");
      }
    });
  }
  function hideTranslatePopup() {
    if (translatePopup) translatePopup.style.display = "none";
  }
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showTranslatePopup") {
      hideFloatingIcon(); 
      const selection = window.getSelection();
      const textToTranslate = request.text; 
      currentSelectedText = textToTranslate; 
      let baseRect;
      if (selection.rangeCount > 0) { 
          currentSelectionRange = selection.getRangeAt(0); 
          baseRect = currentSelectionRange.getBoundingClientRect();
      } else { 
          baseRect = { 
              top: window.innerHeight / 3, 
              left: window.innerWidth / 3, 
              bottom: window.innerHeight / 3, 
              right: window.innerWidth / 3, 
              height: 0, 
              width: 0 
          };
      }
      if (textToTranslate) {
          showTranslatePopup(textToTranslate, baseRect);
          sendResponse({ success: true });
      } else {
          sendResponse({ success: false, error: "No text to translate from context menu." });
      }
    }
    return true; 
  });
})();