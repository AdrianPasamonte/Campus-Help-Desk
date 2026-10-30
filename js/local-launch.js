// Classic script: it can run even when file:// blocks JavaScript module imports.
(() => {
  if (location.protocol === 'file:') {
    document.documentElement.classList.add('local-file-mode');
  }
})();
