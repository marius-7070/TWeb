(function () {
  const site = window.SkyNetSite;

  if (!site) {
    return;
  }

  site.initNav();
  site.initCart();
  site.initContactForm();
  site.initHangarIntel();
  site.initRevealAnimations();
  site.initGlobalEscapes();
  site.syncBodyLock();
})();
