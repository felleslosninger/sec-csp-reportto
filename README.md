# CSP Report-To Application

A Content Security Policy (CSP) violation reporting application built with Node.js, SQLite, and the Digdir Design System.

## Quick Start

```bash
# Build the image
docker build -t csp-reportto-app .

# Run the dashboard (local network only, port 3000)
docker run -d -p 3000:3000 -v csp-data:/app/data --name csp-dashboard csp-reportto-app

# Run the report receiver (public, port 8080)
docker run -d -p 8080:8080 -v csp-data:/app/data --name csp-receiver csp-reportto-app node report-receiver.js
```

- **Dashboard**: http://localhost:3000 — view reports (keep on local network)
- **Report receiver**: http://localhost:8080/api/reports — receives CSP reports (deploy to internet)

Both containers share the same database via the `csp-data` volume.

## Configuration

| Variable | Component | Default | Description |
| --- | --- | --- | --- |
| `PORT` | both | 3000 / 8080 | Listening port |
| `DB_PATH` | both | `data/csp-reports.db` | SQLite database file |
| `SHOW_LOCALHOST` | dashboard | `false` | Show reports whose `document-uri` is localhost/127.0.0.1/[::1]. Set to `true` when testing locally, otherwise such reports are hidden. |
| `RATE_LIMIT_PER_MIN` | receiver | `120` | Max reports accepted per IP per minute |

## Notes on CORS

Browsers deliver CSP violation reports as CORS requests with a non-safelisted
content type (`application/csp-report` / `application/reports+json`), so a
`OPTIONS` preflight must succeed before a report is sent. The receiver answers
preflights on `/api/reports` and reflects the requesting `Origin`. If the report
endpoint is on a different origin than the reporting site, a proxy in front of
the receiver must not strip these headers.
