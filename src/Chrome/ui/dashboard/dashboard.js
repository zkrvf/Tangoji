document.addEventListener('DOMContentLoaded', () => {
    const totalCardsEl = document.getElementById('totalCardsStat');
    const pendingTempWordsEl = document.getElementById('pendingTempWordsStat');
    const activelyStudyingCardsEl = document.getElementById('activelyStudyingCardsStat');
    function updateStats(stats) {
        if (!stats) return;
        if (totalCardsEl) totalCardsEl.textContent = stats.totalCards || 0;
        if (pendingTempWordsEl) pendingTempWordsEl.textContent = stats.pendingTempWords || 0;
        if (activelyStudyingCardsEl) activelyStudyingCardsEl.textContent = stats.activelyStudyingCards || 0;
    }
    chrome.runtime.sendMessage({ action: "getDashboardStats" })
        .then(response => {
            if (response && response.success) {
                console.log("Dashboard: Stats received", response.data);
                updateStats(response.data);
            } else {
                console.error("Dashboard: Failed to get stats", response ? response.error : "No response");
                updateStats({ totalCards: 'Err', pendingTempWords: 'Err', activelyStudyingCards: 'Err' });
            }
        })
        .catch(err => {
            console.error("Dashboard: Error sending message to background for stats:", err);
            updateStats({ totalCards: 'Err', pendingTempWords: 'Err', activelyStudyingCards: 'Err' });
        });
    console.log("Dashboard script loaded.");
});