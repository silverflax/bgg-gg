const express = require("express");
const axios = require("axios");
const xml2js = require("xml2js");
const CacheManager = require("./cacheManager");

const app = express();
const port = process.env.PORT || 4000;

// Initialize improved cache manager
const cache = new CacheManager();

// Health check endpoint for Azure monitoring
app.get("/health", async (req, res) => {
  try {
    const cacheStats = await cache.getStats();
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: "bgg-collection-api",
      version: "1.0.0",
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
  const collectionUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${username}&own=1`;
  const { data: collectionData } = await axios.get(collectionUrl);
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
  const collectionUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${username}&own=1`;
  
  let collectionData;
  try {
    console.log(`Fetching collection from BGG for ${username}...`);
    const response = await axios.get(collectionUrl);
    collectionData = response.data;
    console.log(`BGG API returned status: ${response.status}`);
    
    // BGG API returns 202 when still processing, need to retry
    if (response.status === 202) {
      console.log(`BGG is still processing collection for ${username}, retrying in 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      const retryResponse = await axios.get(collectionUrl);
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
      
      const detailUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameIdsStr}&stats=1`;
      const { data: detailData } = await axios.get(detailUrl);
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

      // Rate limiting - wait 1 second between requests
      if (i + batchSize < gameIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
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

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
