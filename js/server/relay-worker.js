// ---- CPASTE ACCOUNTS WORKER START ----
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-cpaste-token",
};

function corsJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function randomHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, x => x.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

function tokenFrom(request, url) {
  return request.headers.get("x-cpaste-token") || url.searchParams.get("token") || "";
}

async function getUser(env, lower) { return await env.rooms.get("acct:" + lower, "json"); }
async function putUser(env, lower, user) {
  await env.rooms.put("acct:" + lower, JSON.stringify(user), { metadata: { kind: "account" } });
}
async function makeSession(env, lower) {
  const token = randomHex(32);
  await env.rooms.put("sess:" + token, lower, { expirationTtl: 60 * 60 * 24 * 365, metadata: { kind: "session" } });
  return token;
}
async function getSession(env, token) { if (!token) return null; return await env.rooms.get("sess:" + token); }
async function deleteSession(env, token) { if (!token) return; await env.rooms.delete("sess:" + token); }

function cleanTeams(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 100).map(t => {
    const team = String(t.team || "").slice(0, 20000);
    if (!team.trim()) return null;
    return {
      id: String(t.id || ("t" + Date.now() + randomHex(4))).slice(0, 64),
      name: String(t.name || "Equipo").slice(0, 80),
      team,
      created: Number(t.created) || Date.now(),
    };
  }).filter(Boolean);
}

async function requireUser(request, env, url) {
  const token = tokenFrom(request, url);
  const lower = await getSession(env, token);
  if (!lower) return null;
  const user = await getUser(env, lower);
  if (!user) return null;
  user.lower = lower;
  return user;
}

