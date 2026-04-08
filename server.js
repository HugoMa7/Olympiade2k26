const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT           = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const DATA_DIR       = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE      = path.join(DATA_DIR, 'teams.json');

// ── Ensure data directory and file exist ──────────────────────────────────────
if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

// ── Helpers ───────────────────────────────────────────────────────────────────
function readTeams() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeTeams(teams) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(teams, null, 2), 'utf8');
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function isAdmin(req) {
  return req.headers['x-admin-password'] === ADMIN_PASSWORD;
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  // CORS headers (handy during local dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── Static pages ────────────────────────────────────────────────────────────
  if (method === 'GET' && url === '/') {
    return serveFile(res, path.join(__dirname, 'index.html'), 'text/html; charset=utf-8');
  }
  if (method === 'GET' && url === '/admin') {
    return serveFile(res, path.join(__dirname, 'admin.html'), 'text/html; charset=utf-8');
  }

  // ── POST /api/register ───────────────────────────────────────────────────────
  if (method === 'POST' && url === '/api/register') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

    const teamName = (body.teamName || '').trim();
    const members  = body.members;

    if (!teamName || teamName.length > 40)
      return json(res, 400, { error: 'Nom d\'équipe invalide' });

    if (!Array.isArray(members) || members.length !== 4)
      return json(res, 400, { error: '4 membres requis' });

    for (const m of members) {
      if (!m.first || !m.last || m.first.length > 30 || m.last.length > 30)
        return json(res, 400, { error: 'Prénom/Nom invalide' });
    }

    const teams = readTeams();

    // Prevent duplicate team names
    if (teams.some(t => t.teamName.toLowerCase() === teamName.toLowerCase()))
      return json(res, 409, { error: 'Ce nom d\'équipe est déjà pris' });

    const team = {
      id:        crypto.randomUUID(),
      teamName,
      members:   members.map(m => ({ first: m.first.trim(), last: m.last.trim() })),
      createdAt: new Date().toISOString(),
    };

    teams.push(team);
    writeTeams(teams);

    return json(res, 201, { success: true, team });
  }

  // ── GET /api/teams  (admin) ──────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/teams') {
    if (!isAdmin(req)) return json(res, 401, { error: 'Non autorisé' });
    return json(res, 200, { teams: readTeams() });
  }

  // ── DELETE /api/teams/:id  (admin) ──────────────────────────────────────────
  const deleteMatch = url.match(/^\/api\/teams\/([a-zA-Z0-9-]+)$/);
  if (method === 'DELETE' && deleteMatch) {
    if (!isAdmin(req)) return json(res, 401, { error: 'Non autorisé' });
    const id    = deleteMatch[1];
    const teams = readTeams();
    const idx   = teams.findIndex(t => t.id === id);
    if (idx === -1) return json(res, 404, { error: 'Équipe introuvable' });
    teams.splice(idx, 1);
    writeTeams(teams);
    return json(res, 200, { success: true });
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => console.log(`Olympiades server running on port ${PORT}`));
