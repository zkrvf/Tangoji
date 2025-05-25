document.addEventListener('DOMContentLoaded', () => {
    const studyAreaContainer = document.getElementById('studyAreaContainer');
    const noCardsToStudyMessage = document.getElementById('noCardsToStudyMessage');
    const flashcardElement = document.getElementById('flashcard');
    const cardWord = document.getElementById('cardWord');
    const cardImageFront = document.getElementById('cardImageFront');
    const cardTranslation = document.getElementById('cardTranslation');
    const cardExampleP = document.getElementById('cardExampleP');
    const cardExample = document.getElementById('cardExample');
    const cardGrammarNoteP = document.getElementById('cardGrammarNoteP');
    const cardGrammarNote = document.getElementById('cardGrammarNote');
    const cardImageBack = document.getElementById('cardImageBack');
    const currentCardScoreDisplay = document.getElementById('currentCardScore');
    const flipCardButton = document.getElementById('flipCardButton');
    const feedbackKnownButton = document.getElementById('feedbackKnownButton');
    const feedbackFailedButton = document.getElementById('feedbackFailedButton');
    const skipCardButton = document.getElementById('skipCardButton');
    const studyStatusMessageElement = document.getElementById('studyStatusMessage');
    let currentCard = null;
    let lastStudiedCardId = null;
    let statusMessageTimeout;
    const FLIP_ANIMATION_DURATION = 600; 
    const POST_FEEDBACK_MESSAGE_DELAY = 1200;
    function displayAnimatedFeedback(message, type = 'success', duration = 1000) {
        if (!studyStatusMessageElement) return;
        let fullMessage = message;
        if (type === 'success') {
            fullMessage = `🎉 ${message} 🎊`;
        } else if (type === 'error') {
            fullMessage = `😥 ${message} 💔`;
        } else if (type === 'info') {
            fullMessage = `ℹ️ ${message}`;
        }
        studyStatusMessageElement.textContent = fullMessage;
        studyStatusMessageElement.className = 'animated-feedback-message';
        studyStatusMessageElement.classList.add(type);
        void studyStatusMessageElement.offsetWidth;
        studyStatusMessageElement.classList.add('show');
        clearTimeout(statusMessageTimeout);
        statusMessageTimeout = setTimeout(() => {
            studyStatusMessageElement.classList.remove('show');
        }, duration);
    }
    function updateFlashcardUI(card) {
        if (!card) {
            studyAreaContainer.style.display = 'none';
            noCardsToStudyMessage.style.display = 'block';
            currentCard = null;
            feedbackKnownButton.disabled = true;
            feedbackFailedButton.disabled = true;
            flipCardButton.disabled = true;
            skipCardButton.disabled = true; 
            return;
        }
        studyAreaContainer.style.display = 'flex';
        noCardsToStudyMessage.style.display = 'none';
        currentCard = card;
        flashcardElement.classList.remove('is-flipped');
        feedbackKnownButton.disabled = false;
        feedbackFailedButton.disabled = false;
        cardWord.textContent = card.word || 'N/A';
        cardTranslation.textContent = card.translation || 'N/A';
        if (card.example) {
            cardExample.textContent = card.example;
            cardExampleP.style.display = 'block';
        } else {
            cardExampleP.style.display = 'none';
        }
        if (card.grammar_note) {
            cardGrammarNote.textContent = card.grammar_note;
            cardGrammarNoteP.style.display = 'block';
        } else {
            cardGrammarNoteP.style.display = 'none';
        }
        if (card.image_url) {
            cardImageFront.src = card.image_url;
            cardImageBack.src = card.image_url;
            cardImageFront.style.display = 'block';
            cardImageBack.style.display = 'block';
            cardImageFront.onerror = () => cardImageFront.style.display = 'none';
            cardImageBack.onerror = () => cardImageBack.style.display = 'none';
        } else {
            cardImageFront.style.display = 'none';
            cardImageBack.style.display = 'none';
        }
        currentCardScoreDisplay.textContent = `Current Score: ${card.score}`;
    }
    async function loadCardForStudy() {
        flipCardButton.disabled = true;
        feedbackKnownButton.disabled = true;
        feedbackFailedButton.disabled = true;
        skipCardButton.disabled = true;
        try {
            const response = await browser.runtime.sendMessage({
                action: "getCardForStudy",
                lastStudiedCardId: lastStudiedCardId
            });
            if (response && response.success) {
                updateFlashcardUI(response.data);
            } else {
                displayAnimatedFeedback(`Error loading card: ${response.error || 'Unknown error'}`, 'error');
                updateFlashcardUI(null);
            }
        } catch (error) {
            displayAnimatedFeedback(`Failed to load card: ${error.message}`, 'error');
            updateFlashcardUI(null);
        } finally {
            if (currentCard) {
                flipCardButton.disabled = false;
                skipCardButton.disabled = false;
            }
        }
    }
    if (flipCardButton && flashcardElement) {
        flipCardButton.addEventListener('click', () => {
            if (!currentCard) return;
            flashcardElement.classList.toggle('is-flipped');
        });
    }
    async function processAndLoadNext(actionDetails) {
        if (!currentCard) return;
        const justStudiedCardId = currentCard.id;
        feedbackKnownButton.disabled = true;
        feedbackFailedButton.disabled = true;
        skipCardButton.disabled = true;
        flipCardButton.disabled = true;
        const afterFlipLogic = async () => {
            try {
                if (actionDetails.type === 'feedback') {
                    const response = await browser.runtime.sendMessage({
                        action: "recordStudyFeedback",
                        cardId: currentCard.id,
                        status: actionDetails.status
                    });
                    if (response && response.success) {
                        const feedbackMsg = actionDetails.status === 'known' ? "Great!" : "Keep trying!";
                        const feedbackType = actionDetails.status === 'known' ? 'success' : 'error';
                        displayAnimatedFeedback(feedbackMsg, feedbackType, 1000);
                    } else {
                        displayAnimatedFeedback(`Error: ${response.error || 'Unknown error'}`, 'error', 1500);
                    }
                } else if (actionDetails.type === 'skip') {
                    displayAnimatedFeedback('Card skipped.', 'info', 1000);
                }
                lastStudiedCardId = justStudiedCardId;
            } catch (error) {
                displayAnimatedFeedback(`Failed: ${error.message}`, 'error', 1500);
                if (actionDetails.type === 'feedback' || actionDetails.type === 'skip') {
                    lastStudiedCardId = justStudiedCardId;
                }
            } finally {
                setTimeout(() => {
                    loadCardForStudy();
                }, POST_FEEDBACK_MESSAGE_DELAY);
            }
        };
        if (flashcardElement.classList.contains('is-flipped') && actionDetails.type === 'feedback') { 
            flashcardElement.classList.remove('is-flipped');
            setTimeout(afterFlipLogic, FLIP_ANIMATION_DURATION);
        } else {
            afterFlipLogic();
        }
    }
    if (feedbackKnownButton) {
        feedbackKnownButton.addEventListener('click', () => processAndLoadNext({ type: 'feedback', status: 'known' }));
    }
    if (feedbackFailedButton) {
        feedbackFailedButton.addEventListener('click', () => processAndLoadNext({ type: 'feedback', status: 'failed' }));
    }
    if (skipCardButton) {
        skipCardButton.addEventListener('click', () => {
            processAndLoadNext({ type: 'skip' });
        });
    }
    loadCardForStudy();
});