(function () {
  const site = window.SkyNetSite;
  const doc = document;

  if (!site) {
    return;
  }

  const body = doc.body;
  const mode = body.getAttribute("data-auth-mode") === "register" ? "register" : "login";
  const form = doc.getElementById("authForm");
  const alert = doc.getElementById("authAlert");
  const statusCard = doc.getElementById("authStatus");
  const statusTitle = doc.getElementById("authStatusTitle");
  const statusMessage = doc.getElementById("authStatusMessage");
  const statusMeta = doc.getElementById("authStatusMeta");
  const continueLink = doc.getElementById("authContinueLink");
  const pageLogoutButton = doc.getElementById("authPageLogout");
  const submitButton = form ? form.querySelector('button[type="submit"]') : null;
  const defaultSubmitLabel = submitButton ? submitButton.textContent : "";

  function $(selector, root) {
    return (root || doc).querySelector(selector);
  }

  function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const next = String(params.get("next") || "").trim();

    if (!next || /^([a-z]+:)?\/\//i.test(next) || /^[a-z]+:/i.test(next)) {
      return "index.html";
    }

    return next.startsWith("/") ? next.slice(1) : next;
  }

  function setBusy(isBusy, pendingLabel) {
    if (!submitButton) {
      return;
    }

    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? pendingLabel : defaultSubmitLabel;
  }

  function showAlert(message, type) {
    if (!alert) {
      return;
    }

    alert.textContent = message || "";
    alert.classList.remove("is-error", "is-success");

    if (type === "error" || type === "success") {
      alert.classList.add("is-" + type);
    }
  }

  function renderSignedOutState() {
    if (form) {
      form.hidden = false;
    }

    if (statusCard) {
      statusCard.hidden = true;
    }
  }

  function renderSignedInState(user) {
    const redirectTarget = getRedirectTarget();
    const headline =
      mode === "register" ? "Contul tau este activ." : "Esti deja autentificat.";
    const message =
      mode === "register"
        ? "Poti intra direct in catalog sau continua explorarea site-ului."
        : "Sesiunea este deschisa pe acest dispozitiv si poate fi folosita imediat.";

    if (form) {
      form.hidden = true;
    }

    if (!statusCard) {
      return;
    }

    if (statusTitle) {
      statusTitle.textContent = headline;
    }

    if (statusMessage) {
      statusMessage.textContent = message;
    }

    if (statusMeta) {
      statusMeta.textContent = (user && user.name ? user.name : "Utilizator") + " | " + (user && user.email ? user.email : "");
    }

    if (continueLink) {
      continueLink.href = redirectTarget;
    }

    statusCard.hidden = false;
  }

  function syncPageState(authState) {
    if (authState && authState.user) {
      renderSignedInState(authState.user);
      return;
    }

    renderSignedOutState();
  }

  function logoutFromPage() {
    const headers = site.getAuthHeaders();

    site.clearAuthSession();
    renderSignedOutState();
    showAlert("Sesiunea a fost inchisa.", "success");

    if (!window.fetch || !headers.Authorization) {
      return;
    }

    window.fetch(site.resolveApiUrl("/api/auth/logout"), {
      method: "POST",
      headers: headers,
    }).catch(function () {
      return null;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form) {
      return;
    }

    const name = ($("#fullName", form) && $("#fullName", form).value.trim()) || "";
    const email = ($("#email", form) && $("#email", form).value.trim()) || "";
    const password = ($("#password", form) && $("#password", form).value) || "";
    const confirmPassword = ($("#confirmPassword", form) && $("#confirmPassword", form).value) || "";
    const terms = $("#terms", form);
    const isRegister = mode === "register";
    const requestBody = isRegister
      ? {
          name: name,
          email: email,
          password: password,
        }
      : {
          email: email,
          password: password,
        };
    const pendingLabel = isRegister ? "Cream contul..." : "Autentificam...";

    showAlert("", "");

    if (isRegister && !name) {
      showAlert("Introdu numele complet.", "error");
      return;
    }

    if (!email || !password) {
      showAlert("Completeaza campurile obligatorii.", "error");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAlert("Introdu o adresa de email valida.", "error");
      return;
    }

    if (isRegister && password.length < 8) {
      showAlert("Parola trebuie sa aiba cel putin 8 caractere.", "error");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      showAlert("Parolele introduse nu coincid.", "error");
      return;
    }

    if (isRegister && (!terms || !terms.checked)) {
      showAlert("Confirma acordul pentru a crea contul.", "error");
      return;
    }

    setBusy(true, pendingLabel);

    window
      .fetch(site.resolveApiUrl(isRegister ? "/api/auth/register" : "/api/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })
      .then(function (response) {
        return response.json().then(function (payload) {
          if (!response.ok) {
            throw new Error(payload.error || "Autentificarea nu a reusit.");
          }

          return payload;
        });
      })
      .then(function (payload) {
        site.setAuthSession(payload.sessionToken, payload.user);
        showAlert(payload.message + " Redirectionam...", "success");
        form.reset();
        renderSignedInState(payload.user);

        window.setTimeout(function () {
          window.location.href = getRedirectTarget();
        }, 900);
      })
      .catch(function (error) {
        showAlert(error.message || "Cererea nu a putut fi procesata.", "error");
      })
      .finally(function () {
        setBusy(false, pendingLabel);
      });
  }

  site.initNav();
  site.initCart();
  site.initRevealAnimations();
  site.initGlobalEscapes();
  site.syncBodyLock();

  if (continueLink) {
    continueLink.href = getRedirectTarget();
  }

  syncPageState(site.getAuthState());
  site.syncAuthSession().then(syncPageState);

  window.addEventListener("skynet-auth-change", function (event) {
    syncPageState((event && event.detail) || site.getAuthState());
  });

  if (form) {
    form.addEventListener("submit", handleSubmit);
  }

  if (pageLogoutButton) {
    pageLogoutButton.addEventListener("click", function () {
      logoutFromPage();
    });
  }
})();
