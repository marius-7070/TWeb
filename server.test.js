const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const { createApp } = require("./server");

function createBasicAuthHeader(username, password) {
  return "Basic " + Buffer.from(username + ":" + password).toString("base64");
}

function getTableByName(tables, tableName) {
  return tables.find(function (table) {
    return table.name === tableName;
  });
}

async function startTestApp() {
  const dbPath = path.join(__dirname, "data", "test-hangar.sqlite");
  fs.rmSync(dbPath, { force: true });

  const app = createApp({
    dbPath: dbPath,
    rootDir: __dirname,
  });

  await new Promise(function (resolve) {
    app.server.listen(0, "127.0.0.1", resolve);
  });

  const address = app.server.address();

  return {
    app: app,
    baseUrl: "http://127.0.0.1:" + address.port,
    dbPath: dbPath,
  };
}

test("stores contact requests in SQLite and exposes hangar intel", async function (t) {
  const context = await startTestApp();
  const adminHeaders = {
    Authorization: createBasicAuthHeader("admin", "admin"),
  };

  t.after(async function () {
    await context.app.close();
    fs.rmSync(context.dbPath, { force: true });
  });

  const initialIntelResponse = await fetch(context.baseUrl + "/api/hangar-intel");
  const initialIntel = await initialIntelResponse.json();
  const contactPreflightResponse = await fetch(context.baseUrl + "/api/contact", {
    method: "OPTIONS",
    headers: {
      Origin: "null",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const adminPreflightResponse = await fetch(context.baseUrl + "/api/admin/overview", {
    method: "OPTIONS",
    headers: {
      Origin: "null",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
  });
  const unauthorizedAdminPageResponse = await fetch(context.baseUrl + "/admin.html");
  const unauthorizedAdminResponse = await fetch(context.baseUrl + "/api/admin/overview");
  const initialAdminResponse = await fetch(context.baseUrl + "/api/admin/overview", {
    headers: adminHeaders,
  });
  const initialAdmin = await initialAdminResponse.json();
  const initialContactResponse = await fetch(context.baseUrl + "/api/contact");
  const initialContact = await initialContactResponse.json();

  assert.equal(initialIntelResponse.status, 200);
  assert.equal(initialIntel.stats.fleetTotal, 4);
  assert.equal(initialIntel.stats.requestCount, 0);
  assert.equal(initialIntel.recentLogs.length, 5);
  assert.equal(contactPreflightResponse.status, 204);
  assert.equal(contactPreflightResponse.headers.get("access-control-allow-origin"), "*");
  assert.equal(contactPreflightResponse.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal(
    contactPreflightResponse.headers.get("access-control-allow-headers"),
    "Authorization, Content-Type"
  );
  assert.equal(adminPreflightResponse.status, 204);
  assert.equal(adminPreflightResponse.headers.get("access-control-allow-origin"), "*");
  assert.equal(unauthorizedAdminPageResponse.status, 401);
  assert.equal(
    unauthorizedAdminPageResponse.headers.get("www-authenticate"),
    'Basic realm="SkyNet Admin"'
  );
  assert.equal(unauthorizedAdminResponse.status, 401);
  assert.equal(initialAdminResponse.status, 200);
  assert.equal(initialAdmin.fleetUnits.length, 4);
  assert.equal(initialAdmin.requests.length, 0);
  assert.equal(initialAdmin.databaseFile, "data/test-hangar.sqlite");
  assert.equal(initialAdmin.stats.tableCount, 5);
  assert.equal(initialAdmin.tables.length, 5);
  assert.equal(getTableByName(initialAdmin.tables, "drone_fleet").rowCount, 4);
  assert.equal(getTableByName(initialAdmin.tables, "hangar_logs").rowCount, 5);
  assert.equal(getTableByName(initialAdmin.tables, "mission_requests").rowCount, 0);
  assert.equal(getTableByName(initialAdmin.tables, "user_accounts").rowCount, 0);
  assert.equal(getTableByName(initialAdmin.tables, "user_sessions").rowCount, 0);
  assert.equal(initialContactResponse.status, 200);
  assert.deepEqual(initialContact.requests, []);

  const createResponse = await fetch(context.baseUrl + "/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Ana Ceban",
      email: "ana@example.com",
      company: "Studio Nord",
      missionType: "Filmare cinematica",
      priority: "Rapid",
      message: "Vrem o sesiune de filmare pentru un spot la apus.",
    }),
  });

  const created = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.match(created.clearanceCode, /^SKY-CINE-[0-9A-F]{4}$/);

  const updatedIntelResponse = await fetch(context.baseUrl + "/api/hangar-intel");
  const updatedIntel = await updatedIntelResponse.json();
  const updatedContactResponse = await fetch(context.baseUrl + "/api/contact");
  const updatedContact = await updatedContactResponse.json();

  assert.equal(updatedIntelResponse.status, 200);
  assert.equal(updatedIntel.stats.requestCount, 1);
  assert.equal(updatedIntel.stats.rapidCount, 1);
  assert.equal(updatedIntel.recentRequests[0].company, "Studio Nord");
  assert.equal(updatedIntel.recentRequests[0].clearanceCode, created.clearanceCode);
  assert.equal(updatedContactResponse.status, 200);
  assert.equal(updatedContact.requests.length, 1);
  assert.equal(updatedContact.requests[0].clearanceCode, created.clearanceCode);
  assert.equal(updatedContact.requests[0].company, "Studio Nord");
  assert.equal(updatedContact.requests[0].missionType, "Filmare cinematica");
  assert.equal(updatedContact.requests[0].priority, "Rapid");
  assert.equal(updatedContact.requests[0].status, "nou");
  assert.equal(updatedContact.requests[0].email, undefined);
  assert.equal(updatedContact.requests[0].message, undefined);

  const updatedAdminResponse = await fetch(context.baseUrl + "/api/admin/overview", {
    headers: adminHeaders,
  });
  const updatedAdmin = await updatedAdminResponse.json();

  assert.equal(updatedAdminResponse.status, 200);
  assert.equal(updatedAdmin.requests.length, 1);
  assert.equal(updatedAdmin.requests[0].message, "Vrem o sesiune de filmare pentru un spot la apus.");
  assert.equal(updatedAdmin.requests[0].clearanceCode, created.clearanceCode);
  assert.equal(updatedAdmin.stats.tableCount, 5);
  assert.equal(getTableByName(updatedAdmin.tables, "mission_requests").rowCount, 1);
  assert.equal(
    getTableByName(updatedAdmin.tables, "mission_requests").rows[0].clearance_code,
    created.clearanceCode
  );
  assert.equal(
    getTableByName(updatedAdmin.tables, "mission_requests").rows[0].message,
    "Vrem o sesiune de filmare pentru un spot la apus."
  );
});

test("registers users, persists sessions, and validates login flow", async function (t) {
  const context = await startTestApp();
  const adminHeaders = {
    Authorization: createBasicAuthHeader("admin", "admin"),
  };

  t.after(async function () {
    await context.app.close();
    fs.rmSync(context.dbPath, { force: true });
  });

  const anonymousSessionResponse = await fetch(context.baseUrl + "/api/auth/session");
  const anonymousSession = await anonymousSessionResponse.json();

  assert.equal(anonymousSessionResponse.status, 200);
  assert.equal(anonymousSession.authenticated, false);

  const registerResponse = await fetch(context.baseUrl + "/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Ana Pilot",
      email: "ANA@SkyNet.MD",
      password: "secure-pass-123",
    }),
  });

  const registered = await registerResponse.json();

  assert.equal(registerResponse.status, 201);
  assert.equal(registered.user.name, "Ana Pilot");
  assert.equal(registered.user.email, "ana@skynet.md");
  assert.match(registered.sessionToken, /^[0-9a-f]{48}$/);

  const authenticatedResponse = await fetch(context.baseUrl + "/api/auth/session", {
    headers: {
      Authorization: "Bearer " + registered.sessionToken,
    },
  });
  const authenticated = await authenticatedResponse.json();

  assert.equal(authenticatedResponse.status, 200);
  assert.equal(authenticated.authenticated, true);
  assert.equal(authenticated.user.email, "ana@skynet.md");

  const duplicateRegisterResponse = await fetch(context.baseUrl + "/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Ana Pilot",
      email: "ana@skynet.md",
      password: "secure-pass-123",
    }),
  });
  const duplicateRegister = await duplicateRegisterResponse.json();

  assert.equal(duplicateRegisterResponse.status, 409);
  assert.equal(duplicateRegister.error, "Exista deja un cont pentru acest email.");

  const badLoginResponse = await fetch(context.baseUrl + "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "ana@skynet.md",
      password: "wrong-password",
    }),
  });
  const badLogin = await badLoginResponse.json();

  assert.equal(badLoginResponse.status, 401);
  assert.equal(badLogin.error, "Email sau parola incorecta.");

  const logoutResponse = await fetch(context.baseUrl + "/api/auth/logout", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + registered.sessionToken,
    },
  });
  const logoutPayload = await logoutResponse.json();

  assert.equal(logoutResponse.status, 200);
  assert.equal(logoutPayload.message, "Sesiunea a fost inchisa.");

  const afterLogoutResponse = await fetch(context.baseUrl + "/api/auth/session", {
    headers: {
      Authorization: "Bearer " + registered.sessionToken,
    },
  });
  const afterLogout = await afterLogoutResponse.json();

  assert.equal(afterLogoutResponse.status, 200);
  assert.equal(afterLogout.authenticated, false);

  const loginResponse = await fetch(context.baseUrl + "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "ana@skynet.md",
      password: "secure-pass-123",
    }),
  });

  const loggedIn = await loginResponse.json();

  assert.equal(loginResponse.status, 200);
  assert.equal(loggedIn.user.email, "ana@skynet.md");
  assert.match(loggedIn.sessionToken, /^[0-9a-f]{48}$/);

  const adminResponse = await fetch(context.baseUrl + "/api/admin/overview", {
    headers: adminHeaders,
  });
  const admin = await adminResponse.json();
  const accountTable = getTableByName(admin.tables, "user_accounts");
  const sessionTable = getTableByName(admin.tables, "user_sessions");

  assert.equal(adminResponse.status, 200);
  assert.equal(admin.stats.tableCount, 5);
  assert.equal(accountTable.rowCount, 1);
  assert.equal(sessionTable.rowCount, 1);
  assert.equal(accountTable.rows[0].email, "ana@skynet.md");
  assert.match(accountTable.rows[0].password_hash, /^[0-9a-f]+:[0-9a-f]+$/);
  assert.notEqual(accountTable.rows[0].password_hash, "secure-pass-123");
  assert.equal(sessionTable.rows[0].user_id, accountTable.rows[0].id);
});
