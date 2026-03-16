(function () {
  const site = window.SkyNetSite;

  if (!site) {
    return;
  }

  site.initNav();
  site.initCart();
  site.initQuickView();
  site.initCatalogFilters();
  site.initRevealAnimations();
  site.initGlobalEscapes();
  site.syncBodyLock();
})();
