#!/usr/bin/env node

/**
 * Custom server script pentru Fly.io
 * Forțează serverul să asculte pe 0.0.0.0 în loc de 127.0.0.1
 */

import { createServer } from "node:http";

// Importă server-ul React Router
const build = await import("./build/server/index.js");

// React Router v7 exportă handler-ul ca default sau ca requestHandler
// În Node.js v20+, Request și Response sunt deja disponibile global
const requestHandler = build.default || build.requestHandler || build;

// Obține port și host din environment
// IMPORTANT: Pentru Fly.io, trebuie să ascultăm pe 0.0.0.0, nu pe 127.0.0.1
const port = process.env.PORT || 3000;
const host = "0.0.0.0"; // Forțează 0.0.0.0 pentru Fly.io

// Creează server HTTP
const server = createServer(async (req, res) => {
  try {
    // Convertește Node.js request la Web API Request
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const hostname = req.headers.host || `${host}:${port}`;
    const url = `${protocol}://${hostname}${req.url}`;
    
    // Creează Request object
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
    }

    const request = new Request(url, {
      method: req.method,
      headers: headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
    });

    // Apelează handler-ul React Router
    const response = await requestHandler(request, {
      context: {},
    });

    // Trimite răspunsul
    res.writeHead(response.status, Object.fromEntries(response.headers));
    
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (error) {
    console.error("❌ Request error:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal Server Error");
  }
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

