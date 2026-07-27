(function () {
  'use strict';
  function syncLinks() {
    var locale = window.DemoI18n.locale();
    Array.prototype.forEach.call(document.querySelectorAll('[data-demo-link]'), function (link) {
      var url = new URL(link.getAttribute('href'), location.href);
      url.searchParams.set('lang', locale);
      link.href = url.href;
    });
  }
  window.DemoI18n.init();
  syncLinks();
  window.addEventListener('demo:locale', syncLinks);
})();