async function handleAccount(request, env, url) {
  const path = url.pathname;

  if (path === "/api/register") {
    if (request.method !== "POST") return corsJson({ ok: false, error: "POST requerido" }, 405);
    const body = await readBody(request);
    const name = String(body.name || "").trim();
    const pass = String(body.pass || "");
    const lower = name.toLowerCase();
    if (!name || !pass) return corsJson({ ok: false, error: "Usuario y contraseña obligatorios" }, 400);
    if (name.length > 32) return corsJson({ ok: false, error: "Usuario demasiado largo" }, 400);
    if (pass.length < 6) return corsJson({ ok: false, error: "Contraseña mínima: 6 caracteres" }, 400);
    if (await getUser(env, lower)) return corsJson({ ok: false, error: "Ese usuario ya existe" }, 409);
    const salt = randomHex(16);
    const hash = await sha256Hex(salt + ":" + pass);
    const user = { name, lower, salt, hash, teams: [], createdAt: Date.now(), updatedAt: Date.now() };
    await putUser(env, lower, user);
    const token = await makeSession(env, lower);
    return corsJson({ ok: true, token, name, teams: user.teams });
  }

  if (path === "/api/login") {
    if (request.method !== "POST") return corsJson({ ok: false, error: "POST requerido" }, 405);
    const body = await readBody(request);
    const name = String(body.name || "").trim();
    const pass = String(body.pass || "");
    const lower = name.toLowerCase();
    if (!name || !pass) return corsJson({ ok: false, error: "Usuario y contraseña obligatorios" }, 400);
    const user = await getUser(env, lower);
    if (!user) return corsJson({ ok: false, error: "Usuario o contraseña incorrectos" }, 401);
    const hash = await sha256Hex(user.salt + ":" + pass);
    if (hash !== user.hash) return corsJson({ ok: false, error: "Usuario o contraseña incorrectos" }, 401);
    const token = await makeSession(env, lower);
    return corsJson({ ok: true, token, name: user.name, teams: user.teams || [] });
  }

  if (path === "/api/logout") {
    const body = await readBody(request);
    const token = body.token || tokenFrom(request, url);
    await deleteSession(env, token);
    return corsJson({ ok: true });
  }

  if (path === "/api/account") {
    const user = await requireUser(request, env, url);
    if (!user) return corsJson({ ok: false, error: "No autorizado" }, 401);
    return corsJson({ ok: true, name: user.name, teams: user.teams || [] });
  }

  if (path === "/api/teams.get" || path === "/api/teams") {
    const user = await requireUser(request, env, url);
    if (!user) return corsJson({ ok: false, error: "No autorizado" }, 401);
    return corsJson({ ok: true, name: user.name, teams: user.teams || [] });
  }

  if (path === "/api/teams.save") {
    if (request.method !== "POST") return corsJson({ ok: false, error: "POST requerido" }, 405);
    const user = await requireUser(request, env, url);
    if (!user) return corsJson({ ok: false, error: "No autorizado" }, 401);
    const body = await readBody(request);
    user.teams = cleanTeams(body.teams || []);
    user.updatedAt = Date.now();
    await putUser(env, user.lower, user);
    return corsJson({ ok: true, name: user.name, teams: user.teams });
  }

  return null;
}
// ---- CPASTE ACCOUNTS WORKER END ----

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...CORS_HEADERS,
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-cpaste-token",
        },
      });
    }

    if (!env.rooms) return corsJson({ ok: false, error: "KV rooms no está enlazado" }, 500);

    if (url.pathname.startsWith("/api/")) {
      const acc = await handleAccount(req, env, url);
      if (acc) return acc;
    }

    const H = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    };
    const j = await req.json().catch(() => ({}));
    const R = env && env.rooms;
    const mem = new Map();
    const sec = () => crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const id = () => {
      const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let s = "";
      for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)];
      return s.slice(0, 4) + "-" + s.slice(4);
    };
    const send = (o, st = 200) => Response.json(o, { status: st, headers: H });
    const get = async k => {
      if (R) { const v = await R.get(k); return v ? JSON.parse(v) : null; }
      return mem.get(k) || null;
    };
    const put = async (k, v) => { if (R) await R.put(k, JSON.stringify(v)); else mem.set(k, v); };

    if (url.pathname === "/health") return send({ ok: true, accounts: true });

    if (url.pathname === "/api/create") {
      const i = id();
      await put(i, { host: { secret: sec(), team: j.team || null, name: j.name || "Anfitrión" }, guest: null });
      const r = await get(i);
      return send({ id: i, secret: r.host.secret, role: "host" });
    }
    if (url.pathname === "/api/join") {
      const r = await get(j.id);
      if (!r) return send({ error: "Sala no encontrada" }, 404);
      if (r.guest) return send({ error: "Sala llena" }, 409);
      r.guest = { secret: sec(), team: null, name: j.name || "Rival" };
      await put(j.id, r);
      return send({ secret: r.guest.secret, role: "guest" });
    }
    if (url.pathname === "/api/submit") {
      const r = await get(j.id);
      if (!r) return send({ error: "Sala no encontrada" }, 404);
      const slot = r.host.secret === j.secret ? "host" : (r.guest && r.guest.secret === j.secret ? "guest" : null);
      if (!slot) return send({ error: "Credencial inválida" }, 403);
      r[slot].team = j.team;
      r[slot].name = j.name || r[slot].name;
      await put(j.id, r);
      return send({ ok: true });
    }
    if (url.pathname === "/api/peek") {
      const r = await get(j.id);
      if (!r) return send({ error: "Sala no encontrada" }, 404);
      const me = r.host.secret === j.secret ? "host" : (r.guest && r.guest.secret === j.secret ? "guest" : null);
      if (!me) return send({ error: "Credencial inválida" }, 403);
      const other = me === "host" ? "guest" : "host";
      const mine = r[me].team;
      const both = mine && r[other] && r[other].team;
      return send({
        status: !r[other] ? "waiting" : (both ? "revealed" : "pending"),
        you: mine,
        youName: r[me].name,
        them: both ? r[other].team : null,
        themName: r[other] ? r[other].name : null,
        role: me,
      });
    }

    return send({ error: "ruta desconocida" }, 404);
  }
};