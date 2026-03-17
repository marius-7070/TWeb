const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const { createApp } = require("./server");

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

  t.after(async function () {
    await context.app.close();
    fs.rmSync(context.dbPath, { force: true });
  });

  const initialIntelResponse = await fetch(context.baseUrl + "/api/hangar-intel");
  const initialIntel = await initialIntelResponse.json();
  const initialAdminResponse = await fetch(context.baseUrl + "/api/admin/overview");
  const initialAdmin = await initialAdminResponse.json();

  assert.equal(initialIntelResponse.status, 200);
  assert.equal(initialIntel.stats.fleetTotal, 4);
  assert.equal(initialIntel.stats.requestCount, 0);
  assert.equal(initialIntel.recentLogs.length, 5);
  assert.equal(initialAdminResponse.status, 200);
  assert.equal(initialAdmin.fleetUnits.length, 4);
  assert.equal(initialAdmin.requests.length, 0);
  assert.equal(initialAdmin.databaseFile, "data/test-hangar.sqlite");

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

  assert.equal(updatedIntelResponse.status, 200);
  assert.equal(updatedIntel.stats.requestCount, 1);
  assert.equal(updatedIntel.stats.rapidCount, 1);
  assert.equal(updatedIntel.recentRequests[0].company, "Studio Nord");
  assert.equal(updatedIntel.recentRequests[0].clearanceCode, created.clearanceCode);

  const updatedAdminResponse = await fetch(context.baseUrl + "/api/admin/overview");
  const updatedAdmin = await updatedAdminResponse.json();

  assert.equal(updatedAdminResponse.status, 200);
  assert.equal(updatedAdmin.requests.length, 1);
  assert.equal(updatedAdmin.requests[0].message, "Vrem o sesiune de filmare pentru un spot la apus.");
  assert.equal(updatedAdmin.requests[0].clearanceCode, created.clearanceCode);
});
