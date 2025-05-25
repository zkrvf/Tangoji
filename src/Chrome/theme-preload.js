(() => {
  const KEY = 'appTheme';
  if (typeof document !== 'undefined' && typeof localStorage !== 'undefined' && typeof matchMedia !== 'undefined') {
    const root = document.documentElement;
    root.classList.add('no-transitions');
    const localSystemPrefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
    let currentThemeSetting = localStorage.getItem(KEY) || 'light';
    let activeTheme = currentThemeSetting;
    if (activeTheme === 'system') {
      activeTheme = localSystemPrefersDark ? 'dark' : 'light';
    }
    const applyThemeToDOM = (themeToMakeActive) => {
      if (themeToMakeActive === 'dark') {
        root.classList.add('dark-mode');
      } else {
        root.classList.remove('dark-mode');
      }
    };
    applyThemeToDOM(activeTheme);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const csStorage = chrome.storage.local;
      csStorage.get(KEY, (result) => {
        const themeInChromeStorage = result[KEY];
        if (themeInChromeStorage === undefined) {
          csStorage.set({ [KEY]: currentThemeSetting });
        } else if (themeInChromeStorage !== currentThemeSetting) {
          localStorage.setItem(KEY, themeInChromeStorage);
          let themeToApplyFromChrome = themeInChromeStorage;
          if (themeToApplyFromChrome === 'system') {
            themeToApplyFromChrome = localSystemPrefersDark ? 'dark' : 'light';
          }
          applyThemeToDOM(themeToApplyFromChrome);
        }
      });
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[KEY]) {
          const newThemeSetting = changes[KEY].newValue;
          localStorage.setItem(KEY, newThemeSetting);
          let newActiveTheme = newThemeSetting;
          if (newActiveTheme === 'system') {
            newActiveTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          }
          applyThemeToDOM(newActiveTheme);
        }
      });
    }
    requestAnimationFrame(() => {
      root.classList.remove('no-transitions');
    });
  }
})();