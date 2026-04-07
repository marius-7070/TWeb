const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin";
const ADMIN_REALM = "SkyNet Admin";
const SESSION_TTL_DAYS = 30;

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
    findUserByEmail: db.prepare(`
      SELECT
        id AS id,
        full_name AS name,
        email AS email,
        password_hash AS passwordHash,
        created_at AS createdAt,
        last_login_at AS lastLoginAt
      FROM user_accounts
      WHERE email = :email
      LIMIT 1
    `),
    insertUserAccount: db.prepare(`
      INSERT INTO user_accounts (
        full_name,
        email,
        password_hash,
        created_at
      )
      VALUES (
        :name,
        :email,
        :passwordHash,
        :createdAt
      )
    `),
    updateUserLastLogin: db.prepare(`
      UPDATE user_accounts
      SET last_login_at = :lastLoginAt
      WHERE id = :id
    `),
    insertUserSession: db.prepare(`
      INSERT INTO user_sessions (
        user_id,
        session_token,
        created_at,
        last_seen_at,
        expires_at
      )
      VALUES (
        :userId,
        :sessionToken,
        :createdAt,
        :lastSeenAt,
        :expiresAt
      )
    `),
    findUserSessionByToken: db.prepare(`
      SELECT
        us.id AS sessionId,
        us.session_token AS sessionToken,
        us.created_at AS sessionCreatedAt,
        us.last_seen_at AS lastSeenAt,
        us.expires_at AS expiresAt,
        ua.id AS id,
        ua.full_name AS name,
        ua.email AS email,
        ua.created_at AS createdAt,
        ua.last_login_at AS lastLoginAt
      FROM user_sessions us
      JOIN user_accounts ua ON ua.id = us.user_id
      WHERE us.session_token = :sessionToken
      LIMIT 1
    `),
    touchUserSession: db.prepare(`
      UPDATE user_sessions
      SET last_seen_at = :lastSeenAt
      WHERE session_token = :sessionToken
    `),
    deleteUserSessionByToken: db.prepare(`
      DELETE FROM user_sessions
      WHERE session_token = :sessionToken
    `),
    deleteExpiredUserSessions: db.prepare(`
      DELETE FROM user_sessions
      WHERE expires_at <= :now
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

function quoteIdentifier(value) {
  return '"' + String(value || "").replace(/"/g, '""') + '"';
}

function quoteSqlString(value) {
  return "'" + String(value || "").replace(/'/g, "''") + "'";
}

function resolveTableOrderClause(columns) {
  const columnNames = columns.map(function (column) {
    return column.name;
  });

  function hasColumn(columnName) {
    return columnNames.includes(columnName);
  }

  if (hasColumn("created_at") && hasColumn("id")) {
    return " ORDER BY created_at DESC, id DESC";
  }

  if (hasColumn("logged_at") && hasColumn("id")) {
    return " ORDER BY logged_at DESC, id DESC";
  }

  if (hasColumn("created_at")) {
    return " ORDER BY created_at DESC";
  }

  if (hasColumn("logged_at")) {
    return " ORDER BY logged_at DESC";
  }

  if (hasColumn("id")) {
    return " ORDER BY id DESC";
  }

  return "";
}

function buildAdminTables(db) {
  const tableNames = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name COLLATE NOCASE ASC
  `).all();

  return tableNames.map(function (tableInfo) {
    const tableName = tableInfo.name;
    const columns = db
      .prepare("PRAGMA table_info(" + quoteSqlString(tableName) + ")")
      .all()
      .map(function (column) {
        return {
          name: column.name,
          type: column.type || "TEXT",
          isPrimaryKey: Boolean(column.pk),
          isRequired: Boolean(column.notnull),
          defaultValue: column.dflt_value,
        };
      });
    const rows = db
      .prepare("SELECT * FROM " + quoteIdentifier(tableName) + resolveTableOrderClause(columns))
      .all();

    return {
      name: tableName,
      rowCount: rows.length,
      columns: columns,
      rows: rows,
    };
  });
}

function normalizeText(value, maxLength) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizeEmail(value, maxLength) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, maxLength);
}

