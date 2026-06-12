// PWA initialization — service worker + splash dismiss
// This file lives in /public so Vite copies it as-is without processing

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  });
}

window.addEventListener('load', function() {
  setTimeout(function() {
    var splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(function() {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 400);
    }
  }, 800);
});
