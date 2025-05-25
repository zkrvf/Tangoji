document.addEventListener('DOMContentLoaded', () => {
  const ollamaServerUrlInput = document.getElementById('ollamaServerUrl');
  const nativeLanguageSelect = document.getElementById('nativeLanguageSelect');
  const learningLanguageSelect = document.getElementById('learningLanguageSelect');
  const aiTextModelSelect = document.getElementById('aiTextModelSelect');
  const aiMultimodalModelSelect = document.getElementById('aiMultimodalModelSelect');
  const saveAllSettingsButton = document.getElementById('saveAllSettings');
  const settingsStatus = document.getElementById('settingsStatus');
  const refreshModelsButton = document.getElementById('refreshModelsButton');
  const modelRefreshStatus = document.getElementById('modelRefreshStatus');
  const themeToggleCheckbox = document.getElementById('themeToggleCheckbox');
  const resetStudyProgressButton = document.getElementById('resetStudyProgressButton');
  const clearTempWordsButton = document.getElementById('clearTempWordsButton');
  const deleteAllDataButton = document.getElementById('deleteAllDataButton');
  const exportDataButton = document.getElementById('exportDataButton'); 
  const importDataInput = document.getElementById('importDataInput');   
  let statusTimeout;
  const storageApi = typeof browser !== 'undefined' ? browser : chrome; 
  const DEFAULT_SETTINGS = {
    ollamaServerUrl: 'http://localhost:11434',
    nativeLanguageCode: 'es',
    learningLanguageCode: 'en',
    aiTextModelName: 'gemma3:latest',
    aiMultimodalModelName: 'qwen2.5vl:latest',
    appTheme: 'light' 
  };
  function setTheme(theme) {
    document.documentElement.classList.toggle('dark-mode', theme === 'dark');
    const toggleTextElement = document.querySelector('.theme-toggle-label .toggle-text');
    if (toggleTextElement) {
        toggleTextElement.textContent = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    }
  }
  function storeTheme(theme) {
    localStorage.setItem('appTheme', theme); 
    storageApi.storage.local.set({ appTheme: theme }); 
  }
  function showStatusMessage(message, type = 'success', duration = 3000) {
    if (!settingsStatus) return;
    settingsStatus.textContent = message;
    settingsStatus.className = 'status-message'; 
    settingsStatus.classList.add(type); 
    void settingsStatus.offsetWidth;
    settingsStatus.classList.add('show');
    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      settingsStatus.classList.remove('show');
    }, duration);
  }
  async function loadModels(selectElement, selectedModelName) {
    if (!selectElement) return;
    const previouslySelected =
      selectedModelName && selectElement.querySelector(`option[value="${selectedModelName}"]`)
        ? selectedModelName
        : null;
    selectElement.innerHTML = '<option value="">Loading models...</option>';
    selectElement.disabled = true;
    if (modelRefreshStatus) modelRefreshStatus.textContent = 'Fetching...';
    try {
      const response = await storageApi.runtime.sendMessage({ action: 'getOllamaModelList' });
      selectElement.innerHTML = ''; 
      if (response && response.success && response.models && response.models.length > 0) {
        let foundSelected = false;
        response.models.forEach((model) => {
          const option = document.createElement('option');
          option.value = model.name;
          option.textContent = model.name;
          if (model.name === selectedModelName || model.name === previouslySelected) {
            option.selected = true;
            foundSelected = true;
          }
          selectElement.appendChild(option);
        });
        if (selectedModelName && !foundSelected) {
          const option = document.createElement('option');
          option.value = selectedModelName;
          option.textContent = `${selectedModelName} (saved, not in list)`;
          option.selected = true;
          selectElement.appendChild(option);
        }
        if (modelRefreshStatus) modelRefreshStatus.textContent = 'Models loaded.';
      } else if (response && response.models && response.models.length === 0) {
        selectElement.innerHTML = '<option value="">No models found</option>';
        if (modelRefreshStatus) modelRefreshStatus.textContent = 'No models available.';
      } else {
        selectElement.innerHTML = `<option value="">Error (refresh)</option>`;
        if (modelRefreshStatus) modelRefreshStatus.textContent = `Error: ${response.error || 'Unknown'}`;
      }
    } catch (error) {
      console.error('Error loading models:', error);
      selectElement.innerHTML = `<option value="">Error (console)</option>`;
      if (modelRefreshStatus) modelRefreshStatus.textContent = `Failed: ${error.message}`;
    } finally {
      selectElement.disabled = false;
      if (modelRefreshStatus) setTimeout(() => (modelRefreshStatus.textContent = ''), 4000);
    }
  }
  async function loadAllSettings() {
    try {
      const settings = await storageApi.storage.local.get(DEFAULT_SETTINGS);
      ollamaServerUrlInput.value = settings.ollamaServerUrl;
      nativeLanguageSelect.value = settings.nativeLanguageCode;
      learningLanguageSelect.value = settings.learningLanguageCode;
      themeToggleCheckbox.checked = settings.appTheme === 'dark';
      setTheme(settings.appTheme); 
      await loadModels(aiTextModelSelect, settings.aiTextModelName);
      await loadModels(aiMultimodalModelSelect, settings.aiMultimodalModelName);
    } catch (error) {
      console.error('Error loading settings, applying defaults:', error);
      ollamaServerUrlInput.value = DEFAULT_SETTINGS.ollamaServerUrl;
      nativeLanguageSelect.value = DEFAULT_SETTINGS.nativeLanguageCode;
      learningLanguageSelect.value = DEFAULT_SETTINGS.learningLanguageCode;
      themeToggleCheckbox.checked = DEFAULT_SETTINGS.appTheme === 'dark';
      setTheme(DEFAULT_SETTINGS.appTheme);
      await loadModels(aiTextModelSelect, DEFAULT_SETTINGS.aiTextModelName);
      await loadModels(aiMultimodalModelSelect, DEFAULT_SETTINGS.aiMultimodalModelName);
      showStatusMessage('Could not load settings, defaults applied.', 'error');
    }
  }
  if (themeToggleCheckbox) {
    themeToggleCheckbox.addEventListener('change', () => {
      const newTheme = themeToggleCheckbox.checked ? 'dark' : 'light';
      setTheme(newTheme);
      storeTheme(newTheme); 
    });
  }
  if (saveAllSettingsButton) {
    saveAllSettingsButton.addEventListener('click', async () => {
      const currentTheme = themeToggleCheckbox.checked ? 'dark' : 'light';
      const settingsToSave = {
        ollamaServerUrl: ollamaServerUrlInput.value.trim() || DEFAULT_SETTINGS.ollamaServerUrl,
        nativeLanguageCode: nativeLanguageSelect.value,
        learningLanguageCode: learningLanguageSelect.value,
        aiTextModelName: aiTextModelSelect.value || DEFAULT_SETTINGS.aiTextModelName,
        aiMultimodalModelName: aiMultimodalModelSelect.value || DEFAULT_SETTINGS.aiMultimodalModelName,
        appTheme: currentTheme
      };
      try {
        await storageApi.storage.local.set(settingsToSave);
        storeTheme(currentTheme); 
        showStatusMessage('All settings saved successfully!', 'success');
      } catch (error) {
        console.error('Failed to save settings:', error);
        showStatusMessage(`Failed to save settings: ${error.message}`, 'error', 5000);
      }
    });
  }
  if (refreshModelsButton) {
    refreshModelsButton.addEventListener('click', async () => {
      const currentTextModel = aiTextModelSelect.value;
      const currentMultimodalModel = aiMultimodalModelSelect.value;
      if (modelRefreshStatus) modelRefreshStatus.textContent = 'Refreshing models...';
      await loadModels(aiTextModelSelect, currentTextModel || DEFAULT_SETTINGS.aiTextModelName);
      await loadModels(aiMultimodalModelSelect, currentMultimodalModel || DEFAULT_SETTINGS.aiMultimodalModelName);
    });
  }
  async function handleDataManagementAction(action, confirmationMessage, successMessage) {
    if (confirmationMessage && !confirm(confirmationMessage)) return;
    try {
      const response = await storageApi.runtime.sendMessage({ action });
      if (response && response.success) {
        showStatusMessage(successMessage, 'success', 4000);
      } else {
        showStatusMessage(`Error: ${response.error || 'Operation failed.'}`, 'error', 5000);
      }
    } catch (error) {
      console.error(`Operation ${action} failed:`, error);
      showStatusMessage(`Operation failed: ${error.message}`, 'error', 5000);
    }
  }
  if (resetStudyProgressButton) {
    resetStudyProgressButton.addEventListener('click', () => {
      handleDataManagementAction(
        'resetStudyProgress',
        'Are you sure you want to reset all study progress?\nThis will set all card scores to 0 and clear your study history.',
        'Study progress has been reset.'
      );
    });
  }
  if (clearTempWordsButton) {
    clearTempWordsButton.addEventListener('click', () => {
      handleDataManagementAction(
        'clearTempWords',
        'Are you sure you want to delete all temporary words?',
        'All temporary words have been deleted.'
      );
    });
  }
  if (deleteAllDataButton) {
    deleteAllDataButton.addEventListener('click', () => {
      const confirmationPrompt =
        "This will PERMANENTLY delete ALL your cards, temporary words, and study history.\n\n" +
        "This action CANNOT be undone.\n\n" +
        "Type 'DELETE ALL' to confirm.";
      const userConfirmation = prompt(confirmationPrompt);
      if (userConfirmation === 'DELETE ALL') {
        handleDataManagementAction(
          'deleteAllData',
          'FINAL WARNING: Are you absolutely sure you want to delete ALL data? This cannot be undone.', 
          'All application data has been deleted.'
        );
      } else if (userConfirmation !== null) { 
        showStatusMessage('Deletion cancelled. Confirmation text did not match.', 'info', 4000);
      }
    });
  }
  if (exportDataButton) {
    exportDataButton.addEventListener('click', async () => {
      showStatusMessage('Initiating data export...', 'info', 5000);
      try {
        const response = await storageApi.runtime.sendMessage({ action: 'exportData' });
        if (response && response.success) {
          showStatusMessage(response.message || 'Data export process started. Check your downloads.', 'success', 6000);
        } else {
          showStatusMessage(`Export Error: ${response.error || 'Unknown error during export.'}`, 'error', 7000);
        }
      } catch (error) {
        console.error('Export failed:', error);
        showStatusMessage(`Export failed: ${error.message}`, 'error', 7000);
      }
    });
  }
  if (importDataInput) {
    importDataInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) {
        showStatusMessage('No file selected for import.', 'info');
        return;
      }
      if (file.type !== 'application/json') {
        showStatusMessage('Invalid file type. Please select a JSON file (.json).', 'error', 5000);
        event.target.value = ''; 
        return;
      }
      const confirmationMessage =
        'Are you sure you want to import data from this file?\n' +
        'This will attempt to overwrite existing data with the content of the file.\n' +
        'It is STRONGLY recommended to EXPORT your current data first as a backup.';
      if (!confirm(confirmationMessage)) {
        event.target.value = ''; 
        showStatusMessage('Import cancelled by user.', 'info');
        return;
      }
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const jsonData = e.target.result;
          JSON.parse(jsonData); 
          showStatusMessage('Importing data... This may take a moment. Please wait.', 'info', 15000); 
          const response = await storageApi.runtime.sendMessage({ action: 'importData', payload: jsonData });
          if (response && response.success) {
            showStatusMessage(response.message || 'Data imported successfully! You may need to reload the extension or relevant pages for all changes to take effect.', 'success', 7000);
          } else {
            showStatusMessage(`Import Error: ${response.error || 'Unknown error during import.'}`, 'error', 7000);
          }
        } catch (parseError) {
          console.error('Import failed - invalid JSON:', parseError);
          showStatusMessage(`Import failed: The selected file is not a valid JSON file. ${parseError.message}`, 'error', 7000);
        } finally {
          event.target.value = ''; 
        }
      };
      reader.onerror = () => {
        console.error('Failed to read the import file.');
        showStatusMessage('Failed to read the import file. Please try again.', 'error', 5000);
        event.target.value = ''; 
      };
      reader.readAsText(file);
    });
  }
  window.addEventListener('load', () =>
    document.documentElement.classList.remove('no-transitions')
  );
  loadAllSettings(); 
});