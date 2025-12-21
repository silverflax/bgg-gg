const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");

class EventManager {
  constructor() {
    // Use same environment detection as CacheManager
    this.eventsDir = this._detectEventsDir();
    this.maxEventAge = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    this.cleanupInterval = 60 * 60 * 1000; // 1 hour
    
    this._initializeEventsDir();
    this._scheduleCleanup();
  }

  // Detect the appropriate events directory based on environment
  _detectEventsDir() {
    // Explicit env var takes precedence
    if (process.env.EVENTS_DIR) {
      return process.env.EVENTS_DIR;
    }
    
    // Check if running in a container (Linux with /cache directory available)
    const isContainer = process.platform !== 'win32' && fsSync.existsSync('/cache');
    
    if (isContainer) {
      return '/cache/events';
    }
    
    // Local development - use ./cache/events relative to backend folder
    return path.join(__dirname, 'cache', 'events');
  }

  // Initialize events directory
  async _initializeEventsDir() {
    try {
      await fs.mkdir(this.eventsDir, { recursive: true });
      console.log(`Events directory initialized at: ${this.eventsDir}`);
      
      // Perform initial cleanup
      await this._cleanup();
      
      // Log stats
      const stats = await this.getStats();
      console.log(`Events stats: ${stats.eventCount} active events`);
    } catch (error) {
      console.error("Failed to initialize events directory:", error.message);
    }
  }

  // Schedule periodic cleanup of old events
  _scheduleCleanup() {
    setInterval(async () => {
      try {
        await this._cleanup();
      } catch (error) {
        console.error("Scheduled event cleanup failed:", error.message);
      }
    }, this.cleanupInterval);
  }

  // Get file path for an event
  _getFilePath(eventId) {
    return path.join(this.eventsDir, `${eventId}.json`);
  }

  // Get statistics about events
  async getStats() {
    try {
      const files = await fs.readdir(this.eventsDir);
      const eventCount = files.filter(f => f.endsWith('.json')).length;
      return { eventCount };
    } catch (error) {
      return { eventCount: 0 };
    }
  }

  // Create a new event
  async create(eventData) {
    const id = nanoid(8);
    const event = {
      id,
      createdBy: eventData.createdBy,
      createdAt: new Date().toISOString(),
      name: eventData.name || "Game Night",
      scenario: eventData.scenario || null,
      games: [],
      votes: {}
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(event, null, 2));
    console.log(`Event created: ${id} by ${event.createdBy}`);
    
    return event;
  }

  // Get an event by ID
  async get(eventId) {
    try {
      const filePath = this._getFilePath(eventId);
      
      if (!fsSync.existsSync(filePath)) {
        return null;
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to get event ${eventId}:`, error.message);
      return null;
    }
  }

  // Update an event
  async update(eventId, updates) {
    try {
      const event = await this.get(eventId);
      if (!event) {
        return null;
      }

      const updatedEvent = { ...event, ...updates };
      const filePath = this._getFilePath(eventId);
      await fs.writeFile(filePath, JSON.stringify(updatedEvent, null, 2));
      
      console.log(`Event updated: ${eventId}`);
      return updatedEvent;
    } catch (error) {
      console.error(`Failed to update event ${eventId}:`, error.message);
      return null;
    }
  }

  // Delete an event
  async delete(eventId) {
    try {
      const filePath = this._getFilePath(eventId);
      
      if (!fsSync.existsSync(filePath)) {
        return false;
      }
      
      await fs.unlink(filePath);
      console.log(`Event deleted: ${eventId}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete event ${eventId}:`, error.message);
      return false;
    }
  }

  // List all events created by a user
  async listByUser(username) {
    try {
      const files = await fs.readdir(this.eventsDir);
      const events = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(this.eventsDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const event = JSON.parse(content);
          
          if (event.createdBy === username) {
            events.push(event);
          }
        } catch (error) {
          // Skip corrupted files
          continue;
        }
      }

      // Sort by creation date, newest first
      events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return events;
    } catch (error) {
      console.error(`Failed to list events for ${username}:`, error.message);
      return [];
    }
  }

  // Add a game to an event
  async addGame(eventId, game) {
    const event = await this.get(eventId);
    if (!event) {
      return null;
    }

    // Check if game already exists
    if (event.games.some(g => g.id === game.id)) {
      return event; // Already exists, return as-is
    }

    event.games.push({
      id: game.id,
      name: game.name,
      thumbnail: game.thumbnail,
      weight: game.weight,
      playingTime: game.playingTime,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers
    });

    return await this.update(eventId, { games: event.games });
  }

  // Remove a game from an event
  async removeGame(eventId, gameId) {
    const event = await this.get(eventId);
    if (!event) {
      return null;
    }

    event.games = event.games.filter(g => g.id !== gameId);
    
    // Also remove this game from any votes
    for (const fingerprint of Object.keys(event.votes)) {
      event.votes[fingerprint] = event.votes[fingerprint].filter(id => id !== gameId);
    }

    return await this.update(eventId, { games: event.games, votes: event.votes });
  }

  // Submit a vote for an event
  async vote(eventId, fingerprint, rankedGameIds) {
    const event = await this.get(eventId);
    if (!event) {
      return null;
    }

    // Validate that all game IDs are valid
    const validGameIds = event.games.map(g => g.id);
    const validRanking = rankedGameIds.filter(id => validGameIds.includes(id));

    event.votes[fingerprint] = validRanking;
    
    return await this.update(eventId, { votes: event.votes });
  }

  // Calculate Borda count scores for an event
  calculateScores(event) {
    const scores = {};
    
    // Initialize scores for all games
    for (const game of event.games) {
      scores[game.id] = {
        gameId: game.id,
        name: game.name,
        score: 0,
        voteCount: 0
      };
    }

    const numGames = event.games.length;
    
    // Calculate Borda count: 1st place gets N points, 2nd gets N-1, etc.
    for (const ranking of Object.values(event.votes)) {
      for (let i = 0; i < ranking.length; i++) {
        const gameId = ranking[i];
        if (scores[gameId]) {
          scores[gameId].score += (numGames - i);
          scores[gameId].voteCount++;
        }
      }
    }

    // Convert to array and sort by score descending
    return Object.values(scores).sort((a, b) => b.score - a.score);
  }

  // Cleanup old events
  async _cleanup() {
    try {
      const files = await fs.readdir(this.eventsDir);
      let deletedCount = 0;
      const now = Date.now();

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(this.eventsDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const event = JSON.parse(content);
          const eventAge = now - new Date(event.createdAt).getTime();
          
          if (eventAge > this.maxEventAge) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        } catch (error) {
          // Delete corrupted files
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`Event cleanup: deleted ${deletedCount} old/corrupted events`);
      }

      return deletedCount;
    } catch (error) {
      console.error("Event cleanup failed:", error.message);
      return 0;
    }
  }
}

module.exports = EventManager;

