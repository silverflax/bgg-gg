const express = require("express");
const axios = require("axios");
const xml2js = require("xml2js");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 4000;
const cachePath = process.env.CACHE_PATH || "./cache";

// In-memory cache fallback when filesystem is unavailable
const memoryCache = new Map();
let filesystemCacheEnabled = true;

// Try to ensure cache folder exists, but don't crash if it fails
try {
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });
  }
  // Test write permissions
  const testFile = path.join(cachePath, '.write-test');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);
  console.log(`Filesystem cache enabled at: ${cachePath}`);
} catch (err) {
  console.warn(`Filesystem cache unavailable (${err.message}), using in-memory cache`);
  filesystemCacheEnabled = false;
}

// Helper: Read from cache (filesystem or memory)
function readCache(key) {
  // Try filesystem first
  if (filesystemCacheEnabled) {
    try {
      const cacheFile = path.join(cachePath, `${key}.json`);
      if (fs.existsSync(cacheFile)) {
        const data = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
        return data;
      }
    } catch (err) {
      console.warn(`Cache read failed for ${key}: ${err.message}`);
    }
  }
  
  // Fallback to memory cache
  return memoryCache.get(key) || null;
}

// Helper: Write to cache (filesystem and memory)
function writeCache(key, data) {
  // Always write to memory cache
  memoryCache.set(key, data);
  
  // Try filesystem cache (non-blocking, non-fatal)
  if (filesystemCacheEnabled) {
    try {
      const cacheFile = path.join(cachePath, `${key}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    } catch (err) {
      console.warn(`Cache write failed for ${key}: ${err.message}`);
    }
  }
}

// Health check endpoint for Azure monitoring
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: "bgg-collection-api",
    version: "1.0.0",
    cache: {
      filesystem: filesystemCacheEnabled,
      memoryEntries: memoryCache.size
    }
  });
});

app.get("/api/collection/:username", async (req, res) => {
  const username = req.params.username;

  // Check cache first
  const cached = readCache(username);
  if (cached) {
    return res.json(cached);
  }

  try {
    const url = `https://boardgamegeek.com/xmlapi2/collection?username=${username}&own=1`;
    const { data } = await axios.get(url);
    const parsed = await xml2js.parseStringPromise(data, { explicitArray: false });

    // Cache the result (non-fatal if it fails)
    writeCache(username, parsed);
    
    res.json(parsed);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch from BGG" });
  }
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
