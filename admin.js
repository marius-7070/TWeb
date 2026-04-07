(function () {
  const site = window.SkyNetSite;
  const doc = document;

  function $(selector, root) {
    return (root || doc).querySelector(selector);
  }

  function getAdminOverviewUrl() {
    if (site && typeof site.resolveApiUrl === "function") {
      return site.resolveApiUrl("/api/admin/overview");
    }

    return "http://localhost:3000/api/admin/overview";
  }

  function getAdminHeaders() {
    return {
      Authorization: "Basic " + window.btoa("admin:admin"),
    };
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

  function isIsoDateValue(value) {
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    );
  }

  function formatTableCell(value) {
    if (value === null || typeof value === "undefined") {
      return '<span class="table-null">NULL</span>';
    }

    if (typeof value === "string" && !value.trim()) {
      return '<span class="table-null">gol</span>';
    }

    if (isIsoDateValue(value)) {
      return escapeHtml(formatDateTime(value));
    }

    const text = String(value);
    const displayText = truncateText(text, 180);

    if (displayText !== text) {
      return (
        '<span title="' +
        escapeHtml(text) +
        '">' +
        escapeHtml(displayText) +
        "</span>"
      );
    }

    return escapeHtml(text);
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
      {
        label: "Tabele SQLite",
        value: stats.tableCount || 0,
        hint: "catalog complet disponibil mai jos",
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

  function renderDatabaseTables(container, tables) {
    if (!tables.length) {
      container.innerHTML =
        '<div class="panel-empty">Nu am gasit tabele utilizator in baza de date.</div>';
      return;
    }

    container.innerHTML = tables
      .map(function (table) {
        const columns = table.columns || [];
        const rows = table.rows || [];

        return (
          '<article class="db-table-card">' +
          '  <div class="db-table-card__head">' +
          "    <div>" +
          '      <p class="eyebrow">Tabel SQLite</p>' +
          '      <h3 class="db-table-card__title">' +
          escapeHtml(table.name) +
          "</h3>" +
          "    </div>" +
          '    <span class="admin-counter">' +
          escapeHtml(String(table.rowCount || 0)) +
          " randuri</span>" +
          "  </div>" +
          '  <div class="db-table-card__columns">' +
          columns
            .map(function (column) {
              const parts = [column.type || "TEXT"];

              if (column.isPrimaryKey) {
                parts.push("PK");
              }

              if (column.isRequired) {
                parts.push("NOT NULL");
              }

              return (
                '<span class="column-pill">' +
                escapeHtml(column.name) +
                '<small>' +
                escapeHtml(parts.join(" | ")) +
                "</small></span>"
              );
            })
            .join("") +
          "  </div>" +
          '  <div class="table-shell">' +
          '    <table class="db-table">' +
          "      <thead><tr>" +
          columns
            .map(function (column) {
              return "<th>" + escapeHtml(column.name) + "</th>";
            })
            .join("") +
          "</tr></thead>" +
          "      <tbody>" +
          (rows.length
            ? rows
                .map(function (row) {
                  return (
                    "<tr>" +
                    columns
                      .map(function (column) {
                        return "<td>" + formatTableCell(row[column.name]) + "</td>";
                      })
                      .join("") +
                    "</tr>"
                  );
                })
                .join("")
            : '<tr><td colspan="' +
              escapeHtml(String(columns.length || 1)) +
              '"><div class="panel-empty">Tabelul nu are inca randuri.</div></td></tr>') +
          "      </tbody>" +
          "    </table>" +
          "  </div>" +
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
    const databaseTablesContainer = $("[data-admin-database-tables]");
    const statusLabel = $("[data-admin-status]");
    const dbLabel = $("[data-admin-db]");
    const counter = $("[data-admin-request-count]");
    const tableCounter = $("[data-admin-table-count]");

    if (
      !statsContainer ||
      !requestsContainer ||
      !fleetContainer ||
      !logsContainer ||
      !databaseTablesContainer
    ) {
      return;
    }

    if (statusLabel) {
      statusLabel.textContent = "Sincronizare...";
    }

    window
      .fetch(getAdminOverviewUrl(), {
        headers: getAdminHeaders(),
      })
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
        renderDatabaseTables(databaseTablesContainer, payload.tables || []);

        if (dbLabel) {
          dbLabel.textContent = payload.databaseFile || "data/skynet-hangar.sqlite";
        }

        if (statusLabel) {
          statusLabel.textContent = "Conectat";
        }

        if (counter) {
          counter.textContent = String((payload.requests || []).length) + " inregistrari";
        }

        if (tableCounter) {
          tableCounter.textContent = String((payload.tables || []).length) + " tabele";
        }
      })
      .catch(function () {
        if (statsContainer) {
          statsContainer.innerHTML =
            '<div class="panel-empty">API-ul admin nu raspunde. Porneste serverul local cu <code>node server.js</code> si deschide panoul prin <code>http://localhost:3000/admin.html</code>.</div>';
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

        if (databaseTablesContainer) {
          databaseTablesContainer.innerHTML =
            '<div class="panel-empty">Catalogul SQLite nu a putut fi incarcat.</div>';
        }

        if (statusLabel) {
          statusLabel.textContent = "Offline - foloseste http://localhost:3000/admin.html";
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