function normalizeMessage(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 200;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);

  return salt.toString("hex") + ":" + hash.toString("hex");
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split(":");

  if (parts.length !== 2) {
    return false;
  }

  try {
    const salt = Buffer.from(parts[0], "hex");
    const expected = Buffer.from(parts[1], "hex");
    const actual = scryptSync(String(password || ""), salt, expected.length);

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch (error) {
    return false;
  }
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function buildUserPayload(user) {
  if (!user) {
    return null;
  }

  return {
    id: Number(user.id || 0),
    name: user.name || "",
    email: user.email || "",
    memberSince: user.createdAt || "",
    lastLoginAt: user.lastLoginAt || null,
  };
}

function createSessionToken() {
  return randomBytes(24).toString("hex");
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

function buildAdminOverview(db, statements, dbPath) {
  const dashboard = buildDashboard(statements);
  const tables = buildAdminTables(db);

  return {
    database: dashboard.database,
    databaseFile: path.relative(__dirname, dbPath).replace(/\\/g, "/"),
    stats: {
      fleetTotal: dashboard.stats.fleetTotal,
      readyToLaunch: dashboard.stats.readyToLaunch,
      chargingCount: dashboard.stats.chargingCount,
      requestCount: dashboard.stats.requestCount,
      rapidCount: dashboard.stats.rapidCount,
      latestClearanceCode: dashboard.stats.latestClearanceCode,
      tableCount: tables.length,
    },
    recentLogs: dashboard.recentLogs,
    fleetUnits: statements.fleetUnits.all(),
    requests: statements.allRequests.all(),
    tables: tables,
  };
}

function buildContactRequests(statements) {
  return {
    requests: statements.recentRequests.all(),
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

function applyApiCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Max-Age", "600");
}

function isProtectedAdminPath(requestPath) {
  return requestPath === "/admin.html" || requestPath.startsWith("/api/admin/");
}

function readBasicAuthCredentials(request) {
  const authorization = request.headers.authorization || "";

  if (!authorization.startsWith("Basic ")) {
    return null;
  }

  let decoded;

  try {
    decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  } catch (error) {
    return null;
  }

  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return null;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

function hasValidAdminCredentials(request) {
  const credentials = readBasicAuthCredentials(request);

  return Boolean(
    credentials &&
      credentials.username === ADMIN_USERNAME &&
      credentials.password === ADMIN_PASSWORD
  );
}

function readBearerToken(request) {
  const authorization = request.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

function sendAdminUnauthorized(response) {
  const body = "Admin authentication required.";

  response.writeHead(401, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="' + ADMIN_REALM + '"',
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

function cleanupExpiredUserSessions(statements) {
  statements.deleteExpiredUserSessions.run({
    now: new Date().toISOString(),
  });
}

function createUserSession(statements, userId, createdAt) {
  const issuedAt = createdAt instanceof Date ? createdAt : new Date();
  const sessionToken = createSessionToken();
  const createdAtIso = issuedAt.toISOString();
  const expiresAt = addDays(issuedAt, SESSION_TTL_DAYS).toISOString();

  statements.insertUserSession.run({
    userId: userId,
    sessionToken: sessionToken,
    createdAt: createdAtIso,
    lastSeenAt: createdAtIso,
    expiresAt: expiresAt,
  });

  return {
    sessionToken: sessionToken,
    expiresAt: expiresAt,
  };
}

function getAuthenticatedUser(request, statements) {
  const sessionToken = readBearerToken(request);

  if (!sessionToken) {
    return null;
  }

  cleanupExpiredUserSessions(statements);

  const session = statements.findUserSessionByToken.get({
    sessionToken: sessionToken,
  });

  if (!session) {
    return null;
  }

  statements.touchUserSession.run({
    sessionToken: sessionToken,
    lastSeenAt: new Date().toISOString(),
  });

  return session;
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
  cleanupExpiredUserSessions(statements);
  let isClosed = false;

  const server = http.createServer(function (request, response) {
    const url = new URL(request.url || "/", "http://localhost");

    Promise.resolve()
      .then(async function () {
        if (url.pathname.startsWith("/api/")) {
          applyApiCors(response);

          if (request.method === "OPTIONS") {
            response.writeHead(204);
            response.end();
            return;
          }
        }

        if (isProtectedAdminPath(url.pathname) && !hasValidAdminCredentials(request)) {
          sendAdminUnauthorized(response);
          return;
        }

        if (url.pathname === "/api/auth/session") {
          if (request.method !== "GET") {
            sendJson(response, 405, { error: "Method not allowed." });
            return;
          }

          const authenticatedUser = getAuthenticatedUser(request, statements);

          if (!authenticatedUser) {
            sendJson(response, 200, { authenticated: false });
            return;
          }

          sendJson(response, 200, {
            authenticated: true,
            user: buildUserPayload(authenticatedUser),
          });
          return;
        }

        if (url.pathname === "/api/auth/register") {
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "Method not allowed." });
            return;
          }

          const payload = await readJsonBody(request);
          const name = normalizeText(payload.name, 120);
          const email = normalizeEmail(payload.email, 160);
          const password = typeof payload.password === "string" ? payload.password : "";

          if (!name || !email || !password) {
            sendJson(response, 400, { error: "Completeaza toate campurile obligatorii." });
            return;
          }

          if (!isValidEmail(email)) {
            sendJson(response, 400, { error: "Adresa de email nu este valida." });
            return;
          }

          if (!isValidPassword(password)) {
            sendJson(response, 400, {
              error: "Parola trebuie sa aiba intre 8 si 200 de caractere.",
            });
            return;
          }

          if (statements.findUserByEmail.get({ email: email })) {
            sendJson(response, 409, { error: "Exista deja un cont pentru acest email." });
            return;
          }

          const createdAt = new Date();
          const passwordHash = hashPassword(password);
          let userId = 0;

          try {
            const result = statements.insertUserAccount.run({
              name: name,
              email: email,
              passwordHash: passwordHash,
              createdAt: createdAt.toISOString(),
            });

            userId = Number(result.lastInsertRowid || 0);
          } catch (error) {
            if (String(error.message || "").includes("UNIQUE")) {
              sendJson(response, 409, { error: "Exista deja un cont pentru acest email." });
              return;
            }

            throw error;
          }

          statements.updateUserLastLogin.run({
            id: userId,
            lastLoginAt: createdAt.toISOString(),
          });

          const session = createUserSession(statements, userId, createdAt);
          const user = statements.findUserByEmail.get({ email: email });

          sendJson(response, 201, {
            message: "Contul a fost creat si sesiunea este activa.",
            sessionToken: session.sessionToken,
            expiresAt: session.expiresAt,
            user: buildUserPayload(user),
          });
          return;
        }

        if (url.pathname === "/api/auth/login") {
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "Method not allowed." });
            return;
          }

          const payload = await readJsonBody(request);
          const email = normalizeEmail(payload.email, 160);
          const password = typeof payload.password === "string" ? payload.password : "";

          if (!email || !password) {
            sendJson(response, 400, { error: "Introdu emailul si parola." });
            return;
          }

          if (!isValidEmail(email)) {
            sendJson(response, 400, { error: "Adresa de email nu este valida." });
            return;
          }

          const user = statements.findUserByEmail.get({ email: email });

          if (!user || !verifyPassword(password, user.passwordHash)) {
            sendJson(response, 401, { error: "Email sau parola incorecta." });
            return;
          }

          const loggedInAt = new Date();
          statements.updateUserLastLogin.run({
            id: user.id,
            lastLoginAt: loggedInAt.toISOString(),
          });

          const session = createUserSession(statements, user.id, loggedInAt);
          const refreshedUser = statements.findUserByEmail.get({ email: email });

          sendJson(response, 200, {
            message: "Autentificare reusita.",
            sessionToken: session.sessionToken,
            expiresAt: session.expiresAt,
            user: buildUserPayload(refreshedUser),
          });
          return;
        }

        if (url.pathname === "/api/auth/logout") {
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "Method not allowed." });
            return;
          }

          const sessionToken = readBearerToken(request);

          if (sessionToken) {
            statements.deleteUserSessionByToken.run({
              sessionToken: sessionToken,
            });
          }

          sendJson(response, 200, {
            message: "Sesiunea a fost inchisa.",
          });
          return;
        }

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

          sendJson(response, 200, buildAdminOverview(db, statements, dbPath));
          return;
        }

        if (url.pathname === "/api/contact") {
          if (request.method === "GET") {
            sendJson(response, 200, buildContactRequests(statements));
            return;
          }

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
