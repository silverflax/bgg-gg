const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require("express");
const axios = require("axios");
const xml2js = require("xml2js");
const CacheManager = require("./cacheManager");
const EventManager = require("./eventManager");

const app = express();
app.use(express.json()); // Enable JSON body parsing
const port = process.env.PORT || 4000;

// BGG API Configuration
const BGG_API_BASE_URL = "https://boardgamegeek.com/xmlapi2";
const BGG_ACCESS_TOKEN = process.env.BGG_ACCESS_TOKEN;

// Create axios instance with default BGG API configuration
const bggApi = axios.create({
  baseURL: BGG_API_BASE_URL,
  headers: BGG_ACCESS_TOKEN ? { 'Authorization': `Bearer ${BGG_ACCESS_TOKEN}` } : {}
});

// Log all BGG API requests and responses
const isProduction = process.env.NODE_ENV === 'production';

bggApi.interceptors.request.use(request => {
  const fullUrl = `${request.baseURL}${request.url}`;
  console.log(`[BGG API] Request: ${request.method?.toUpperCase()} ${fullUrl}`);
  
  // Redact sensitive headers in production
  const headersToLog = { ...request.headers };
  if (isProduction && headersToLog.Authorization) {
    headersToLog.Authorization = '[REDACTED]';
  }
  console.log(`[BGG API] Headers:`, JSON.stringify(headersToLog, null, 2));
  return request;
});

bggApi.interceptors.response.use(
  response => {
    console.log(`[BGG API] Response: ${response.status} ${response.statusText}`);
    return response;
  },
  error => {
    console.error(`[BGG API] Error: ${error.response?.status} ${error.response?.statusText}`);
    console.error(`[BGG API] Error details:`, error.message);
    return Promise.reject(error);
  }
);

// Rate limiting delay between BGG API requests (5 seconds as per BGG requirements)
const BGG_RATE_LIMIT_MS = 5000;

// Initialize improved cache manager
const cache = new CacheManager();

// Initialize event manager
const events = new EventManager();

