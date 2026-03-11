FROM node:24-alpine

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies and rebuild native modules
RUN pnpm install --frozen-lockfile

# Copy application files
COPY dashboard.js ./
COPY report-receiver.js ./
COPY public ./public

# Create data directory for SQLite and declare as volume
RUN mkdir -p /app/data
VOLUME /app/data

# Expose default ports (dashboard: 3000, receiver: 8080)
EXPOSE 3000
EXPOSE 8080

# Set environment variable for database path
ENV DB_PATH=/app/data/csp-reports.db

# Default to dashboard, override CMD for receiver
CMD ["node", "dashboard.js"]

# To run the report receiver, override CMD:
# docker run ... node report-receiver.js
