if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  });
}

// 6 second splash then fade out
window.addEventListener('load', function() {
  setTimeout(function() {
    var splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(function() {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 600);
    }
  }, 6000);
});
