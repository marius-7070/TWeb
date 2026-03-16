(function () {
  const site = window.SkyNetSite;

  if (!site) {
    return;
  }

  site.initNav();
  site.initCart();
  site.initQuickView();
  site.initAccordion();
  site.initRevealAnimations();
  site.initStockSlider();
  site.initGlobalEscapes();
  site.syncBodyLock();
})();
