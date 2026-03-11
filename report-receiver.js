import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'csp-reports.db');

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

// Prepared statement
const insertReport = db.prepare(`
  INSERT INTO csp_reports (
    timestamp, document_uri, violated_directive, effective_directive,
    blocked_uri, source_file, line_number, column_number, status_code,
    referrer, disposition, original_policy, raw_report
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Helper: Parse JSON body safely
const parseBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      // Limit body size to 32kb
      if (body.length > 32 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
};

const server = http.createServer(async (req, res) => {
  // Only allow POST to /api/reports
  if (req.url !== '/api/reports' || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  // Security headers
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Access-Control-Allow-Origin', ''); // No CORS by default
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Rate limiting (very simple, per-process, per-IP)
  const ip = req.socket.remoteAddress;
  if (!global.rateLimit) global.rateLimit = {};
  const now = Date.now();
  global.rateLimit[ip] = global.rateLimit[ip] || [];
  // Remove old timestamps
  global.rateLimit[ip] = global.rateLimit[ip].filter(ts => now - ts < 60000);
  if (global.rateLimit[ip].length > 10) { // 10 req/min per IP
    res.writeHead(429, { 'Content-Type': 'text/plain' });
    res.end('Too Many Requests');
    return;
  }
  global.rateLimit[ip].push(now);

  try {
    const body = await parseBody(req);
    const reports = Array.isArray(body) ? body : [body];
    let inserted = 0;
    for (const report of reports) {
      const cspReport = report['csp-report'] || report;
      if (cspReport) {
        // Basic input validation
        if (typeof cspReport !== 'object' || !cspReport['document-uri']) continue;
        const timestamp = Date.now();
        insertReport.run(
          timestamp,
          cspReport['document-uri'] || cspReport.documentURL || '',
          cspReport['violated-directive'] || '',
          cspReport['effective-directive'] || '',
          cspReport['blocked-uri'] || cspReport.blockedURL || '',
          cspReport['source-file'] || cspReport.sourceFile || '',
          cspReport['line-number'] || cspReport.lineNumber || null,
          cspReport['column-number'] || cspReport.columnNumber || null,
          cspReport['status-code'] || cspReport.statusCode || null,
          cspReport.referrer || '',
          cspReport.disposition || '',
          cspReport['original-policy'] || '',
          JSON.stringify(report)
        );
        inserted++;
      }
    }
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, received: inserted }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid request' }));
  }
});

server.listen(PORT, () => {
  console.log(`CSP report receiver running on port ${PORT}`);
  console.log(`Database location: ${DB_PATH}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing report receiver...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