// Health check endpoint for Azure monitoring
app.get("/health", async (req, res) => {
  try {
    const cacheStats = await cache.getStats();
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: "bgg-collection-api",
      version: "1.1.0",
      bggApi: {
        baseUrl: BGG_API_BASE_URL,
        tokenConfigured: !!BGG_ACCESS_TOKEN,
        rateLimitMs: BGG_RATE_LIMIT_MS
      },
      cache: {
        files: cacheStats.fileCount,
        size: cacheStats.totalSize,
        sizeFormatted: cache._formatSize ? cache._formatSize(cacheStats.totalSize) : `${Math.round(cacheStats.totalSize / 1024)}KB`
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

app.get("/api/collection/:username", async (req, res) => {
  const username = req.params.username;
  const forceRefresh = req.query.refresh === 'true';
  
  console.log(`Collection request for ${username}, forceRefresh: ${forceRefresh}`);
  
  // Check if we have cached detailed games (only if not forcing refresh)
  if (!forceRefresh) {
    const cached = await cache.get(`${username}_detailed.json`);
    if (cached) {
      console.log(`Serving cached collection for ${username}`);
      res.json({ ...cached, fromCache: true });
      
      // Continue processing in background to check for new games
      checkForNewGames(username).catch(console.error);
      return;
    } else {
      console.log(`No cache found for ${username}, will fetch fresh collection`);
    }
  }

  try {
    console.log(`Fetching fresh collection for ${username}...`);
    await fetchFullCollection(username, res, forceRefresh);
  } catch (err) {
    console.error(`Error fetching collection for ${username}:`, err.message);
    res.status(500).json({ error: "Failed to fetch from BGG", details: err.message });
  }
});

// New endpoint to check for collection updates
app.get("/api/collection/:username/refresh", async (req, res) => {
  const username = req.params.username;
  
  try {
    const result = await checkForNewGames(username);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to refresh collection" });
  }
});

async function checkForNewGames(username) {
  console.log(`Checking for new games for ${username}...`);
  
  // Get fresh collection list
  const { data: collectionData } = await bggApi.get(`/collection?username=${username}&own=1`);
  const collectionParsed = await xml2js.parseStringPromise(collectionData, { explicitArray: false });

  if (!collectionParsed.items || !collectionParsed.items.item) {
    throw new Error("No games found in collection");
  }

  const currentItems = Array.isArray(collectionParsed.items.item) 
    ? collectionParsed.items.item 
    : [collectionParsed.items.item];

  // Get current collection game IDs
  const currentGameIds = new Set(currentItems.map(item => item.$.objectid));

  // Load existing detailed cache
  let existingGames = [];
  let existingGameIds = new Set();
  
  const cached = await cache.get(`${username}_detailed.json`);
  if (cached) {
    existingGames = cached.games || [];
    existingGameIds = new Set(existingGames.map(game => game.$.id || game.$.objectid));
  }

  // Find games that need to be added (new games)
  const newGameIds = [...currentGameIds].filter(id => !existingGameIds.has(id));
  
  // Find games that need to be removed (no longer in collection)
  const removedGameIds = [...existingGameIds].filter(id => !currentGameIds.has(id));
  
  console.log(`Found ${newGameIds.length} new games, ${removedGameIds.length} removed games out of ${currentItems.length} total`);

  // Start with existing games, filter out removed ones
  let updatedGames = existingGames.filter(game => {
    const gameId = game.$.id || game.$.objectid;
    return currentGameIds.has(gameId);
  });

  let hasChanges = removedGameIds.length > 0;
  let newDetailedGames = [];

  // Fetch details for new games if any
  if (newGameIds.length > 0) {
    newDetailedGames = await fetchGameDetails(newGameIds, currentItems);
    updatedGames = [...updatedGames, ...newDetailedGames];
    hasChanges = true;
  }

  // If no changes, return early
  if (!hasChanges) {
    return {
      hasNewGames: false,
      totalGames: currentItems.length,
      newGamesCount: 0,
      removedGamesCount: 0,
      message: "No changes found"
    };
  }

  // Save updated cache
  const result = {
    totalitems: collectionParsed.items.$.totalitems,
    games: updatedGames,
    fetchedAt: new Date().toISOString()
  };

  // Debug logging for duplicates
  const gameIds = updatedGames.map(game => game.$.id || game.$.objectid);
  const uniqueIds = new Set(gameIds);
  if (gameIds.length !== uniqueIds.size) {
    console.log(`WARNING: Found ${gameIds.length - uniqueIds.size} duplicate games!`);
    // Find and log duplicates
    const duplicates = gameIds.filter((id, index) => gameIds.indexOf(id) !== index);
    console.log('Duplicate IDs:', [...new Set(duplicates)]);
  }

  await cache.set(`${username}_detailed.json`, result);
  console.log(`Updated cache: added ${newDetailedGames.length} new games, removed ${removedGameIds.length} games`);

  return {
    hasNewGames: hasChanges,
    totalGames: updatedGames.length,
    newGamesCount: newGameIds.length,
    removedGamesCount: removedGameIds.length,
    newGames: newDetailedGames,
    allGames: updatedGames
  };
}

async function fetchFullCollection(username, res, forceRefresh = false) {
  // First, get the basic collection
  let collectionData;
  try {
    console.log(`Fetching collection from BGG for ${username}...`);
    const response = await bggApi.get(`/collection?username=${username}&own=1`);
    collectionData = response.data;
    console.log(`BGG API returned status: ${response.status}`);
    
    // BGG API returns 202 when still processing, need to retry
    if (response.status === 202) {
      console.log(`BGG is still processing collection for ${username}, retrying in ${BGG_RATE_LIMIT_MS / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, BGG_RATE_LIMIT_MS));
      const retryResponse = await bggApi.get(`/collection?username=${username}&own=1`);
      collectionData = retryResponse.data;
      console.log(`BGG API retry returned status: ${retryResponse.status}`);
    }
  } catch (error) {
    console.error(`BGG API error for ${username}:`, error.response?.status, error.response?.statusText);
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "User not found or collection is private" });
    }
    throw error;
  }
  
  const collectionParsed = await xml2js.parseStringPromise(collectionData, { explicitArray: false });

  if (!collectionParsed.items || !collectionParsed.items.item) {
    console.log(`No items found in collection for ${username}`);
    return res.status(404).json({ error: "No games found in collection" });
  }

  const items = Array.isArray(collectionParsed.items.item) 
    ? collectionParsed.items.item 
    : [collectionParsed.items.item];

  console.log(`Found ${items.length} games. Fetching detailed data...`);

  // Get all game IDs
  const gameIds = items.map(item => item.$.objectid);
  
  // Debug: Check for duplicate IDs in collection
  const uniqueCollectionIds = new Set(gameIds);
  if (gameIds.length !== uniqueCollectionIds.size) {
    console.log(`WARNING: Collection has ${gameIds.length - uniqueCollectionIds.size} duplicate game IDs!`);
    const duplicates = gameIds.filter((id, index) => gameIds.indexOf(id) !== index);
    console.log('Collection duplicate IDs:', [...new Set(duplicates)]);
  }
  
  // Fetch detailed data for all games
  const detailedGames = await fetchGameDetails(gameIds, items);

  // Debug logging for duplicates
  const resultGameIds = detailedGames.map(game => game.$.id || game.$.objectid);
  const uniqueIds = new Set(resultGameIds);
  if (resultGameIds.length !== uniqueIds.size) {
    console.log(`WARNING: fetchFullCollection found ${resultGameIds.length - uniqueIds.size} duplicate games!`);
    const duplicates = resultGameIds.filter((id, index) => resultGameIds.indexOf(id) !== index);
    console.log('Duplicate IDs in fetchFullCollection:', [...new Set(duplicates)]);
  }

  const result = {
    totalitems: collectionParsed.items.$.totalitems,
    games: detailedGames,
    fetchedAt: new Date().toISOString()
  };

  // Cache the result
  await cache.set(`${username}_detailed.json`, result);
  console.log(`Cached detailed data for ${detailedGames.length} games`);
  
  res.json(result);
}

async function fetchGameDetails(gameIds, collectionItems) {
  const detailedGames = [];
  const batchSize = 10;
  
  // Debug: Check for duplicate IDs in input
  const uniqueInputIds = new Set(gameIds);
  if (gameIds.length !== uniqueInputIds.size) {
    console.log(`WARNING: fetchGameDetails received ${gameIds.length - uniqueInputIds.size} duplicate game IDs in input!`);
    const duplicates = gameIds.filter((id, index) => gameIds.indexOf(id) !== index);
    console.log('Input duplicate IDs:', [...new Set(duplicates)]);
  }
  
  // Remove duplicates from input
  const uniqueGameIds = [...uniqueInputIds];
  console.log(`Processing ${uniqueGameIds.length} unique games (was ${gameIds.length})`);
  
  // Fetch games in batches
  for (let i = 0; i < uniqueGameIds.length; i += batchSize) {
    const batch = uniqueGameIds.slice(i, i + batchSize);
    const gameIdsStr = batch.join(',');
    
    try {
      console.log(`Fetching batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniqueGameIds.length/batchSize)}...`);
      
      const { data: detailData } = await bggApi.get(`/thing?id=${gameIdsStr}&stats=1`);
      const detailParsed = await xml2js.parseStringPromise(detailData, { explicitArray: false });

      if (detailParsed.items && detailParsed.items.item) {
        const detailItems = Array.isArray(detailParsed.items.item) 
          ? detailParsed.items.item 
          : [detailParsed.items.item];

        // Process each game
        for (const detailItem of detailItems) {
          const gameId = detailItem.$.id;
          const collectionData = collectionItems.find(item => item.$.objectid === gameId);
          
          if (collectionData) {
            const gameWithCollection = {
              ...detailItem,
              collectionData: collectionData
            };
            
            detailedGames.push(gameWithCollection);
          }
        }
      }

      // Rate limiting - wait 5 seconds between requests as per BGG API requirements
      if (i + batchSize < uniqueGameIds.length) {
        await new Promise(resolve => setTimeout(resolve, BGG_RATE_LIMIT_MS));
      }
    } catch (batchError) {
      console.error(`Error fetching batch starting at ${i}:`, batchError.message);
      // Add original items without detailed data if batch fails
      for (const gameId of batch) {
        const collectionData = collectionItems.find(item => item.$.objectid === gameId);
        if (collectionData) {
          detailedGames.push(collectionData);
        }
      }
    }
  }

  return detailedGames;
}

// ============================================
// Event API Routes
// ============================================

// Create a new event
app.post("/api/events", async (req, res) => {
  try {
    const { createdBy, name, scenario } = req.body;
    
    if (!createdBy) {
      return res.status(400).json({ error: "createdBy (BGG username) is required" });
    }
    
    const event = await events.create({ createdBy, name, scenario });
    res.status(201).json(event);
  } catch (error) {
    console.error("Error creating event:", error.message);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// Get an event by ID (public - strips creatorToken)
app.get("/api/events/:id", async (req, res) => {
  try {
    const event = await events.getPublic(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    
    // Calculate scores and include them in the response
    const scores = events.calculateScores(event);
    const voterCount = Object.keys(event.votes).length;
    
    res.json({ ...event, scores, voterCount });
  } catch (error) {
    console.error("Error getting event:", error.message);
    res.status(500).json({ error: "Failed to get event" });
  }
});

// Delete an event (requires creatorToken)
app.delete("/api/events/:id", async (req, res) => {
  try {
    const creatorToken = req.headers['x-creator-token'];
    
    if (!creatorToken) {
      return res.status(401).json({ error: "Creator token required" });
    }
    
    const isValid = await events.verifyToken(req.params.id, creatorToken);
    if (!isValid) {
      return res.status(403).json({ error: "Invalid creator token" });
    }
    
    await events.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting event:", error.message);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

// List events by user
app.get("/api/events/user/:username", async (req, res) => {
  try {
    const userEvents = await events.listByUser(req.params.username);
    res.json(userEvents);
  } catch (error) {
    console.error("Error listing events:", error.message);
    res.status(500).json({ error: "Failed to list events" });
  }
});

// Add a game to an event (requires creatorToken)
app.post("/api/events/:id/games", async (req, res) => {
  try {
    const creatorToken = req.headers['x-creator-token'];
    const { game } = req.body;
    
    if (!creatorToken) {
      return res.status(401).json({ error: "Creator token required" });
    }
    
    const isValid = await events.verifyToken(req.params.id, creatorToken);
    if (!isValid) {
      return res.status(403).json({ error: "Invalid creator token" });
    }
    
    if (!game || !game.id || !game.name) {
      return res.status(400).json({ error: "Game data with id and name is required" });
    }
    
    const updatedEvent = await events.addGame(req.params.id, game);
    const scores = events.calculateScores(updatedEvent);
    
    // Strip creatorToken before returning
    const { creatorToken: _, ...safeEvent } = updatedEvent;
    res.json({ ...safeEvent, scores });
  } catch (error) {
    console.error("Error adding game to event:", error.message);
    res.status(500).json({ error: "Failed to add game to event" });
  }
});

// Remove a game from an event (requires creatorToken)
app.delete("/api/events/:id/games/:gameId", async (req, res) => {
  try {
    const creatorToken = req.headers['x-creator-token'];
    
    if (!creatorToken) {
      return res.status(401).json({ error: "Creator token required" });
    }
    
    const isValid = await events.verifyToken(req.params.id, creatorToken);
    if (!isValid) {
      return res.status(403).json({ error: "Invalid creator token" });
    }
    
    const updatedEvent = await events.removeGame(req.params.id, req.params.gameId);
    const scores = events.calculateScores(updatedEvent);
    
    // Strip creatorToken before returning
    const { creatorToken: _, ...safeEvent } = updatedEvent;
    res.json({ ...safeEvent, scores });
  } catch (error) {
    console.error("Error removing game from event:", error.message);
    res.status(500).json({ error: "Failed to remove game from event" });
  }
});

// Submit a vote for an event
app.post("/api/events/:id/vote", async (req, res) => {
  try {
    const { fingerprint, rankedGameIds } = req.body;
    
    if (!fingerprint) {
      return res.status(400).json({ error: "Fingerprint is required for voting" });
    }
    
    if (!Array.isArray(rankedGameIds)) {
      return res.status(400).json({ error: "rankedGameIds must be an array" });
    }
    
    const event = await events.get(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    
    const updatedEvent = await events.vote(req.params.id, fingerprint, rankedGameIds);
    const scores = events.calculateScores(updatedEvent);
    const voterCount = Object.keys(updatedEvent.votes).length;
    
    res.json({ success: true, scores, voterCount });
  } catch (error) {
    console.error("Error submitting vote:", error.message);
    res.status(500).json({ error: "Failed to submit vote" });
  }
});

// Update event name (requires creatorToken)
app.patch("/api/events/:id", async (req, res) => {
  try {
    const creatorToken = req.headers['x-creator-token'];
    const { name } = req.body;
    
    if (!creatorToken) {
      return res.status(401).json({ error: "Creator token required" });
    }
    
    const isValid = await events.verifyToken(req.params.id, creatorToken);
    if (!isValid) {
      return res.status(403).json({ error: "Invalid creator token" });
    }
    
    const updatedEvent = await events.update(req.params.id, { name });
    
    // Strip creatorToken before returning
    const { creatorToken: _, ...safeEvent } = updatedEvent;
    res.json(safeEvent);
  } catch (error) {
    console.error("Error updating event:", error.message);
    res.status(500).json({ error: "Failed to update event" });
  }
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
