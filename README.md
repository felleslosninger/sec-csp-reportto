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
