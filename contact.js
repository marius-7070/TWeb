(function () {
  const site = window.SkyNetSite;

  if (!site) {
    return;
  }

  site.initNav();
  site.initCart();
  site.initContactForm();
  site.initRevealAnimations();
  site.initGlobalEscapes();
  site.syncBodyLock();
})();
