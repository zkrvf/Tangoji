document.addEventListener('DOMContentLoaded', async () => {
    const generateCardContainer = document.getElementById('generateCardContainer');
    const noTempWordsMessageDiv = document.getElementById('noTempWordsMessage_generate');
    const switchToManualCreateBtn = document.getElementById('switchToManualCreateBtn');
    const tempWordFormTemplate = document.getElementById('tempWordFormTemplate');
    const manualCardFormTemplate = document.getElementById('manualCardFormTemplate');
    const generateCardStatus = document.getElementById('generateCardStatus');
    const pageTitleElement = document.querySelector('h1');
    let currentTempWord = null;
    let statusTimeout;
    let editModeCardId = null;
    const urlParams = new URLSearchParams(window.location.search);
    const cardIdToEditParam = urlParams.get('edit_card_id');
    function displayStatus(message, type = 'success', duration = 3500) {
        if (!generateCardStatus) return;
        generateCardStatus.textContent = message;
        generateCardStatus.className = 'status-message';
        generateCardStatus.classList.add(type);
        void generateCardStatus.offsetWidth;
        generateCardStatus.classList.add('show');
        clearTimeout(statusTimeout);
        statusTimeout = setTimeout(() => {
            generateCardStatus.classList.remove('show');
        }, duration);
    }
    function displayAISuggestionStatus(formType, message) {
        const statusElId = formType === 'temp' ? 'aiSuggestionsStatus' : 'manualAiSuggestionsStatus';
        const statusEl = document.getElementById(statusElId);
        if (statusEl) {
            statusEl.textContent = message;
        }
    }
    function clearForm(formElement) {
        if (formElement) {
            formElement.reset();
            if (formElement.id === 'generateCardForm') {
                if(document.getElementById('temp_word_id')) document.getElementById('temp_word_id').value = '';
                if(document.getElementById('currentTempWordDisplay')) document.getElementById('currentTempWordDisplay').textContent = '';
                displayAISuggestionStatus('temp', '');
            } else if (formElement.id === 'manualGenerateCardForm') {
                displayAISuggestionStatus('manual', '');
            }
        }
    }
    function setupFormEventListeners(formType) {
        const isTempForm = formType === 'temp' && !editModeCardId;
        const formId = isTempForm ? 'generateCardForm' : 'manualGenerateCardForm';
        const form = document.getElementById(formId);
        if (!form) return;
        const wordFieldId = isTempForm ? 'word' : 'manual_word';
        const translationFieldId = isTempForm ? 'translation' : 'manual_translation';
        const exampleFieldId = isTempForm ? 'example' : 'manual_example';
        const grammarFieldId = isTempForm ? 'grammar_note' : 'manual_grammar_note';
        const imageUrlFieldId = isTempForm ? 'image_url' : 'manual_image_url';
        const wordInput = document.getElementById(wordFieldId);
        const translationInput = document.getElementById(translationFieldId);
        const exampleInput = document.getElementById(exampleFieldId);
        const grammarInput = document.getElementById(grammarFieldId);
        if (editModeCardId && !isTempForm) {
            const saveManualButton = document.getElementById('saveManualCardButton');
            if (saveManualButton) saveManualButton.textContent = 'Update Card';
            const loadNextBtn = document.getElementById('loadNextTempWordBtn');
            if(loadNextBtn) loadNextBtn.style.display = 'none';
        }
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const cardData = {
                word: formData.get(wordFieldId)?.trim(),
                translation: formData.get(translationFieldId)?.trim(),
                example: formData.get(exampleFieldId)?.trim() || '',
                grammar_note: formData.get(grammarFieldId)?.trim() || '',
                image_url: formData.get(imageUrlFieldId)?.trim() || '',
            };
            if (!cardData.word || !cardData.translation) {
                displayStatus('Word/Phrase and Translation are required.', 'error');
                return;
            }
            const actionButton = form.querySelector('button[type="submit"]');
            const originalButtonText = actionButton.textContent;
            actionButton.disabled = true;
            actionButton.textContent = editModeCardId ? 'Updating...' : 'Saving...';
            try {
                let response;
                if (editModeCardId) {
                    cardData.id = editModeCardId;
                    response = await browser.runtime.sendMessage({
                        action: "updateCard",
                        cardId: editModeCardId,
                        cardData: cardData
                    });
                } else if (isTempForm && currentTempWord) {
                    cardData.score = 0;
                    cardData.created_at = new Date().toISOString();
                    response = await browser.runtime.sendMessage({
                        action: "saveCardAndProcessTempWord",
                        card: cardData,
                        tempWordId: currentTempWord.id
                    });
                } else {
                    cardData.score = 0;
                    cardData.created_at = new Date().toISOString();
                    response = await browser.runtime.sendMessage({
                        action: "saveManualCard",
                        card: cardData
                    });
                }
                if (response && response.success) {
                    if (editModeCardId) {
                        displayStatus('Card updated successfully!', 'success', 2000); // Mensaje más corto antes de redirigir
                        setTimeout(() => {
                            window.location.href = '../progress/progress.html';
                        }, 1500); // Redirigir después de 1.5 segundos
                    } else {
                        displayStatus(`Card for "${cardData.word}" saved successfully!`, 'success');
                        clearForm(form); // Limpiar solo si es creación
                        if (isTempForm) {
                            loadNextTempWord();
                        } else {
                            const loadNextBtn = document.getElementById('loadNextTempWordBtn');
                            if(loadNextBtn) loadNextBtn.style.display = 'inline-block';
                        }
                    }
                } else {
                    displayStatus(`Error: ${response.error || 'Unknown error'}`, 'error', 5000);
                }
            } catch (e) {
                displayStatus(`Failed to process card: ${e.message}`, 'error', 5000);
            } finally {
                if (!editModeCardId || (editModeCardId && !(response && response.success))) {
                    actionButton.disabled = false;
                    actionButton.textContent = originalButtonText;
                    if (editModeCardId && !isTempForm) {
                       actionButton.textContent = 'Update Card';
                    }
                }
            }
        });
        const searchImageBtnId = isTempForm ? 'searchImageButton' : 'searchImageButtonManual';
        const searchImageButton = document.getElementById(searchImageBtnId);
        if (searchImageButton && wordInput) {
            searchImageButton.addEventListener('click', () => {
                const wordToSearch = wordInput.value.trim();
                if (wordToSearch) {
                    const duckDuckGoUrl = `https://duckduckgo.com/?q=${encodeURIComponent(wordToSearch)}&iar=images&iax=images&ia=images`;
                    window.open(duckDuckGoUrl, '_blank');
                } else {
                    displayStatus('Please enter a word/phrase first to search for an image.', 'error');
                }
            });
        }
        if (!isTempForm) { 
            const getAISuggestionsManualBtn = document.getElementById('getAISuggestionsManualBtn');
            if (getAISuggestionsManualBtn && wordInput && translationInput && exampleInput && grammarInput) {
                getAISuggestionsManualBtn.addEventListener('click', async () => {
                    const wordValue = wordInput.value.trim();
                    if (!wordValue) {
                        displayAISuggestionStatus('manual', 'Please enter a Word/Phrase first.');
                        return;
                    }
                    await fetchAndPopulateAISuggestions(wordValue, 'manual', translationInput, exampleInput, grammarInput);
                });
            }
            const loadNextTempWordBtn = document.getElementById('loadNextTempWordBtn');
            if(loadNextTempWordBtn && !editModeCardId) {
                loadNextTempWordBtn.addEventListener('click', loadNextTempWord);
            } else if (loadNextTempWordBtn && editModeCardId) {
                loadNextTempWordBtn.style.display = 'none';
            }
        }
        if (isTempForm) {
            const skipButton = document.getElementById('skipTempWordButton');
            if (skipButton) {
                skipButton.addEventListener('click', async () => {
                     if (currentTempWord && confirm(`Are you sure you want to skip "${currentTempWord.text}"?`)) {
                        try {
                            const response = await browser.runtime.sendMessage({
                                action: "skipTempWord",
                                id: currentTempWord.id
                            });
                            if (response && response.success) {
                                displayStatus(`Word "${currentTempWord.text}" skipped.`, 'success');
                                loadNextTempWord();
                            } else {
                                displayStatus(`Error skipping word: ${response.error || 'Unknown error'}`, 'error', 5000);
                            }
                        } catch (e) {
                            displayStatus(`Failed to skip word: ${e.message}`, 'error', 5000);
                        }
                    }
                });
            }
        }
    }
    async function fetchAndPopulateAISuggestions(wordValue, formType, translationEl, exampleEl, grammarEl) {
        displayAISuggestionStatus(formType, 'Fetching AI suggestions...');
        try {
            const response = await browser.runtime.sendMessage({
                action: "getAiTranslation", 
                text: wordValue
            });
            if (response && response.success && response.data) {
                const { translation, explanation, example } = response.data;
                if (translationEl && translation) translationEl.value = translation;
                if (exampleEl && example) exampleEl.value = example;
                if (grammarEl && explanation) grammarEl.value = explanation; 
                displayAISuggestionStatus(formType, 'AI suggestions loaded.');
            } else {
                displayAISuggestionStatus(formType, `Error fetching AI suggestions: ${response.error || 'No data'}`);
            }
        } catch (e) {
            displayAISuggestionStatus(formType, `Failed to get AI suggestions: ${e.message}`);
        }
    }
    function showForm(formTypeToShow, cardDataToEdit = null) {
        generateCardContainer.innerHTML = '';
        let templateNode;
        const effectiveFormType = editModeCardId ? 'manual' : formTypeToShow;
        if (effectiveFormType === 'temp' && tempWordFormTemplate) {
            templateNode = tempWordFormTemplate.content.cloneNode(true);
        } else if (effectiveFormType === 'manual' && manualCardFormTemplate) {
            templateNode = manualCardFormTemplate.content.cloneNode(true);
        }
        if (templateNode) {
            generateCardContainer.appendChild(templateNode);
            setupFormEventListeners(effectiveFormType);
            if(noTempWordsMessageDiv) noTempWordsMessageDiv.style.display = 'none';
            if (cardDataToEdit && effectiveFormType === 'manual') {
                document.getElementById('manual_word').value = cardDataToEdit.word || '';
                document.getElementById('manual_translation').value = cardDataToEdit.translation || '';
                document.getElementById('manual_example').value = cardDataToEdit.example || '';
                document.getElementById('manual_grammar_note').value = cardDataToEdit.grammar_note || '';
                document.getElementById('manual_image_url').value = cardDataToEdit.image_url || '';
                const getAISuggestionsBtn = document.getElementById('getAISuggestionsManualBtn');
                if (getAISuggestionsBtn) getAISuggestionsBtn.style.display = 'block'; 
                const loadNextTempWordBtn = document.getElementById('loadNextTempWordBtn');
                if(loadNextTempWordBtn) loadNextTempWordBtn.style.display = 'none';
            }
        } else {
            console.error(`Template for ${effectiveFormType} not found.`);
            if(noTempWordsMessageDiv) noTempWordsMessageDiv.style.display = 'block';
        }
    }
    async function loadNextTempWord() {
        currentTempWord = null; 
        if (editModeCardId) {
            return;
        }
        showForm('temp'); 
        const wordInput = document.getElementById('word');
        const translationInput = document.getElementById('translation');
        const exampleInput = document.getElementById('example');
        const grammarInput = document.getElementById('grammar_note');
        const tempWordIdInput = document.getElementById('temp_word_id');
        const currentTempWordDisplay = document.getElementById('currentTempWordDisplay');
        const form = document.getElementById('generateCardForm');
        if (!wordInput || !tempWordIdInput || !currentTempWordDisplay || !form) {
            showForm('manual');
            if(noTempWordsMessageDiv) noTempWordsMessageDiv.style.display = 'block';
            const loadNextBtn = document.getElementById('loadNextTempWordBtn');
            if(loadNextBtn) loadNextBtn.style.display = 'none';
            return;
        }
        clearForm(form); 
        try {
            const response = await browser.runtime.sendMessage({ action: "getNextTempWord" });
            if (response && response.success && response.data) {
                currentTempWord = response.data;
                wordInput.value = currentTempWord.text;
                tempWordIdInput.value = currentTempWord.id;
                currentTempWordDisplay.textContent = currentTempWord.text;
                if(noTempWordsMessageDiv) noTempWordsMessageDiv.style.display = 'none';
                await fetchAndPopulateAISuggestions(currentTempWord.text, 'temp', translationInput, exampleInput, grammarInput);
            } else {
                currentTempWord = null;
                showForm('manual'); 
                if(noTempWordsMessageDiv) noTempWordsMessageDiv.style.display = 'block';
                const loadNextBtn = document.getElementById('loadNextTempWordBtn');
                if(loadNextBtn) loadNextBtn.style.display = 'none';
                if (response && !response.success) {
                    displayStatus(`Error loading next word: ${response.error}`, 'error');
                }
            }
        } catch (e) {
            console.error("Error fetching next temp word:", e);
            displayStatus(`Failed to load next word: ${e.message}`, 'error');
            showForm('manual');
            if(noTempWordsMessageDiv) noTempWordsMessageDiv.style.display = 'block';
            const loadNextBtn = document.getElementById('loadNextTempWordBtn');
            if(loadNextBtn) loadNextBtn.style.display = 'none';
        }
    }
    if (switchToManualCreateBtn) {
        switchToManualCreateBtn.addEventListener('click', () => {
            editModeCardId = null; 
            if (pageTitleElement) pageTitleElement.textContent = 'Generate New Card';
            document.title = 'Tangoji - Generate Card';
            showForm('manual');
            const loadNextBtn = document.getElementById('loadNextTempWordBtn');
            if(loadNextBtn) loadNextBtn.style.display = 'inline-block'; 
        });
    }
    if (cardIdToEditParam) {
        editModeCardId = parseInt(cardIdToEditParam, 10);
        if (pageTitleElement) pageTitleElement.textContent = 'Edit Card';
        document.title = 'Tangoji - Edit Card'; 
        if(noTempWordsMessageDiv) noTempWordsMessageDiv.style.display = 'none';
        try {
            const response = await browser.runtime.sendMessage({
                action: "getCardDetails",
                cardId: editModeCardId
            });
            if (response && response.success && response.data) {
                showForm('manual', response.data);
            } else {
                displayStatus(`Error loading card for editing: ${response.error || 'Card not found'}`, 'error');
                editModeCardId = null; 
                if (pageTitleElement) pageTitleElement.textContent = 'Generate New Card';
                document.title = 'Tangoji - Generate Card';
                loadNextTempWord(); 
            }
        } catch (e) {
            displayStatus(`Failed to load card data: ${e.message}`, 'error');
            editModeCardId = null; 
            if (pageTitleElement) pageTitleElement.textContent = 'Generate New Card';
            document.title = 'Tangoji - Generate Card';
            loadNextTempWord(); 
        }
    } else { 
        editModeCardId = null;
        if (pageTitleElement) pageTitleElement.textContent = 'Generate New Card';
        document.title = 'Tangoji - Generate Card';
        const tempWordIdFromParam = urlParams.get('temp_word_id');
        const textFromParam = urlParams.get('text');
        if (tempWordIdFromParam && textFromParam) { 
            showForm('temp');
             currentTempWord = { id: parseInt(tempWordIdFromParam), text: textFromParam };
            const wordInput = document.getElementById('word');
            const translationInput = document.getElementById('translation');
            const exampleInput = document.getElementById('example');
            const grammarInput = document.getElementById('grammar_note');
            const tempWordIdInput = document.getElementById('temp_word_id');
            const currentTempWordDisplay = document.getElementById('currentTempWordDisplay');
            if(wordInput) wordInput.value = textFromParam;
            if(tempWordIdInput) tempWordIdInput.value = tempWordIdFromParam; 
            if(currentTempWordDisplay) currentTempWordDisplay.textContent = textFromParam;
            if(noTempWordsMessageDiv) noTempWordsMessageDiv.style.display = 'none';
            fetchAndPopulateAISuggestions(textFromParam, 'temp', translationInput, exampleInput, grammarInput);
        } else {
            loadNextTempWord(); 
        }
    }
});