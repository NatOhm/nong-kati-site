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
    // Mutating the meta before hydration makes React insert a SECOND viewport
    // tag during hydration (it does not adopt an element whose attributes it
    // did not set), and duplicate viewport tags are undefined behaviour. Add
    // the hint to the first tag, drop any duplicate, and re-run after mount.
    var tuneViewport = function () {
      if (!isChromeAndroid) return;
      var metas = document.querySelectorAll('meta[name="viewport"]');
      if (!metas.length) return;
      var keep = metas[0];
      var content = keep.getAttribute('content') || '';
      if (content && content.indexOf('interactive-widget') === -1) {
        keep.setAttribute('content', content + ', interactive-widget=resizes-content');
      }
      for (var i = 1; i < metas.length; i++) metas[i].remove();
    };
    tuneViewport();
    document.addEventListener('DOMContentLoaded', tuneViewport);
    window.addEventListener('load', function () {
      setTimeout(tuneViewport, 0);
    });
  } catch (e) {}
})();
