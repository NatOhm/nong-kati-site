(function () {
  try {
    var t = localStorage.getItem('nk-theme');
    if (t !== 'dark' && t !== 'light') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  try {
    var m = localStorage.getItem('nk-motion');
    if (m === 'on' || m === 'off') {
      document.documentElement.setAttribute('data-motion', m);
    }
  } catch (e) {}
})();
