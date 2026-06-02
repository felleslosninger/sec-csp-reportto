import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'csp-reports.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS csp_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    document_uri TEXT,
    violated_directive TEXT,
    effective_directive TEXT,
    blocked_uri TEXT,
    source_file TEXT,
    line_number INTEGER,
    column_number INTEGER,
    status_code INTEGER,
    referrer TEXT,
    disposition TEXT,
    original_policy TEXT,
    raw_report TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_timestamp ON csp_reports(timestamp)`);

// Prepared statements
const countAll = db.prepare(`SELECT COUNT(*) as count FROM csp_reports`);
const getPage = db.prepare(`SELECT * FROM csp_reports ORDER BY timestamp DESC LIMIT ? OFFSET ?`);
const countFiltered = db.prepare(`SELECT COUNT(*) as count FROM csp_reports WHERE document_uri LIKE ? OR blocked_uri LIKE ?`);
const getPageFiltered = db.prepare(`SELECT * FROM csp_reports WHERE document_uri LIKE ? OR blocked_uri LIKE ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`);
const getTopViolations = db.prepare(`SELECT violated_directive, COUNT(*) as count FROM csp_reports GROUP BY violated_directive ORDER BY count DESC LIMIT 5`);
const getTopViolationsFiltered = db.prepare(`SELECT violated_directive, COUNT(*) as count FROM csp_reports WHERE document_uri LIKE ? OR blocked_uri LIKE ? GROUP BY violated_directive ORDER BY count DESC LIMIT 5`);

// Helper function to send JSON response
const sendJSON = (res, data, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

// Helper function to send file
const sendFile = (res, filePath, contentType) => {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/api/reports' && req.method === 'GET') {
    const domain = url.searchParams.get('domain');
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)));
    const offset = (page - 1) * limit;

    let reports, total;
    if (domain) {
      const pattern = `%${domain}%`;
      total = countFiltered.get(pattern, pattern).count;
      reports = getPageFiltered.all(pattern, pattern, limit, offset);
    } else {
      total = countAll.get().count;
      reports = getPage.all(limit, offset);
    }
    sendJSON(res, { reports, total, page, limit });
    return;
  }

  if (pathname === '/api/stats' && req.method === 'GET') {
    const domain = url.searchParams.get('domain');
    let total, topViolations;
    if (domain) {
      const pattern = `%${domain}%`;
      total = countFiltered.get(pattern, pattern).count;
      topViolations = getTopViolationsFiltered.all(pattern, pattern);
    } else {
      total = countAll.get().count;
      topViolations = getTopViolations.all();
    }
    sendJSON(res, { total, topViolations });
    return;
  }

  if (pathname === '/' && req.method === 'GET') {
    sendFile(res, path.join(__dirname, 'public', 'index.html'), 'text/html');
    return;
  }

  // Serve static files from node_modules
  if (pathname.startsWith('/node_modules/')) {
    const filePath = path.join(__dirname, pathname);
    const ext = path.extname(filePath);
    const contentTypes = {
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json'
    };
    sendFile(res, filePath, contentTypes[ext] || 'text/plain');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Dashboard server running on http://localhost:${PORT}`);
  console.log(`Database location: ${DB_PATH}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing dashboard server...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
