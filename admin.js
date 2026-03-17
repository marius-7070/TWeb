(function () {
  const site = window.SkyNetSite;
  const doc = document;

  function $(selector, root) {
    return (root || doc).querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value || "-";
    }

    return new Intl.DateTimeFormat("ro-RO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function truncateText(value, maxLength) {
    const text = String(value || "").trim();

    if (text.length <= maxLength) {
      return text;
    }

    return text.slice(0, maxLength - 3) + "...";
  }

  function renderStats(container, stats) {
    const cards = [
      {
        label: "Cereri totale",
        value: stats.requestCount || 0,
        hint: "feedback colectat din formular",
      },
      {
        label: "Prioritate rapida",
        value: stats.rapidCount || 0,
        hint: "cereri marcate Rapid",
      },
      {
        label: "Drone gata",
        value: stats.readyToLaunch || 0,
        hint: (stats.fleetTotal || 0) + " unitati in flota",
      },
      {
        label: "Ultimul clearance",
        value: stats.latestClearanceCode || "Standby",
        hint: "generat de SQLite la ultima trimitere",
      },
    ];

    container.innerHTML = cards
      .map(function (card) {
        return (
          '<article class="stat-card reveal-item">' +
          '  <span class="stat-card__label">' +
          escapeHtml(card.label) +
          "</span>" +
          '  <strong class="stat-card__value">' +
          escapeHtml(card.value) +
          "</strong>" +
          '  <span class="stat-card__hint">' +
          escapeHtml(card.hint) +
          "</span>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderRequests(container, requests) {
    if (!requests.length) {
      container.innerHTML =
        '<tr><td colspan="6"><div class="panel-empty">Nu exista inca feedback in SQLite. Trimite un mesaj din formular.</div></td></tr>';
      return;
    }

    container.innerHTML = requests
      .map(function (item) {
        return (
          "<tr>" +
          "  <td><span class=\"feedback-code\">" +
          escapeHtml(item.clearanceCode) +
          "</span></td>" +
          "  <td>" +
          '    <div class="feedback-name">' +
          escapeHtml(item.name) +
          "</div>" +
          '    <div class="feedback-contact">' +
          escapeHtml(item.email) +
          " | " +
          escapeHtml(item.company) +
          "</div>" +
          "  </td>" +
          "  <td>" +
          '    <div class="feedback-name">' +
          escapeHtml(item.missionType) +
          "</div>" +
          '    <div class="feedback-contact"><span class="priority-pill" data-priority="' +
          escapeHtml(item.priority) +
          '">' +
          escapeHtml(item.priority) +
          "</span></div>" +
          "  </td>" +
          '  <td><div class="feedback-message" title="' +
          escapeHtml(item.message) +
          '">' +
          escapeHtml(truncateText(item.message, 120)) +
          "</div></td>" +
          '  <td><span class="status-pill" data-status="' +
          escapeHtml(item.status) +
          '">' +
          escapeHtml(item.status) +
          "</span></td>" +
          "  <td>" +
          escapeHtml(formatDateTime(item.createdAt)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderFleet(container, fleetUnits) {
    if (!fleetUnits.length) {
      container.innerHTML = '<div class="panel-empty">Flota nu este disponibila.</div>';
      return;
    }

    container.innerHTML = fleetUnits
      .map(function (item) {
        return (
          '<article class="fleet-card">' +
          '  <div class="fleet-card__top">' +
          '    <div><h3 class="fleet-card__title">' +
          escapeHtml(item.callsign) +
          "</h3>" +
          '    <p class="fleet-card__meta">' +
          escapeHtml(item.model) +
          " | " +
          escapeHtml(item.role) +
          "</p></div>" +
          '    <span class="fleet-status" data-status="' +
          escapeHtml(item.status) +
          '">' +
          escapeHtml(item.status) +
          "</span>" +
          "  </div>" +
          '  <p class="fleet-card__meta">Home base: ' +
          escapeHtml(item.homeBase) +
          " | cicluri baterie: " +
          escapeHtml(item.batteryCycles) +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderLogs(container, logs) {
    if (!logs.length) {
      container.innerHTML = '<div class="panel-empty">Nu exista loguri recente.</div>';
      return;
    }

    container.innerHTML = logs
      .map(function (item) {
        return (
          '<article class="log-card">' +
          '  <div class="log-card__top">' +
          '    <div><h3 class="log-card__title">' +
          escapeHtml(item.callsign) +
          " | " +
          escapeHtml(item.missionCode) +
          "</h3>" +
          '    <p class="log-card__meta">' +
          escapeHtml(item.missionType) +
          " | " +
          escapeHtml(item.sector) +
          "</p></div>" +
          '    <span class="status-pill" data-status="' +
          escapeHtml(item.status) +
          '">' +
          escapeHtml(item.status) +
          "</span>" +
          "  </div>" +
          '  <p class="log-card__meta">' +
          escapeHtml(item.summary) +
          "</p>" +
          '  <p class="log-card__meta">Pilot: ' +
          escapeHtml(item.pilotName) +
          " | " +
          escapeHtml(formatDateTime(item.loggedAt)) +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function loadAdminOverview() {
    const statsContainer = $("[data-admin-stats]");
    const requestsContainer = $("[data-admin-requests]");
    const fleetContainer = $("[data-admin-fleet]");
    const logsContainer = $("[data-admin-logs]");
    const statusLabel = $("[data-admin-status]");
    const dbLabel = $("[data-admin-db]");
    const counter = $("[data-admin-request-count]");

    if (!statsContainer || !requestsContainer || !fleetContainer || !logsContainer) {
      return;
    }

    if (statusLabel) {
      statusLabel.textContent = "Sincronizare...";
    }

    window
      .fetch("/api/admin/overview")
      .then(function (response) {
        return response.json().then(function (payload) {
          if (!response.ok) {
            throw new Error(payload.error || "Nu am putut incarca panoul admin.");
          }

          return payload;
        });
      })
      .then(function (payload) {
        renderStats(statsContainer, payload.stats || {});
        renderRequests(requestsContainer, payload.requests || []);
        renderFleet(fleetContainer, payload.fleetUnits || []);
        renderLogs(logsContainer, payload.recentLogs || []);

        if (dbLabel) {
          dbLabel.textContent = payload.databaseFile || "data/skynet-hangar.sqlite";
        }

        if (statusLabel) {
          statusLabel.textContent = "Conectat";
        }

        if (counter) {
          counter.textContent = String((payload.requests || []).length) + " inregistrari";
        }
      })
      .catch(function () {
        if (statsContainer) {
          statsContainer.innerHTML =
            '<div class="panel-empty">API-ul admin nu raspunde. Porneste serverul local cu <code>node server.js</code>.</div>';
        }

        if (requestsContainer) {
          requestsContainer.innerHTML =
            '<tr><td colspan="6"><div class="panel-empty">Nu am putut incarca mesajele din SQLite.</div></td></tr>';
        }

        if (fleetContainer) {
          fleetContainer.innerHTML = '<div class="panel-empty">Flota nu a putut fi incarcata.</div>';
        }

        if (logsContainer) {
          logsContainer.innerHTML = '<div class="panel-empty">Logurile nu au putut fi incarcate.</div>';
        }

        if (statusLabel) {
          statusLabel.textContent = "Offline - porneste node server.js";
        }
      });
  }

  if (!site) {
    return;
  }

  site.initNav();
  site.initRevealAnimations();
  site.initGlobalEscapes();
  site.syncBodyLock();

  loadAdminOverview();

  const refreshButton = $("[data-admin-refresh]");

  if (refreshButton) {
    refreshButton.addEventListener("click", loadAdminOverview);
  }
})();
