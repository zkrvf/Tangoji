(() => {
  const KEY = 'appTheme';
  const root = document.documentElement;
  root.classList.add('no-transitions');

  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  let theme = localStorage.getItem(KEY) || 'light';
  if (theme === 'system') theme = prefersDark ? 'dark' : 'light';

  const setDark = () => {
    root.classList.add('dark-mode');
    root.style.background = '#121212';
    root.style.colorScheme = 'dark light';
  };
  const setLight = () => {
    root.classList.remove('dark-mode');
    root.style.background = '';
    root.style.colorScheme = '';
  };

  theme === 'dark' ? setDark() : setLight();

  const storage =
    (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
      ? chrome.storage.local
      : (typeof browser !== 'undefined' && browser.storage && browser.storage.local)
        ? browser.storage.local
        : null;

  if (storage) {
    storage.get(KEY, res => {
      const stored = res && res[KEY];
      if (!stored) {
        storage.set({ [KEY]: theme });
      } else if (stored !== theme) {
        stored === 'dark' || (stored === 'system' && prefersDark) ? setDark() : setLight();
        localStorage.setItem(KEY, stored);
      }
    });
  } else if (!localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, theme);
  }
})();