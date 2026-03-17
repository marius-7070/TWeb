const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
};

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function readSqlFile(fileName) {
  return fs.readFileSync(path.join(__dirname, "database", fileName), "utf8");
}

function openDatabase(dbPath) {
  ensureDirectory(path.dirname(dbPath));

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readSqlFile("schema.sql"));
  db.exec(readSqlFile("seed.sql"));

  return db;
}

function buildStatements(db) {
  return {
    fleetStats: db.prepare(`
      SELECT
        COUNT(*) AS fleetTotal,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS readyToLaunch,
        SUM(CASE WHEN status = 'charging' THEN 1 ELSE 0 END) AS chargingCount
      FROM drone_fleet
    `),
    requestStats: db.prepare(`
      SELECT
        COUNT(*) AS requestCount,
        SUM(CASE WHEN priority = 'Rapid' THEN 1 ELSE 0 END) AS rapidCount
      FROM mission_requests
    `),
    latestRequest: db.prepare(`
      SELECT
        clearance_code AS clearanceCode
      FROM mission_requests
      ORDER BY id DESC
      LIMIT 1
    `),
    recentRequests: db.prepare(`
      SELECT
        clearance_code AS clearanceCode,
        mission_type AS missionType,
        priority AS priority,
        status AS status,
        COALESCE(NULLIF(company, ''), 'Client direct') AS company,
        created_at AS createdAt
      FROM mission_requests
      ORDER BY id DESC
      LIMIT 5
    `),
    recentLogs: db.prepare(`
      SELECT
        hl.mission_code AS missionCode,
        hl.mission_type AS missionType,
        hl.sector AS sector,
        hl.status AS status,
        hl.pilot_name AS pilotName,
        hl.summary AS summary,
        hl.logged_at AS loggedAt,
        df.callsign AS callsign
      FROM hangar_logs hl
      JOIN drone_fleet df ON df.id = hl.drone_id
      ORDER BY hl.logged_at DESC, hl.id DESC
      LIMIT 5
    `),
    fleetUnits: db.prepare(`
      SELECT
        model AS model,
        role AS role,
        callsign AS callsign,
        status AS status,
        battery_cycles AS batteryCycles,
        home_base AS homeBase,
        created_at AS createdAt
      FROM drone_fleet
      ORDER BY id ASC
    `),
    allRequests: db.prepare(`
      SELECT
        id AS id,
        clearance_code AS clearanceCode,
        name AS name,
        email AS email,
        COALESCE(NULLIF(company, ''), 'Client direct') AS company,
        mission_type AS missionType,
        priority AS priority,
        status AS status,
        message AS message,
        created_at AS createdAt
      FROM mission_requests
      ORDER BY id DESC
    `),
    insertMissionRequest: db.prepare(`
      INSERT INTO mission_requests (
        clearance_code,
        name,
        email,
        company,
        mission_type,
        priority,
        message,
        status,
        created_at
      )
      VALUES (
        :clearanceCode,
        :name,
        :email,
        :company,
        :missionType,
        :priority,
        :message,
        'nou',
        :createdAt
      )
    `),
  };
}

