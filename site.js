(function () {
  const CART_KEY = "skynet-cart-v1";
  const COMPARE_KEY = "skynet-compare-v1";
  const doc = document;
  const body = doc.body;
  const mediaMobile = window.matchMedia("(max-width: 780px)");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const savedCart = readStorage(CART_KEY, []);
  const savedCompare = readStorage(COMPARE_KEY, []);

  const state = {
    cart: Array.isArray(savedCart) ? savedCart : [],
    compare: Array.isArray(savedCompare) ? savedCompare : [],
    toastTimer: null,
  };

  function $(selector, root) {
    return (root || doc).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || doc).querySelectorAll(selector));
  }

  function readStorage(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      return;
    }
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("ro-RO").format(Number(value) || 0) + " MDL";
  }

  function getProductMeta(product) {
    return [
      product.camera || "",
      product.flight ? product.flight + " min" : "",
      product.weight ? product.weight + " g" : "",
    ]
      .filter(Boolean)
      .join(" | ");
  }

  function normalizeProduct(source) {
    if (!source) {
      return null;
    }

    const card = source.closest("[data-name][data-price]");
    const data = source.dataset || {};
    const cardData = (card && card.dataset) || {};
    const imageElement = (card && $("img", card)) || null;
    const name = data.name || cardData.name || "";
    const price = Number(data.price || cardData.price || 0);

    if (!name || !price) {
      return null;
    }

    return {
      id: slugify(name),
      name: name,
      price: price,
      image: data.image || cardData.image || (imageElement && imageElement.src) || "",
      rating: data.rating || cardData.rating || "",
      category: data.category || cardData.category || "",
      camera: data.camera || cardData.camera || "",
      flight: data.flight || cardData.flight || "",
      weight: data.weight || cardData.weight || "",
    };
  }

  function syncBodyLock() {
    const cartOpen = $("#cartDrawer") && $("#cartDrawer").getAttribute("aria-hidden") === "false";
    const modalOpen = $("#quickViewModal") && $("#quickViewModal").getAttribute("aria-hidden") === "false";
    const navOpen = mediaMobile.matches && $("[data-nav]") && $("[data-nav]").classList.contains("is-open");
    body.classList.toggle("ui-locked", Boolean(cartOpen || modalOpen || navOpen));
  }

  function pulseCart() {
    $$("[data-cart-toggle]").forEach(function (button) {
      button.classList.remove("is-bump");
      void button.offsetWidth;
      button.classList.add("is-bump");
    });

    $$("[data-cart-count]").forEach(function (count) {
      count.classList.remove("is-bump");
      void count.offsetWidth;
      count.classList.add("is-bump");
    });
  }

  function showToast(message) {
    const toast = $("#toast");

    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.classList.add("is-visible");

    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }

    state.toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  function getCartCount() {
    return state.cart.reduce(function (sum, item) {
      return sum + item.quantity;
    }, 0);
  }

  function getCartTotal() {
    return state.cart.reduce(function (sum, item) {
      return sum + item.quantity * item.price;
    }, 0);
  }

  function saveCart() {
    writeStorage(CART_KEY, state.cart);
    renderCart();
  }

  function saveCompare() {
    writeStorage(COMPARE_KEY, state.compare);
    renderCompare();
  }

  function renderCart() {
    const count = getCartCount();
    const total = formatPrice(getCartTotal());
    const hasItems = state.cart.length > 0;

    $$("[data-cart-count]").forEach(function (element) {
      element.textContent = String(count);
    });

    $$("[data-cart-total]").forEach(function (element) {
      element.textContent = total;
    });

    $$("[data-cart-empty]").forEach(function (element) {
      element.hidden = hasItems;
    });

    $$(".cart-summary").forEach(function (element) {
      element.hidden = !hasItems;
    });

    $$("[data-cart-items]").forEach(function (container) {
      container.innerHTML = "";

      state.cart.forEach(function (item) {
        const article = doc.createElement("article");
        article.className = "cart-item";
        article.dataset.id = item.id;

        article.innerHTML =
          '<img class="cart-item__image" src="' +
          item.image +
          '" alt="' +
          item.name +
          '">' +
          "<div>" +
          '  <div class="cart-item__head">' +
          "    <div>" +
          '      <h4 class="cart-item__title">' +
          item.name +
          "</h4>" +
          '      <p class="cart-item__meta">' +
          (item.meta || "Configuratie standard") +
          "</p>" +
          "    </div>" +
          '    <strong class="cart-item__price">' +
          formatPrice(item.price * item.quantity) +
          "</strong>" +
          "  </div>" +
          '  <div class="cart-item__controls">' +
          '    <div class="cart-qty" aria-label="Cantitate">' +
          '      <button type="button" data-cart-action="decrease">-</button>' +
          "      <span>" +
          item.quantity +
          "</span>" +
          '      <button type="button" data-cart-action="increase">+</button>' +
          "    </div>" +
          '    <button class="cart-remove" type="button" data-cart-action="remove">Sterge</button>' +
          "  </div>" +
          "</div>";

        container.appendChild(article);
      });
    });
  }

  function addToCart(product) {
    if (!product) {
      return;
    }

    const existing = state.cart.find(function (item) {
      return item.id === product.id;
    });

    if (existing) {
      existing.quantity += 1;
    } else {
      state.cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: 1,
        meta: getProductMeta(product),
      });
    }

    saveCart();
    pulseCart();
    openCart();
    showToast(product.name + " a fost adaugat in cos.");
  }

  function updateCartItem(itemId, action) {
    const itemIndex = state.cart.findIndex(function (item) {
      return item.id === itemId;
    });

    if (itemIndex === -1) {
      return;
    }

    if (action === "increase") {
      state.cart[itemIndex].quantity += 1;
    }

    if (action === "decrease") {
      state.cart[itemIndex].quantity -= 1;
    }

    if (action === "remove" || state.cart[itemIndex].quantity <= 0) {
      state.cart.splice(itemIndex, 1);
    }

    saveCart();
  }

  function openCart() {
    const drawer = $("#cartDrawer");

    if (!drawer) {
      return;
    }

    drawer.setAttribute("aria-hidden", "false");

    $$("[data-cart-toggle]").forEach(function (button) {
      button.setAttribute("aria-expanded", "true");
    });

    syncBodyLock();
  }

  function closeCart() {
    const drawer = $("#cartDrawer");

    if (!drawer) {
      return;
    }

    drawer.setAttribute("aria-hidden", "true");

    $$("[data-cart-toggle]").forEach(function (button) {
      button.setAttribute("aria-expanded", "false");
    });

    syncBodyLock();
  }

  function initCart() {
    renderCart();

    $$("[data-cart-toggle]").forEach(function (button) {
      button.addEventListener("click", function () {
        const drawer = $("#cartDrawer");

        if (!drawer || drawer.getAttribute("aria-hidden") === "true") {
          openCart();
        } else {
          closeCart();
        }
      });
    });

    $$("[data-cart-close], [data-cart-overlay]").forEach(function (element) {
      element.addEventListener("click", closeCart);
    });

    $$("[data-cart-items]").forEach(function (container) {
      container.addEventListener("click", function (event) {
        const actionButton = event.target.closest("[data-cart-action]");

        if (!actionButton) {
          return;
        }

        const item = actionButton.closest(".cart-item");

        if (!item) {
          return;
        }

        updateCartItem(item.dataset.id, actionButton.dataset.cartAction);
      });
    });

    $$(".js-add-cart").forEach(function (button) {
      button.addEventListener("click", function () {
        addToCart(normalizeProduct(button));
      });
    });

    $$(".cart-summary .btn").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!state.cart.length) {
          showToast("Cosul este gol.");
          return;
        }

        showToast("Comanda demo este gata pentru confirmare.");
      });
    });
  }

  function openModal() {
    const modal = $("#quickViewModal");

    if (!modal) {
      return;
    }

    modal.setAttribute("aria-hidden", "false");
    syncBodyLock();
  }

  function closeModal() {
    const modal = $("#quickViewModal");

    if (!modal) {
      return;
    }

    modal.setAttribute("aria-hidden", "true");
    syncBodyLock();
  }

  function initQuickView() {
    const modal = $("#quickViewModal");

    if (!modal) {
      return;
    }

    const modalTitle = $("#modalTitle", modal);
    const modalImage = $("#modalImage", modal);
    const modalMeta = $("#modalMeta", modal);
    const modalPrice = $("#modalPrice", modal);
    const modalRating = $("#modalRating", modal);
    const modalButton = $(".js-add-cart", modal);

    $$(".js-quick-view").forEach(function (button) {
      button.addEventListener("click", function () {
        const product = normalizeProduct(button);

        if (!product) {
          return;
        }

        modalTitle.textContent = product.name;
        modalImage.src = product.image;
        modalImage.alt = product.name;
        modalMeta.textContent = getProductMeta(product) || product.category || "Specificatii disponibile in pagina produsului.";
        modalPrice.textContent = formatPrice(product.price);
        modalRating.textContent = product.rating ? "Rating " + product.rating : "Model verificat";
        modalButton.dataset.name = product.name;
        modalButton.dataset.price = String(product.price);
        modalButton.dataset.image = product.image;
        modalButton.dataset.camera = product.camera;
        modalButton.dataset.flight = product.flight;
        modalButton.dataset.weight = product.weight;
        modalButton.dataset.rating = product.rating;
        modalButton.dataset.category = product.category;

        openModal();
      });
    });

    $$("[data-modal-close], [data-modal-overlay]").forEach(function (element) {
      element.addEventListener("click", closeModal);
    });
  }

  function initTabs() {
    $$("[data-tabs]").forEach(function (tabs) {
      const buttons = $$(".tabs__tab", tabs);

      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          buttons.forEach(function (currentButton) {
            const panelId = currentButton.getAttribute("aria-controls");
            const panel = panelId ? $("#" + panelId, tabs) : null;
            const isActive = currentButton === button;

            currentButton.setAttribute("aria-selected", String(isActive));

            if (panel) {
              panel.hidden = !isActive;
            }
          });
        });
      });
    });
  }

  function initAccordion() {
    $$("[data-accordion]").forEach(function (accordion) {
      accordion.addEventListener("click", function (event) {
        const trigger = event.target.closest(".accordion__trigger");

        if (!trigger) {
          return;
        }

        const targetId = trigger.getAttribute("aria-controls");
        const targetPanel = targetId ? $("#" + targetId, accordion) : null;
        const shouldOpen = trigger.getAttribute("aria-expanded") !== "true";

        $$(".accordion__trigger", accordion).forEach(function (button) {
          button.setAttribute("aria-expanded", "false");

          const panelId = button.getAttribute("aria-controls");
          const panel = panelId ? $("#" + panelId, accordion) : null;

          if (panel) {
            panel.hidden = true;
          }
        });

        if (targetPanel && shouldOpen) {
          trigger.setAttribute("aria-expanded", "true");
          targetPanel.hidden = false;
        }
      });
    });
  }

  function initNav() {
    const nav = $("[data-nav]");
    const toggle = $("[data-nav-toggle]");

    if (!nav || !toggle) {
      return;
    }

    toggle.addEventListener("click", function () {
      const isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      syncBodyLock();
    });

    $$("a", nav).forEach(function (link) {
      link.addEventListener("click", function () {
        if (!mediaMobile.matches) {
          return;
        }

        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        syncBodyLock();
      });
    });

    mediaMobile.addEventListener("change", function () {
      if (!mediaMobile.matches) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }

      syncBodyLock();
    });
  }

  function initCatalogFilters() {
    const catalog = $("[data-catalog]");

    if (!catalog) {
      return;
    }

    const grid = $("[data-product-grid]", catalog);
    const cards = grid ? $$(".product-card", grid) : [];
    const priceMin = $("#priceMin", catalog);
    const priceMax = $("#priceMax", catalog);
    const flightMin = $("#flightMin", catalog);
    const camera = $("#camera", catalog);
    const weightMax = $("#weightMax", catalog);
    const sort = $("#sort", catalog);
    const results = $("#resultsCount", catalog);
    const emptyState = $("#emptyState", catalog);
    const resetButtons = [$("#resetFilters", catalog), $("#resetFiltersEmpty", catalog)].filter(Boolean);
    const categories = $$('input[name="category"]', catalog);

    function getNumber(input) {
      return input && input.value ? Number(input.value) : null;
    }

    function sortCards(sortValue) {
      const comparators = {
        popularity: function (a, b) {
          return Number(b.dataset.popularity) - Number(a.dataset.popularity);
        },
        "price-asc": function (a, b) {
          return Number(a.dataset.price) - Number(b.dataset.price);
        },
        "price-desc": function (a, b) {
          return Number(b.dataset.price) - Number(a.dataset.price);
        },
        rating: function (a, b) {
          return Number(b.dataset.rating) - Number(a.dataset.rating);
        },
      };

      const compare = comparators[sortValue] || comparators.popularity;
      cards.slice().sort(compare).forEach(function (card) {
        grid.appendChild(card);
      });
    }

    function applyFilters() {
      const min = getNumber(priceMin);
      const max = getNumber(priceMax);
      const flight = getNumber(flightMin);
      const weight = getNumber(weightMax);
      const selectedCategories = categories
        .filter(function (input) {
          return input.checked;
        })
        .map(function (input) {
          return input.value;
        });

      sortCards(sort ? sort.value : "popularity");

      let visibleCount = 0;

      cards.forEach(function (card) {
        const data = card.dataset;
        const price = Number(data.price);
        const productFlight = Number(data.flight);
        const productWeight = Number(data.weight);
        const matchCategory = !selectedCategories.length || selectedCategories.includes(data.category);
        const matchPrice = (min === null || price >= min) && (max === null || price <= max);
        const matchFlight = flight === null || productFlight >= flight;
        const matchCamera = !camera || camera.value === "any" || data.camera === camera.value;
        const matchWeight = weight === null || productWeight <= weight;
        const visible = matchCategory && matchPrice && matchFlight && matchCamera && matchWeight;

        card.hidden = !visible;

        if (visible) {
          visibleCount += 1;
        }
      });

      if (results) {
        results.textContent = visibleCount + " produse";
      }

      if (emptyState) {
        emptyState.hidden = visibleCount !== 0;
      }
    }

    [priceMin, priceMax, flightMin, camera, weightMax, sort]
      .filter(Boolean)
      .forEach(function (input) {
        const eventName = input.tagName === "SELECT" ? "change" : "input";
        input.addEventListener(eventName, applyFilters);
      });

    categories.forEach(function (input) {
      input.addEventListener("change", applyFilters);
    });

    resetButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        [priceMin, priceMax, flightMin, weightMax].forEach(function (input) {
          if (input) {
            input.value = "";
          }
        });

        if (camera) {
          camera.value = "any";
        }

        if (sort) {
          sort.value = "popularity";
        }

        categories.forEach(function (input) {
          input.checked = false;
        });

        applyFilters();
      });
    });

    applyFilters();
  }

  function initGallery() {
    const mainImage = $(".product-gallery__main img");
    const thumbs = $$(".product-gallery__thumbs img");

    if (!mainImage || !thumbs.length) {
      return;
    }

    function activateThumb(thumb) {
      mainImage.src = thumb.src;
      mainImage.alt = thumb.alt;

      thumbs.forEach(function (image) {
        image.classList.toggle("is-active", image === thumb);
      });
    }

    thumbs.forEach(function (thumb, index) {
      thumb.tabIndex = 0;
      thumb.setAttribute("role", "button");
      thumb.setAttribute("aria-label", "Vezi imaginea " + (index + 1));

      thumb.addEventListener("click", function () {
        activateThumb(thumb);
      });

      thumb.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        activateThumb(thumb);
      });
    });

    activateThumb(thumbs[0]);
  }

  function initCompare() {
    const compareButtons = $$("[data-compare-toggle]");
    const status = $("#compareStatus");

    if (!compareButtons.length && !status) {
      return;
    }

    compareButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        const product = normalizeProduct(button);

        if (!product) {
          return;
        }

        const existingIndex = state.compare.findIndex(function (item) {
          return item.id === product.id;
        });

        if (existingIndex >= 0) {
          state.compare.splice(existingIndex, 1);
          showToast(product.name + " a fost scos din comparatie.");
        } else {
          if (state.compare.length >= 3) {
            state.compare.shift();
          }

          state.compare.push({
            id: product.id,
            name: product.name,
            price: product.price,
          });

          showToast(product.name + " a fost adaugat in comparatie.");
        }

        saveCompare();
      });
    });

    renderCompare();
  }

  function renderCompare() {
    const status = $("#compareStatus");
    const activeIds = new Set(
      state.compare.map(function (item) {
        return item.id;
      })
    );

    $$("[data-compare-toggle]").forEach(function (button) {
      const product = normalizeProduct(button);
      const isActive = product ? activeIds.has(product.id) : false;

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
      button.textContent = isActive ? "Elimina din comparatie" : "Adauga la comparatie";
    });

    if (status) {
      status.textContent = "Comparatie: " + state.compare.length + " produse";
    }
  }

  function initContactForm() {
    const form = $("#contactForm");
    const alert = $("#formAlert");

    if (!form || !alert) {
      return;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const name = ($("#name", form) && $("#name", form).value.trim()) || "";
      const email = ($("#email", form) && $("#email", form).value.trim()) || "";
      const message = ($("#message", form) && $("#message", form).value.trim()) || "";
      const terms = $("#terms", form);
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      alert.classList.remove("is-error", "is-success");

      if (!name || !email || !message || !terms || !terms.checked) {
        alert.textContent = "Completeaza toate campurile obligatorii si confirma acordul.";
        alert.classList.add("is-error");
        return;
      }

      if (!emailValid) {
        alert.textContent = "Introdu o adresa de email valida.";
        alert.classList.add("is-error");
        return;
      }

      form.reset();
      alert.textContent = "Mesajul a fost trimis. Revenim in maximum 24h.";
      alert.classList.add("is-success");
      showToast("Mesajul tau a fost trimis.");
    });
  }

  function initRevealAnimations() {
    const selectors = [
      ".hero__content",
      ".hero__media",
      ".section__head",
      ".grid > article",
      ".hero__stats > div",
      ".catalog__layout > *",
      ".product-hero__grid > *",
      ".about > *",
      ".contact > *",
      ".services-hero__grid > *",
      ".timeline__item",
      ".accordion__item",
      ".cta",
      ".cta__inner",
      ".tabs",
    ];

    const elements = [];
    const seen = new Set();

    selectors.forEach(function (selector) {
      $$(selector).forEach(function (element, index) {
        if (seen.has(element)) {
          return;
        }

        seen.add(element);
        element.classList.add("reveal-item");
        element.style.setProperty("--reveal-delay", String((index % 4) * 70) + "ms");
        elements.push(element);
      });
    });

    if (!elements.length) {
      return;
    }

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      elements.forEach(function (element) {
        element.classList.add("is-visible");
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.16,
        rootMargin: "0px 0px -10% 0px",
      }
    );

    elements.forEach(function (element) {
      observer.observe(element);
    });
  }

  function initStockSlider() {
    const viewport = $("[data-stock-slider]");

    if (!viewport || prefersReducedMotion) {
      return;
    }

    const track = $(".best-sellers__track", viewport);

    if (!track) {
      return;
    }

    let isPaused = false;
    const cards = $$(".product-card", track);

    if (!cards.length) {
      return;
    }

    ["mouseenter", "focusin", "touchstart"].forEach(function (eventName) {
      viewport.addEventListener(eventName, function () {
        isPaused = true;
      });
    });

    ["mouseleave", "focusout", "touchend"].forEach(function (eventName) {
      viewport.addEventListener(eventName, function () {
        isPaused = false;
      });
    });

    window.setInterval(function () {
      if (isPaused) {
        return;
      }

      const firstCard = cards[0];
      const trackStyles = window.getComputedStyle(track);
      const gap = parseFloat(trackStyles.columnGap || trackStyles.gap || "16");
      const step = firstCard.getBoundingClientRect().width + gap;
      const maxScroll = track.scrollWidth - viewport.clientWidth;
      const nextScroll = viewport.scrollLeft + step;

      if (maxScroll <= 0) {
        return;
      }

      if (nextScroll >= maxScroll - step / 3) {
        viewport.scrollTo({
          left: 0,
          behavior: "smooth",
        });
        return;
      }

      viewport.scrollTo({
        left: nextScroll,
        behavior: "smooth",
      });
    }, 3000);
  }

  function initGlobalEscapes() {
    doc.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") {
        return;
      }

      closeModal();
      closeCart();

      const nav = $("[data-nav]");
      const toggle = $("[data-nav-toggle]");

      if (nav && toggle) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }

      syncBodyLock();
    });
  }

  initNav();
  initCart();
  initQuickView();
  initTabs();
  initAccordion();
  initCatalogFilters();
  initGallery();
  initCompare();
  initContactForm();
  initRevealAnimations();
  initStockSlider();
  initGlobalEscapes();
  syncBodyLock();
})();
