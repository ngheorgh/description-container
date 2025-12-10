#!/usr/bin/env node

/**
 * Custom server script pentru Fly.io
 * Forțează serverul să asculte pe 0.0.0.0 în loc de 127.0.0.1
 */

import { createServer } from "node:http";
import { createRequestHandler } from "@react-router/node";
import { installGlobals } from "@react-router/node";

// Instalează globals pentru Node.js
installGlobals();

// Importă server-ul React Router
const build = await import("./build/server/index.js");

// Creează request handler
const requestHandler = createRequestHandler({
  build,
  mode: process.env.NODE_ENV || "production",
});

// Obține port și host din environment
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";

// Creează server HTTP
const server = createServer((req, res) => {
  return requestHandler(req, res);
});

// Pornește serverul pe 0.0.0.0:port
server.listen(port, host, () => {
  console.log(`🚀 Server listening on ${host}:${port}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || "production"}`);
});

// Gestionare erori
server.on("error", (error) => {
  console.error("❌ Server error:", error);
  process.exit(1);
});

