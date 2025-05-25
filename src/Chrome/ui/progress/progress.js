document.addEventListener('DOMContentLoaded', () => {
    const statTotalCards = document.getElementById('statTotalCards');
    const statLearnedCards = document.getElementById('statLearnedCards');
    const statAccuracyRate = document.getElementById('statAccuracyRate');
    const statStudyAttempts = document.getElementById('statStudyAttempts');
    const allCardsTbody = document.getElementById('allCardsTbody');
    const noCardsMessage = document.getElementById('noCardsMessage');
    const allCardsTableContainer = document.getElementById('allCardsTableContainer');
    function renderProgressData(data) {
        if (!data) {
            if (statTotalCards) statTotalCards.textContent = 'N/A';
            if (statLearnedCards) statLearnedCards.textContent = 'N/A';
            if (statAccuracyRate) statAccuracyRate.textContent = 'N/A';
            if (statStudyAttempts) statStudyAttempts.textContent = '0';
            if (noCardsMessage) noCardsMessage.style.display = 'block';
            if (allCardsTableContainer) allCardsTableContainer.style.display = 'none';
            return;
        }
        if (statTotalCards) statTotalCards.textContent = data.totalCards || 0;
        if (statLearnedCards) statLearnedCards.textContent = data.learnedCardsCount || 0;
        if (statAccuracyRate) statAccuracyRate.textContent = `${(data.accuracyRate || 0).toFixed(2)}%`;
        if (statStudyAttempts) statStudyAttempts.textContent = data.totalStudyAttempts || 0;
        if (allCardsTbody) {
            allCardsTbody.innerHTML = '';
            if (data.allCardsDetails && data.allCardsDetails.length > 0) {
                if (noCardsMessage) noCardsMessage.style.display = 'none';
                if (allCardsTableContainer) allCardsTableContainer.style.display = 'block';
                data.allCardsDetails.forEach(card => {
                    const row = allCardsTbody.insertRow();
                    const cellWord = row.insertCell();
                    cellWord.textContent = card.word;
                    const cellTranslation = row.insertCell();
                    cellTranslation.textContent = card.translation;
                    const cellScore = row.insertCell();
                    cellScore.textContent = card.score;
                    const cellCreated = row.insertCell();
                    try {
                        cellCreated.textContent = card.created_at ? new Date(card.created_at).toLocaleDateString() : 'N/A';
                    } catch (e) {
                        cellCreated.textContent = 'Invalid Date';
                    }
                    const cellActions = row.insertCell();
                    cellActions.style.whiteSpace = 'nowrap';
                    const studyButton = document.createElement('a');
                    studyButton.href = `../study/study.html?card_id=${card.id}`;
                    studyButton.classList.add('btn', 'btn-sm', 'btn-primary');
                    studyButton.textContent = 'Study';
                    studyButton.style.marginRight = '5px';
                    cellActions.appendChild(studyButton);
                    const editButton = document.createElement('a');
                    editButton.href = `../generate/generate.html?edit_card_id=${card.id}`;
                    editButton.classList.add('btn', 'btn-sm', 'btn-secondary');
                    editButton.textContent = 'Edit';
                    editButton.style.marginRight = '5px';
                    cellActions.appendChild(editButton);
                    const deleteButton = document.createElement('button');
                    deleteButton.classList.add('btn', 'btn-sm', 'btn-danger');
                    deleteButton.textContent = 'Delete';
                    deleteButton.dataset.cardId = card.id;
                    deleteButton.addEventListener('click', async (event) => {
                        const cardIdToDelete = event.target.dataset.cardId;
                        await handleDeleteCard(cardIdToDelete);
                    });
                    cellActions.appendChild(deleteButton);
                });
            } else {
                if (noCardsMessage) noCardsMessage.style.display = 'block';
                if (allCardsTableContainer) allCardsTableContainer.style.display = 'none';
            }
        }
    }
    async function loadProgressData() {
        try {
            const runtimeAPI = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;
            const response = await runtimeAPI.sendMessage({ action: "getProgressPageData" });
            if (response && response.success) {
                renderProgressData(response.data);
            } else {
                console.error('Failed to load progress data:', response ? response.error : 'No response');
                renderProgressData(null);
            }
        } catch (error) {
            console.error('Error sending message to get progress data:', error);
            renderProgressData(null);
        }
    }
    async function handleDeleteCard(cardId) {
        if (!cardId) {
            console.error('No card ID provided for deletion.');
            return;
        }
        try {
            const runtimeAPI = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;
            const response = await runtimeAPI.sendMessage({
                action: "deleteCard",
                cardId: cardId
            });
            if (response && response.success) {
                console.log(`Card ${cardId} deleted successfully.`);
                loadProgressData();
            } else {
                console.error('Failed to delete card:', response ? response.error : 'No response');
                alert(`Failed to delete card: ${response ? response.error : 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error sending message to delete card:', error);
            alert('Error communicating with the extension to delete the card.');
        }
    }
    loadProgressData();
});