function normalizeText(value, maxLength) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizeMessage(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function missionPrefix(missionType) {
  const prefixes = {
    "Filmare cinematica": "CINE",
    "Inspectie industriala": "THERM",
    "Agricultura de precizie": "AGRO",
    "Mapare 3D": "MAP",
  };

  return prefixes[missionType] || "OPS";
}

function createClearanceCode(missionType) {
  return "SKY-" + missionPrefix(missionType) + "-" + randomBytes(2).toString("hex").toUpperCase();
}

function buildDashboard(statements) {
  const fleetStats = statements.fleetStats.get() || {};
  const requestStats = statements.requestStats.get() || {};
  const latestRequest = statements.latestRequest.get() || null;

  return {
    database: "SQLite local",
    stats: {
      fleetTotal: Number(fleetStats.fleetTotal || 0),
      readyToLaunch: Number(fleetStats.readyToLaunch || 0),
      chargingCount: Number(fleetStats.chargingCount || 0),
      requestCount: Number(requestStats.requestCount || 0),
      rapidCount: Number(requestStats.rapidCount || 0),
      latestClearanceCode: latestRequest ? latestRequest.clearanceCode : "Standby",
    },
    recentRequests: statements.recentRequests.all(),
    recentLogs: statements.recentLogs.all(),
  };
}

function buildAdminOverview(statements, dbPath) {
  const dashboard = buildDashboard(statements);

  return {
    database: dashboard.database,
    databaseFile: path.relative(__dirname, dbPath).replace(/\\/g, "/"),
    stats: dashboard.stats,
    recentLogs: dashboard.recentLogs,
    fleetUnits: statements.fleetUnits.all(),
    requests: statements.allRequests.all(),
  };
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);

  response.writeHead(statusCode, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(body);
}

async function readJsonBody(request) {
  return await new Promise(function (resolve, reject) {
    let rawBody = "";

    request.on("data", function (chunk) {
      rawBody += chunk;

      if (rawBody.length > 100000) {
        reject(new Error("Payload too large."));
        request.destroy();
      }
    });

    request.on("end", function () {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

async function serveStatic(requestPath, rootDir, response) {
  const relativePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.resolve(rootDir, "." + relativePath);
  const relativeToRoot = path.relative(rootDir, filePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    sendJson(response, 403, { error: "Access denied." });
    return;
  }

  try {
    const stats = await fs.promises.stat(filePath);
    const finalPath = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const body = await fs.promises.readFile(finalPath);
    const extension = path.extname(finalPath).toLowerCase();

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    response.end(body);
  } catch (error) {
    sendJson(response, 404, { error: "File not found." });
  }
}

function createApp(options) {
  const rootDir = path.resolve((options && options.rootDir) || __dirname);
  const dbPath = path.resolve(
    (options && options.dbPath) || path.join(rootDir, "data", "skynet-hangar.sqlite")
  );
  const db = openDatabase(dbPath);
  const statements = buildStatements(db);
  let isClosed = false;

  const server = http.createServer(function (request, response) {
    const url = new URL(request.url || "/", "http://localhost");

    Promise.resolve()
      .then(async function () {
        if (url.pathname === "/api/hangar-intel") {
          if (request.method !== "GET") {
            sendJson(response, 405, { error: "Method not allowed." });
            return;
          }

          sendJson(response, 200, buildDashboard(statements));
          return;
        }

        if (url.pathname === "/api/admin/overview") {
          if (request.method !== "GET") {
            sendJson(response, 405, { error: "Method not allowed." });
            return;
          }

          sendJson(response, 200, buildAdminOverview(statements, dbPath));
          return;
        }

        if (url.pathname === "/api/contact") {
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "Method not allowed." });
            return;
          }

          const payload = await readJsonBody(request);
          const name = normalizeText(payload.name, 120);
          const email = normalizeText(payload.email, 160);
          const company = normalizeText(payload.company, 160);
          const missionType = normalizeText(payload.missionType, 80);
          const priority = normalizeText(payload.priority, 40) || "Standard";
          const message = normalizeMessage(payload.message, 1600);

          if (!name || !email || !missionType || !message) {
            sendJson(response, 400, { error: "Campurile obligatorii lipsesc." });
            return;
          }

          if (!isValidEmail(email)) {
            sendJson(response, 400, { error: "Adresa de email nu este valida." });
            return;
          }

          const createdAt = new Date().toISOString();
          let clearanceCode = createClearanceCode(missionType);

          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              statements.insertMissionRequest.run({
                clearanceCode: clearanceCode,
                name: name,
                email: email,
                company: company,
                missionType: missionType,
                priority: priority,
                message: message,
                createdAt: createdAt,
              });
              break;
            } catch (error) {
              if (attempt === 2) {
                throw error;
              }

              clearanceCode = createClearanceCode(missionType);
            }
          }

          sendJson(response, 201, {
            clearanceCode: clearanceCode,
            message: "Cererea a fost salvata in hangarul SQLite.",
          });
          return;
        }

        if (url.pathname.startsWith("/api/")) {
          sendJson(response, 404, { error: "API route not found." });
          return;
        }

        await serveStatic(url.pathname, rootDir, response);
      })
      .catch(function (error) {
        console.error(error);

        if (response.headersSent) {
          response.end();
          return;
        }

        sendJson(response, 500, { error: "Unexpected server error." });
      });
  });

  return {
    dbPath: dbPath,
    server: server,
    async close() {
      if (isClosed) {
        return;
      }

      isClosed = true;

      if (server.listening) {
        await new Promise(function (resolve) {
          server.close(resolve);
        });
      }

      db.close();
    },
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();

  app.server.listen(port, function () {
    console.log("SkyNet Hangar ruleaza pe http://localhost:" + port);
    console.log("SQLite: " + app.dbPath);
  });

  async function shutdown() {
    await app.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = {
  createApp: createApp,
};
