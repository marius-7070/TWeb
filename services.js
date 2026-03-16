(function () {
  const site = window.SkyNetSite;

  if (!site) {
    return;
  }

  site.initNav();
  site.initCart();
  site.initRevealAnimations();
  site.initGlobalEscapes();
  site.syncBodyLock();
})();
