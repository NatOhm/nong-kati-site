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
  /* interactive-widget is a Chromium-only viewport key. Declaring it in the
     static metadata made Safari log "not recognized and ignored" and look as
     if the keyboard problem was handled there. Only Chrome for Android gets
     it (CriOS is WebKit and ignores it too). */
  try {
    var ua = navigator.userAgent;
    var isChromeAndroid = /Android/.test(ua) && /Chrome\//.test(ua);
    if (isChromeAndroid) {
      var vp = document.querySelector('meta[name="viewport"]');
      var content = vp && vp.getAttribute('content');
      if (content && content.indexOf('interactive-widget') === -1) {
        vp.setAttribute('content', content + ', interactive-widget=resizes-content');
      }
    }
  } catch (e) {}
})();
