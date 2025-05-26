const DEFAULT_OLLAMA_SERVER_URL = "http://localhost:11434";
const DEFAULT_NATIVE_LANGUAGE_CODE = "es";
const DEFAULT_LEARNING_LANGUAGE_CODE = "en";
const DEFAULT_AI_TEXT_MODEL_NAME = "gemma3:latest";
const DEFAULT_AI_MULTIMODAL_MODEL_NAME = "qwen2.5vl:latest";
const languageNameMap = {
  "es": "Spanish", "en": "English", "fr": "French", "de": "German",
  "ja": "Japanese", "zh-CN": "Simplified Chinese", "pt": "Portuguese",
  "it": "Italian", "ko": "Korean", "ru": "Russian"
};
const db = new Dexie("TangojiDB");
db.version(1).stores({
  cards: '++id, word, translation, score, created_at, *tags, image_url, grammar_note, example',
  temp_words: '++id, &text, timestamp',
  study_history: '++id, card_id, success, timestamp'
});
db.open().catch(function (e) {
    console.error("Failed to open DexieDB: " + (e.stack || e));
});
browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.set({ theme: 'light' });
});
async function getExtensionSettings() {
  try {
    const result = await browser.storage.local.get({
      ollamaServerUrl: DEFAULT_OLLAMA_SERVER_URL,
      nativeLanguageCode: DEFAULT_NATIVE_LANGUAGE_CODE,
      learningLanguageCode: DEFAULT_LEARNING_LANGUAGE_CODE,
      aiTextModelName: DEFAULT_AI_TEXT_MODEL_NAME,
      aiMultimodalModelName: DEFAULT_AI_MULTIMODAL_MODEL_NAME,
      appTheme: "light"
    });
    const nativeLangName = languageNameMap[result.nativeLanguageCode] || languageNameMap[DEFAULT_NATIVE_LANGUAGE_CODE];
    const learningLangName = languageNameMap[result.learningLanguageCode] || languageNameMap[DEFAULT_LEARNING_LANGUAGE_CODE];
    return {
      ollamaServerUrl: result.ollamaServerUrl,
      nativeLanguage: { code: result.nativeLanguageCode, name: nativeLangName },
      learningLanguage: { code: result.learningLanguageCode, name: learningLangName },
      aiTextModelName: result.aiTextModelName,
      aiMultimodalModelName: result.aiMultimodalModelName,
      appTheme: result.appTheme
    };
  } catch (e) {
    console.error("Error getting extension settings:", e);
    return {
      ollamaServerUrl: DEFAULT_OLLAMA_SERVER_URL,
      nativeLanguage: { code: DEFAULT_NATIVE_LANGUAGE_CODE, name: languageNameMap[DEFAULT_NATIVE_LANGUAGE_CODE] },
      learningLanguage: { code: DEFAULT_LEARNING_LANGUAGE_CODE, name: languageNameMap[DEFAULT_LEARNING_LANGUAGE_CODE] },
      aiTextModelName: DEFAULT_AI_TEXT_MODEL_NAME,
      aiMultimodalModelName: DEFAULT_AI_MULTIMODAL_MODEL_NAME,
      appTheme: "light"
    };
  }
}
function setupContextMenus() {
  browser.contextMenus.create({id: "translate-with-tangoji", title: "Translate with Tangoji", contexts: ["selection"]});
  browser.contextMenus.create({id: "capture-with-tangoji", title: "Capture with Tangoji", contexts: ["page", "selection", "image", "video"]});
  browser.contextMenus.create({id: "save-selection-to-tangoji", title: "Save Selection to Tangoji", contexts: ["selection"]});
}
browser.runtime.onInstalled.addListener(() => {
  setupContextMenus();
  browser.storage.local.get([
    "ollamaServerUrl",
    "nativeLanguageCode", "learningLanguageCode",
    "aiTextModelName", "aiMultimodalModelName", "appTheme"
  ]).then(result => {
    const defaultsToSet = {};
    if (!result.ollamaServerUrl) defaultsToSet.ollamaServerUrl = DEFAULT_OLLAMA_SERVER_URL;
    if (!result.nativeLanguageCode) defaultsToSet.nativeLanguageCode = DEFAULT_NATIVE_LANGUAGE_CODE;
    if (!result.learningLanguageCode) defaultsToSet.learningLanguageCode = DEFAULT_LEARNING_LANGUAGE_CODE;
    if (!result.aiTextModelName) defaultsToSet.aiTextModelName = DEFAULT_AI_TEXT_MODEL_NAME;
    if (!result.aiMultimodalModelName) defaultsToSet.aiMultimodalModelName = DEFAULT_AI_MULTIMODAL_MODEL_NAME;
    if (!result.appTheme) defaultsToSet.appTheme = "light";
    if (Object.keys(defaultsToSet).length > 0) {
      browser.storage.local.set(defaultsToSet);
    }
  });
});
async function saveTextToTempWordsDexie(textToSave) {
  if (!textToSave || textToSave.trim() === "") {
    return { success: false, error: "No text provided" };
  }
  const trimmedText = textToSave.trim();
  try {
    const existing = await db.temp_words.get({text: trimmedText});
    if (existing) {
      return { success: true, message: "Text already in temporary list.", id: existing.id, alreadyExisted: true };
    }
    const newId = await db.temp_words.add({
      text: trimmedText,
      timestamp: new Date().toISOString()
    });
    return { success: true, message: "Text saved to temporary list.", id: newId, alreadyExisted: false };
  } catch (error) {
    if (error.name === 'ConstraintError') {
        return { success: false, error: "Text already exists in temporary list (ConstraintError).", alreadyExisted: true };
    }
    return { success: false, error: error.message || "Failed to save text to temporary list." };
  }
}
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText ? info.selectionText.trim() : "";
  if (info.menuItemId === "save-selection-to-tangoji") {
    if (!selectedText) return;
    saveTextToTempWordsDexie(selectedText);
  } else if (info.menuItemId === "translate-with-tangoji") {
    if (!selectedText) return;
    browser.tabs.sendMessage(tab.id, { action: "showTranslatePopup", text: selectedText })
      .catch(err => console.error("Error sending message to selection_handler.js:", err));
  } else if (info.menuItemId === "capture-with-tangoji") {
    browser.tabs.sendMessage(tab.id, { action: "initiateAreaSelection" })
      .catch(err => console.error("Error sending message to capture_handler.js:", err));
  }
});
function parseOllamaResponse(ollamaData, expectedKeys) {
    if (ollamaData && ollamaData.response) {
        let aiResponseText = ollamaData.response.trim();
        if (aiResponseText.startsWith("```json")) {
            aiResponseText = aiResponseText.substring(7);
            if (aiResponseText.endsWith("```")) {
                aiResponseText = aiResponseText.slice(0, -3);
            }
            aiResponseText = aiResponseText.trim();
        } else if (aiResponseText.startsWith("```")) {
            aiResponseText = aiResponseText.substring(3);
            if (aiResponseText.endsWith("```")) {
                aiResponseText = aiResponseText.slice(0, -3);
            }
            aiResponseText = aiResponseText.trim();
        }
        try {
            const parsed = JSON.parse(aiResponseText);
            if (expectedKeys) {
                for (const key of expectedKeys) {
                    if (!(key in parsed)) {
                       console.warn(`Expected key "${key}" not found in AI response.`);
                    }
                }
            }
            return parsed;
        } catch (e) {
            console.error("Failed to parse AI JSON response. Raw text:", aiResponseText, "Error:", e);
            throw new Error("Failed to parse AI JSON response. Check AI model's output format or console for raw output.");
        }
    }
    console.error("AI response missing 'response' field or data is null. Full data:", ollamaData);
    throw new Error("AI response missing 'response' field or data is null.");
}
browser.webRequest.onBeforeSendHeaders.addListener(
  async (details) => {
    const settings = await getExtensionSettings();
    if (details.url.startsWith(settings.ollamaServerUrl)) {
      let newOriginSet = false;
      for (let header of details.requestHeaders) {
        if (header.name.toLowerCase() === "origin") {
          header.value = settings.ollamaServerUrl.startsWith("http://localhost") ? "http://localhost" :
                         settings.ollamaServerUrl.startsWith("http://127.0.0.1") ? "http://127.0.0.1" :
                         new URL(settings.ollamaServerUrl).origin;
          newOriginSet = true;
          break;
        }
      }
      if (!newOriginSet) {
        details.requestHeaders.push({
          name: "Origin",
          value: settings.ollamaServerUrl.startsWith("http://localhost") ? "http://localhost" :
                 settings.ollamaServerUrl.startsWith("http://127.0.0.1") ? "http://127.0.0.1" :
                 new URL(settings.ollamaServerUrl).origin
        });
      }
      return { requestHeaders: details.requestHeaders };
    }
    return { requestHeaders: details.requestHeaders };
  },
  { urls: ["<all_urls>"] },
  ["blocking", "requestHeaders"]
);
async function callOllamaDirectly(ollamaServerUrl, ollamaPayload) {
  const ollamaApiUrl = `${ollamaServerUrl}/api/generate`;
  const fetchOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ollamaPayload),
    credentials: "omit"
  };
  const response = await fetch(ollamaApiUrl, fetchOptions);
  if (!response.ok) {
    let errorDetails = `Direct Ollama request failed: ${response.status} ${response.statusText}`;
    try {
      const errData = await response.json();
      errorDetails += `. Details: ${errData.error || JSON.stringify(errData)}`;
    } catch (e) {
      const textData = await response.text().catch(() => "(could not get error body)");
      errorDetails += `. Body: ${textData}`;
    }
    throw new Error(errorDetails);
  }
  return response.json();
}
browser.browserAction.onClicked.addListener((tab) => {
  const dashboardUrl = browser.runtime.getURL("ui/dashboard/dashboard.html");
  browser.tabs.query({ url: dashboardUrl }).then((tabs) => {
    if (tabs.length > 0) {
      browser.tabs.update(tabs[0].id, { active: true });
      browser.windows.update(tabs[0].windowId, { focused: true });
    } else {
      browser.tabs.create({ url: dashboardUrl });
    }
  }).catch(error => {
    console.error("Error handling browserAction click:", error);
    browser.tabs.create({ url: dashboardUrl });
  });
});
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getAiTranslation") {
    (async () => {
      const settings = await getExtensionSettings();
      const textToTranslate = request.text;
      const promptForOllama = `For the provided text:
Text: "${textToTranslate}"
Tasks:
1.  Translate the text into ${settings.nativeLanguage.name}.
2.  Provide a brief explanation of the original text in ${settings.learningLanguage.name}.
3.  Provide one clear example sentence in ${settings.learningLanguage.name}.
Output Format:
Respond STRICTLY with a single, minified JSON object. The JSON object must contain: "translation", "explanation", "example".
If any piece cannot be provided, use an empty string "" for that key.
Example: {"translation":"Hola mundo","explanation":"A common greeting.","example":"Hello world is often the first program written."}`;
      const ollamaPayload = {
        model: settings.aiTextModelName,
        prompt: promptForOllama,
        stream: false,
        format: "json"
      };
      try {
        const ollamaData = await callOllamaDirectly(settings.ollamaServerUrl, ollamaPayload);
        const parsedResponse = parseOllamaResponse(ollamaData, ["translation", "explanation", "example"]);
        sendResponse({ success: true, data: parsedResponse });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
else if (request.action === "getAiMultimodalAnalysis") {
    (async () => {
        const settings = await getExtensionSettings();
        const base64ImageData = request.imageData;
        // console.log("BG: Received base64ImageData (raw):", base64ImageData);
        if (base64ImageData && typeof base64ImageData === 'string') {
            // console.log("BG: Length of base64ImageData:", base64ImageData.length);
            // console.log("BG: Start of base64ImageData:", base64ImageData.substring(0, 100));
        } else {
            console.error("BG: base64ImageData is not a string or is null/undefined!");
            sendResponse({ success: false, error: "Invalid image data received by background script." });
            return;
        }
        const ocrPrompt = `Extract all visible text from this image.
Respond STRICTLY with a single, minified JSON object with one key: "ocr_text".
Example: {"ocr_text": "Text found."}
If no text, "ocr_text" should be an empty string.`;
        const imageToSend = base64ImageData.split(',')[1] || base64ImageData;
        // console.log("BG: imageToSend to Ollama (first 100 chars):", imageToSend.substring(0, 100));
    // console.log("BG: Length of imageToSend:", imageToSend.length);
        const ocrPayload = {
            model: settings.aiMultimodalModelName,
            prompt: ocrPrompt,
            images: [imageToSend],
            stream: false,
            format: "json"
        };
        // console.log("BG: ocrPayload:", JSON.stringify(ocrPayload));
        try {
            // console.log("BG: Calling Ollama for OCR...");
            const ocrOllamaData = await callOllamaDirectly(settings.ollamaServerUrl, ocrPayload);
            // console.log("BG: Raw ocrOllamaData from Ollama:", JSON.stringify(ocrOllamaData));
            const ocrResult = parseOllamaResponse(ocrOllamaData, ["ocr_text"]);
            // console.log("BG: Parsed ocrResult:", ocrResult);
            const detectedText = ocrResult.ocr_text;
            // console.log("BG: detectedText:", detectedText);
            if (!detectedText || detectedText.trim() === "") {
                console.warn("BG: No text detected or text is empty. Sending N/A.");
                sendResponse({ success: true, data: { ocr_text: "", translation: `N/A (No text detected)` } });
                return;
            }
            const analysisPrompt = `Translate to ${settings.nativeLanguage.name}: "${detectedText}".
Respond STRICTLY with a single, minified JSON object with one key: "translation".
Example: {"translation": "Translated text."}`;
            const analysisPayload = {
                model: settings.aiTextModelName,
                prompt: analysisPrompt,
                stream: false,
                format: "json"
            };
      // console.log("BG: Calling Ollama for text analysis/translation...");
            const analysisOllamaData = await callOllamaDirectly(settings.ollamaServerUrl, analysisPayload);
      // console.log("BG: Raw analysisOllamaData from Ollama:", JSON.stringify(analysisOllamaData));
            const parsedAnalysis = parseOllamaResponse(analysisOllamaData, ["translation"]);
      // console.log("BG: Parsed analysisResult:", parsedAnalysis);
            const finalData = {
                ocr_text: detectedText,
                translation: parsedAnalysis.translation
            };
            sendResponse({ success: true, data: finalData });
        } catch (error) {
      console.error("BG: Error in getAiMultimodalAnalysis:", error.message, error.stack);
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
}
  else if (request.action === "saveToTangojiViaPopup") {
    (async () => {
        const result = await saveTextToTempWordsDexie(request.text);
        sendResponse(result);
    })();
    return true;
  }
  else if (request.action === "captureVisibleTab") {
    browser.tabs.captureVisibleTab(null, {format: "png"})
      .then(dataUrl => sendResponse({success: true, dataUrl: dataUrl}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true;
  }
  else if (request.action === "getDashboardStats") {
    (async () => {
      try {
        const totalCards = await db.cards.count();
        const pendingTempWords = await db.temp_words.count();
        const activelyStudyingCards = await db.cards.where('score').below(5).count();
        sendResponse({
          success: true,
          data: {
            totalCards: totalCards,
            pendingTempWords: pendingTempWords,
            activelyStudyingCards: activelyStudyingCards
          }
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  else if (request.action === "saveAllSettings") {
    const newSettings = request.settings;
    browser.storage.local.set(newSettings)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  else if (request.action === "loadAllSettings") {
    getExtensionSettings().then(settings => {
      sendResponse({ success: true, settings: settings });
    }).catch(err => sendResponse({ success: false, error: err.message}));
    return true;
  }
  else if (request.action === "getOllamaModelList") {
    (async () => {
        const settings = await getExtensionSettings();
        const ollamaUrlFromSettings = settings.ollamaServerUrl || DEFAULT_OLLAMA_SERVER_URL;
        const tagsUrl = `${ollamaUrlFromSettings}/api/tags`;
        try {
            const fetchOptions = { method: "GET", credentials: "omit" };
            const response = await fetch(tagsUrl, fetchOptions);
            if (!response.ok) {
                throw new Error(`Failed to fetch Ollama models: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            sendResponse({ success: true, models: data.models || [] });
        } catch (error) {
            sendResponse({ success: false, error: error.message, models: [] });
        }
    })();
    return true;
  }
  else if (request.action === "addTempWord") {
    (async () => {
      const result = await saveTextToTempWordsDexie(request.text);
      sendResponse(result);
    })();
    return true;
  }
  else if (request.action === "getTempWords") {
    (async () => {
      try {
        const words = await db.temp_words.orderBy('timestamp').reverse().toArray();
        sendResponse({ success: true, data: words });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  else if (request.action === "deleteTempWord") {
      (async () => {
          try {
              await db.temp_words.delete(request.id);
              sendResponse({ success: true });
          } catch (error) {
              sendResponse({ success: false, error: error.message });
          }
      })();
      return true;
  }
  else if (request.action === "getNextTempWord") {
    (async () => {
        try {
            const nextWord = await db.temp_words.orderBy('timestamp').first();
            if (nextWord) {
                sendResponse({ success: true, data: nextWord });
            } else {
                sendResponse({ success: true, data: null });
            }
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }
  else if (request.action === "saveCardAndProcessTempWord") {
    (async () => {
        const { card, tempWordId } = request;
        try {
            const newCardId = await db.cards.add({
                word: card.word,
                translation: card.translation,
                example: card.example || "",
                grammar_note: card.grammar_note || "",
                image_url: card.image_url || "",
                score: card.score || 0,
                created_at: card.created_at || new Date().toISOString(),
                tags: card.tags || []
            });
            if (newCardId && tempWordId) {
                await db.temp_words.delete(tempWordId);
            }
            sendResponse({ success: true, cardId: newCardId });
        } catch (error) {
            sendResponse({ success: false, error: error.message || "Failed to save card." });
        }
    })();
    return true;
  }
  else if (request.action === "saveManualCard") {
    (async () => {
        const { card } = request;
        try {
            const newCardId = await db.cards.add({
                word: card.word,
                translation: card.translation,
                example: card.example || "",
                grammar_note: card.grammar_note || "",
                image_url: card.image_url || "",
                score: card.score || 0,
                created_at: card.created_at || new Date().toISOString(),
                tags: card.tags || []
            });
            sendResponse({ success: true, cardId: newCardId });
        } catch (error) {
            sendResponse({ success: false, error: error.message || "Failed to save manual card." });
        }
    })();
    return true;
  }
  else if (request.action === "skipTempWord") {
    (async () => {
        const { id } = request;
        try {
            await db.temp_words.delete(id);
            sendResponse({ success: true });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }
  else if (request.action === "getCardForStudy") {
    (async () => {
        const lastStudiedCardId = request.lastStudiedCardId || null;
        try {
            let cardToReturn = null;
            let candidateCards = [];
            const lowScoreCards = await db.cards.where('score').below(5).toArray();
            if (lastStudiedCardId) {
                candidateCards = lowScoreCards.filter(card => card.id !== lastStudiedCardId);
            } else {
                candidateCards = lowScoreCards;
            }
            if (candidateCards.length > 0) {
                cardToReturn = candidateCards[Math.floor(Math.random() * candidateCards.length)];
            } else {
                let allCards = await db.cards.toArray();
                if (lastStudiedCardId) {
                    allCards = allCards.filter(card => card.id !== lastStudiedCardId);
                }
                if (allCards.length > 0) {
                   cardToReturn = allCards[Math.floor(Math.random() * allCards.length)];
                } else if (lowScoreCards.length === 1 && lowScoreCards[0].id === lastStudiedCardId) {
                    cardToReturn = null;
                } else if (await db.cards.count() === 1 && lastStudiedCardId && (await db.cards.get(lastStudiedCardId))) {
                    cardToReturn = null;
                }
            }
            sendResponse({ success: true, data: cardToReturn });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }
  else if (request.action === "recordStudyFeedback") {
    (async () => {
        const { cardId, status } = request;
        try {
            const card = await db.cards.get(cardId);
            if (!card) {
                sendResponse({ success: false, error: "Card not found" });
                return;
            }
            let newScore = card.score;
            let successForHistory = false;
            if (status === 'known') {
                newScore = (newScore || 0) + 1;
                successForHistory = true;
            } else if (status === 'failed') {
                newScore = Math.max(0, (newScore || 0) - 1);
            }
            await db.cards.update(cardId, { score: newScore });
            await db.study_history.add({
                card_id: cardId,
                success: successForHistory,
                timestamp: new Date().toISOString()
            });
            sendResponse({ success: true, newScore: newScore });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }
  else if (request.action === "getProgressPageData") {
    (async () => {
        try {
            const totalCards = await db.cards.count();
            const learnedCardsCount = await db.cards.where('score').aboveOrEqual(5).count();
            const studyHistory = await db.study_history.toArray();
            const totalStudyAttempts = studyHistory.length;
            const successfulAttempts = studyHistory.filter(entry => entry.success).length;
            const accuracyRate = totalStudyAttempts > 0 ? (successfulAttempts / totalStudyAttempts) * 100 : 0;
            const allCardsDetails = await db.cards.orderBy('created_at').reverse().toArray();
            sendResponse({
                success: true,
                data: {
                    totalCards,
                    learnedCardsCount,
                    accuracyRate,
                    totalStudyAttempts,
                    allCardsDetails
                }
            });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }
  else if (request.action === "getCardDetails") {
    (async () => {
      const cardId = parseInt(request.cardId, 10);
      if (isNaN(cardId)) {
        sendResponse({ success: false, error: "Invalid Card ID provided for getCardDetails." });
        return;
      }
      try {
        const card = await db.cards.get(cardId);
        if (card) {
          sendResponse({ success: true, data: card });
        } else {
          sendResponse({ success: false, error: "Card not found." });
        }
      } catch (error) {
        console.error("Error fetching card details:", error);
        sendResponse({ success: false, error: error.message || "Failed to fetch card details." });
      }
    })();
    return true;
  }
  else if (request.action === "updateCard") {
    (async () => {
      const cardIdToUpdate = parseInt(request.cardId, 10);
      const cardData = request.cardData;
      if (isNaN(cardIdToUpdate)) {
        sendResponse({ success: false, error: "Invalid Card ID provided for update." });
        return;
      }
      if (!cardData || typeof cardData !== 'object') {
        sendResponse({ success: false, error: "Invalid card data provided for update." });
        return;
      }
      try {
        const updatePayload = {
          word: cardData.word,
          translation: cardData.translation,
          example: cardData.example,
          grammar_note: cardData.grammar_note,
          image_url: cardData.image_url,
          updated_at: new Date().toISOString()
        };
        for (const key in updatePayload) {
            if (updatePayload[key] === undefined) {
                delete updatePayload[key];
            }
        }
        const updatedCount = await db.cards.update(cardIdToUpdate, updatePayload);
        if (updatedCount > 0) {
          console.log(`Card ${cardIdToUpdate} updated successfully.`);
          sendResponse({ success: true });
        } else {
          const exists = await db.cards.get(cardIdToUpdate);
          if (!exists) {
             sendResponse({ success: false, error: "Card not found for update." });
          } else {
            console.log(`Card ${cardIdToUpdate} data was identical, no effective update. Considered success.`);
            sendResponse({ success: true, message: "Data was identical, no changes applied." });
          }
        }
      } catch (error) {
        console.error("Error updating card:", error);
        sendResponse({ success: false, error: error.message || "Failed to update card in database." });
      }
    })();
    return true;
  }
  else if (request.action === "deleteCard") {
    (async () => {
      const cardIdToDelete = parseInt(request.cardId, 10);
      if (isNaN(cardIdToDelete)) {
        sendResponse({ success: false, error: "Invalid Card ID provided." });
        return;
      }
      try {
        const deleteCardPromise = db.cards.delete(cardIdToDelete);
        const deleteHistoryPromise = db.study_history.where('card_id').equals(cardIdToDelete).delete();
        await Promise.all([deleteCardPromise, deleteHistoryPromise]);
        console.log(`Card ${cardIdToDelete} and its study history deleted successfully.`);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error deleting card or its history:", error);
        sendResponse({ success: false, error: error.message || "Failed to delete card from database." });
      }
    })();
    return true;
  }
  else if (request.action === "resetStudyProgress") {
    (async () => {
        try {
            await db.cards.toCollection().modify({ score: 0 });
            await db.study_history.clear();
            sendResponse({ success: true });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }
  else if (request.action === "clearTempWords") {
    (async () => {
        try {
            await db.temp_words.clear();
            sendResponse({ success: true });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }
  else if (request.action === "deleteAllData") {
    (async () => {
        try {
            await db.cards.clear();
            await db.temp_words.clear();
            await db.study_history.clear();
            sendResponse({ success: true });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }
  else if (request.action === "exportData") {
    (async () => {
      let objectUrl = null;
      try {
        const cardsData = await db.cards.toArray();
        const tempWordsData = await db.temp_words.toArray();
        const studyHistoryData = await db.study_history.toArray();
        const settingsData = await browser.storage.local.get(null);
        const allData = {
          cards: cardsData,
          temp_words: tempWordsData,
          study_history: studyHistoryData,
          settings: settingsData,
          exportFormatVersion: "1.0",
          exportedAt: new Date().toISOString()
        };
        const jsonDataString = JSON.stringify(allData, null, 2);
        const blob = new Blob([jsonDataString], { type: "application/json" });
        objectUrl = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `tangoji_backup_${timestamp}.json`;
        browser.downloads.download({
          url: objectUrl,
          filename: filename,
          saveAs: true
        }).then((downloadId) => {
          if (downloadId) {
            sendResponse({ success: true, message: "Data export initiated." });
          } else {
            sendResponse({ success: false, error: "Failed to initiate download (no downloadId)." });
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
            }
          }
        }).catch(err => {
          sendResponse({ success: false, error: `Download API call failed: ${err.message}` });
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
        });
      } catch (error) {
        sendResponse({ success: false, error: `Export data preparation failed: ${error.message}` });
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    })();
    return true;
  }
  else if (request.action === "importData") {
    (async () => {
      const jsonDataString = request.payload;
      try {
        const importedData = JSON.parse(jsonDataString);
        if (!importedData || typeof importedData !== 'object') {
          throw new Error("Invalid import file format: Not an object.");
        }
        if (!importedData.exportFormatVersion || importedData.exportFormatVersion !== "1.0") {
          console.warn("Importing data from a potentially incompatible or unknown export version. File version:", importedData.exportFormatVersion);
        }
        const { cards, temp_words, study_history, settings } = importedData;
        if (!Array.isArray(cards) || !Array.isArray(temp_words) || !Array.isArray(study_history) || (settings && typeof settings !== 'object')) {
          throw new Error("Invalid import file structure: Missing or invalid data arrays/settings object.");
        }
        await db.transaction('rw', db.cards, db.temp_words, db.study_history, async () => {
          await db.cards.clear();
          await db.temp_words.clear();
          await db.study_history.clear();
          if (cards.length > 0) {
            await db.cards.bulkAdd(cards);
          }
          if (temp_words.length > 0) {
            await db.temp_words.bulkAdd(temp_words);
          }
          if (study_history.length > 0) {
            await db.study_history.bulkAdd(study_history);
          }
        });
        if (settings) {
          const {
            ollamaServerUrl, nativeLanguageCode, learningLanguageCode,
            aiTextModelName, aiMultimodalModelName, appTheme
          } = settings;
          const settingsToRestore = {};
          if (ollamaServerUrl !== undefined) settingsToRestore.ollamaServerUrl = ollamaServerUrl;
          if (nativeLanguageCode !== undefined) settingsToRestore.nativeLanguageCode = nativeLanguageCode;
          if (learningLanguageCode !== undefined) settingsToRestore.learningLanguageCode = learningLanguageCode;
          if (aiTextModelName !== undefined) settingsToRestore.aiTextModelName = aiTextModelName;
          if (aiMultimodalModelName !== undefined) settingsToRestore.aiMultimodalModelName = aiMultimodalModelName;
          if (appTheme !== undefined) settingsToRestore.appTheme = appTheme;
          if (Object.keys(settingsToRestore).length > 0) {
            await browser.storage.local.set(settingsToRestore);
          }
        }
        sendResponse({ success: true, message: "Data imported successfully. Please reload any open Tangoji pages." });
      } catch (error) {
        sendResponse({ success: false, error: `Import failed: ${error.message}` });
      }
    })();
    return true;
  }
  else {
    console.log("Background: Received unhandled action - ", request.action);
    sendResponse({ success: false, error: "Unhandled action" });
  }
  return true;
});