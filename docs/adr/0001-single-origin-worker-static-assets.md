# ADR-0001: Single-origin Worker and static assets

- Status: accepted
- Date: 2026-08-12

## Context

Va de Vi needs an installable React PWA, a private API, and a deployment shape that remains viable on Cloudflare's zero-cost tier. Cross-origin browser configuration would add unnecessary CORS and security-header complexity.

## Decision

Build the web client with React, TypeScript, and Vite. Deploy its immutable output with Cloudflare Workers Static Assets. Route `/api/*`, `/health`, and the OpenAPI document through one Hono Worker on the same origin. In local development Vite proxies API traffic to a local Wrangler process; this is a development convenience, not a production boundary.

## Consequences

- Browser authentication and API traffic share one explicit origin and CSP.
- Static assets can bypass Worker execution.
- The Worker is the sole authorization boundary for D1 and private R2 media.
- Preview and production still require isolated bindings and Firebase projects.
