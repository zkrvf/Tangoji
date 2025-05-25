document.addEventListener('DOMContentLoaded', () => {
    const importWordsForm = document.getElementById('importWordsForm');
    const rawWordsTextarea = document.getElementById('raw_words');
    const addWordsButton = document.getElementById('addWordsButton');
    const importStatus = document.getElementById('importStatus');
    const tempWordsTbody = document.getElementById('tempWordsTbody');
    const tempWordCountSpan = document.getElementById('tempWordCount');
    const noTempWordsMessage = document.getElementById('noTempWordsMessage');
    const tempWordsTableContainer = document.getElementById('tempWordsTableContainer');
    let statusTimeout;
    function displayStatusMessage(message, type = 'success', duration = 3000) {
        if (!importStatus) return;
        importStatus.textContent = message;
        importStatus.className = 'status-message';
        importStatus.classList.add(type);
        void importStatus.offsetWidth;
        importStatus.classList.add('show');
        clearTimeout(statusTimeout);
        statusTimeout = setTimeout(() => {
            importStatus.classList.remove('show');
        }, duration);
    }
    function renderTempWords(words = []) {
        if (!tempWordsTbody || !tempWordCountSpan || !noTempWordsMessage || !tempWordsTableContainer) return;
        tempWordsTbody.innerHTML = '';
        tempWordCountSpan.textContent = `(${words.length})`;
        if (words.length === 0) {
            noTempWordsMessage.style.display = 'block';
            tempWordsTableContainer.style.display = 'none';
        } else {
            noTempWordsMessage.style.display = 'none';
            tempWordsTableContainer.style.display = 'block';
            words.forEach(word => {
                const row = tempWordsTbody.insertRow();
                const cellText = row.insertCell();
                cellText.textContent = word.text;
                const cellTimestamp = row.insertCell();
                try {
                    cellTimestamp.textContent = word.timestamp ? new Date(word.timestamp).toLocaleString() : 'N/A';
                } catch (e) {
                    cellTimestamp.textContent = 'Invalid Date';
                }
                const cellActions = row.insertCell();
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Delete';
                deleteButton.classList.add('btn', 'btn-danger', 'btn-sm');
                deleteButton.dataset.id = word.id;
                deleteButton.type = 'button';
                const createCardButton = document.createElement('a');
                createCardButton.textContent = 'Create Card';
                createCardButton.classList.add('btn', 'btn-secondary', 'btn-sm');
                createCardButton.href = `../generate/generate.html?temp_word_id=${word.id}&text=${encodeURIComponent(word.text)}`;
                cellActions.appendChild(deleteButton);
                cellActions.appendChild(createCardButton);
            });
        }
    }
    async function loadTempWords() {
        try {
            const response = await chrome.runtime.sendMessage({ action: "getTempWords" });
            if (response && response.success) {
                renderTempWords(response.data);
            } else {
                console.error('Failed to load temp words:', response.error);
                displayStatusMessage(`Error loading words: ${response.error || 'Unknown error'}`, 'error', 5000);
                renderTempWords([]);
            }
        } catch (error) {
            console.error('Error sending message to get temp words:', error);
            displayStatusMessage(`Error: ${error.message}`, 'error', 5000);
            renderTempWords([]);
        }
    }
    if (importWordsForm && rawWordsTextarea && addWordsButton) {
        importWordsForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const rawText = rawWordsTextarea.value.trim();
            if (!rawText) {
                displayStatusMessage('Please enter some words.', 'error', 3000);
                return;
            }
            addWordsButton.disabled = true;
            addWordsButton.textContent = 'Adding...';
            const wordsToImport = rawText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            if (wordsToImport.length === 0) {
                displayStatusMessage('No valid words entered.', 'error', 3000);
                addWordsButton.disabled = false;
                addWordsButton.textContent = 'Add to Temporary List';
                return;
            }
            let successCount = 0;
            let errorCount = 0;
            let alreadyExistsCount = 0;
            for (const wordText of wordsToImport) {
                try {
                    const response = await chrome.runtime.sendMessage({
                        action: "addTempWord",
                        text: wordText
                    });
                    if (response && response.success) {
                        if (response.alreadyExisted) {
                            alreadyExistsCount++;
                        } else {
                            successCount++;
                        }
                    } else {
                        errorCount++;
                        console.error(`Failed to add word "${wordText}": ${response.error}`);
                    }
                } catch (e) {
                    errorCount++;
                    console.error(`Error sending message to add word "${wordText}":`, e);
                }
            }
            let summaryMessage = "";
            if (successCount > 0) summaryMessage += `${successCount} new word(s) added. `;
            if (alreadyExistsCount > 0) summaryMessage += `${alreadyExistsCount} word(s) already existed. `;
            if (errorCount > 0) summaryMessage += `${errorCount} word(s) failed to add.`;
            if (summaryMessage.trim() === "") {
                summaryMessage = "Processing complete.";
            }
            displayStatusMessage(summaryMessage.trim(), errorCount > 0 ? 'error' : 'success', 5000);
            if (successCount > 0 || alreadyExistsCount > 0) {
                rawWordsTextarea.value = '';
            }
            addWordsButton.disabled = false;
            addWordsButton.textContent = 'Add to Temporary List';
            loadTempWords();
        });
    }
    if (tempWordsTbody) {
        tempWordsTbody.addEventListener('click', async (event) => {
            if (event.target.classList.contains('btn-danger') && event.target.dataset.id) {
                const wordId = parseInt(event.target.dataset.id);
                const wordTextElement = event.target.closest('tr')?.querySelector('td:first-child');
                const wordText = wordTextElement ? wordTextElement.textContent : 'this word';
                if (confirm(`Are you sure you want to delete "${wordText}" from the temporary list?`)) {
                    try {
                        const response = await chrome.runtime.sendMessage({
                            action: "deleteTempWord",
                            id: wordId
                        });
                        if (response && response.success) {
                            displayStatusMessage(`Word "${wordText}" deleted.`, 'success');
                            loadTempWords();
                        } else {
                            displayStatusMessage(`Error deleting word: ${response.error || 'Unknown error'}`, 'error', 5000);
                        }
                    } catch (error) {
                        console.error('Error sending message to delete temp word:', error);
                        displayStatusMessage(`Failed to delete word: ${error.message}`, 'error', 5000);
                    }
                }
            }
        });
    }
    loadTempWords();
});