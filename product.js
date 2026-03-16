(function () {
  const site = window.SkyNetSite;

  if (!site) {
    return;
  }

  site.initNav();
  site.initCart();
  site.initQuickView();
  site.initTabs();
  site.initGallery();
  site.initCompare();
  site.initRevealAnimations();
  site.initGlobalEscapes();
  site.syncBodyLock();
})();
