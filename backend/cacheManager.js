const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

class CacheManager {
  constructor() {
    // Environment-configurable settings
    this.cacheDir = process.env.CACHE_DIR || "/cache";
    this.maxCacheSize = this._parseSize(process.env.MAX_CACHE_SIZE || "100MB");
    this.defaultTTL = this._parseTTL(process.env.CACHE_TTL || "30d");
    this.cleanupInterval = this._parseTTL(process.env.CLEANUP_INTERVAL || "1h");
    this.maxAge = this._parseTTL(process.env.MAX_CACHE_AGE || "30d");
    
    this._initializeCache();
    this._scheduleCleanup();
  }

  // Parse size strings like "100MB", "1GB" to bytes
  _parseSize(sizeStr) {
    const units = { KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
    const match = sizeStr.match(/^(\d+)(KB|MB|GB)$/i);
    if (!match) return 100 * 1024 * 1024; // Default 100MB
    return parseInt(match[1]) * units[match[2].toUpperCase()];
  }

  // Parse time strings like "1h", "24h", "7d" to milliseconds
  _parseTTL(timeStr) {
    const units = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
    const match = timeStr.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return 24 * 60 * 60 * 1000; // Default 24h
    return parseInt(match[1]) * units[match[2].toLowerCase()];
  }

  // Initialize cache directory and perform startup cleanup
  async _initializeCache() {
    try {
      // Create cache directory if it doesn't exist
      await fs.mkdir(this.cacheDir, { recursive: true });
      console.log(`Cache initialized at: ${this.cacheDir}`);
      
      // Perform initial cleanup
      await this._cleanup();
      
      // Log cache statistics
      const stats = await this.getStats();
      console.log(`Cache stats: ${stats.fileCount} files, ${this._formatSize(stats.totalSize)}`);
    } catch (error) {
      console.error("Failed to initialize cache:", error.message);
    }
  }

  // Schedule periodic cleanup
  _scheduleCleanup() {
    setInterval(async () => {
      try {
        await this._cleanup();
      } catch (error) {
        console.error("Scheduled cleanup failed:", error.message);
      }
    }, this.cleanupInterval);
  }

  // Get cache statistics
  async getStats() {
    try {
      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;
      let fileCount = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.cacheDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          fileCount++;
        }
      }

      return { fileCount, totalSize };
    } catch (error) {
      return { fileCount: 0, totalSize: 0 };
    }
  }

  // Format bytes to human-readable size
  _formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Get cache file path for a key
  _getFilePath(key) {
    // Sanitize key for filesystem
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.cacheDir, `${sanitizedKey}.json`);
  }

  // Get lock file path for atomic operations
  _getLockPath(key) {
    return this._getFilePath(key) + '.lock';
  }

  // Check if cache entry is valid (not expired)
  _isExpired(metadata, customTTL = null) {
    const ttl = customTTL || this.defaultTTL;
    return (Date.now() - metadata.timestamp) > ttl;
  }

  // Atomic write with lock file
  async _atomicWrite(filePath, data) {
    const lockPath = filePath + '.lock';
    const tempPath = filePath + '.tmp';
    
    try {
      // Create lock file
      await fs.writeFile(lockPath, '');
      
      // Write to temporary file
      await fs.writeFile(tempPath, data);
      
      // Atomic rename
      await fs.rename(tempPath, filePath);
      
      // Remove lock
      await fs.unlink(lockPath);
    } catch (error) {
      // Cleanup on error
      try {
        await fs.unlink(tempPath).catch(() => {});
        await fs.unlink(lockPath).catch(() => {});
      } catch {}
      throw error;
    }
  }

  // Set cache entry
  async set(key, data, customTTL = null) {
    try {
      const filePath = this._getFilePath(key);
      const metadata = {
        timestamp: Date.now(),
        ttl: customTTL || this.defaultTTL,
        key: key,
        size: JSON.stringify(data).length
      };

      const cacheEntry = { metadata, data };
      const content = JSON.stringify(cacheEntry, null, 2);
      
      await this._atomicWrite(filePath, content);
      
      console.log(`Cache SET: ${key} (${this._formatSize(metadata.size)})`);
      
      // Trigger cleanup if we're getting large
      const stats = await this.getStats();
      if (stats.totalSize > this.maxCacheSize * 0.8) {
        setImmediate(() => this._cleanup());
      }
      
      return true;
    } catch (error) {
      console.error(`Cache SET failed for ${key}:`, error.message);
      return false;
    }
  }

  // Get cache entry
  async get(key, customTTL = null) {
    try {
      const filePath = this._getFilePath(key);
      const lockPath = this._getLockPath(key);
      
      // Check if file is being written (lock exists)
      if (fsSync.existsSync(lockPath)) {
        console.log(`Cache LOCKED: ${key} (write in progress)`);
        return null;
      }
      
      // Check if file exists
      if (!fsSync.existsSync(filePath)) {
        return null;
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      const cacheEntry = JSON.parse(content);
      
      // Check if expired
      if (this._isExpired(cacheEntry.metadata, customTTL)) {
        console.log(`Cache EXPIRED: ${key}`);
        await this.delete(key);
        return null;
      }
      
      console.log(`Cache HIT: ${key} (age: ${this._formatAge(cacheEntry.metadata.timestamp)})`);
      return cacheEntry.data;
    } catch (error) {
      console.error(`Cache GET failed for ${key}:`, error.message);
      return null;
    }
  }

  // Delete cache entry
  async delete(key) {
    try {
      const filePath = this._getFilePath(key);
      await fs.unlink(filePath);
      console.log(`Cache DELETE: ${key}`);
      return true;
    } catch (error) {
      // File might not exist, that's okay
      return false;
    }
  }

  // Check if key exists and is valid
  async exists(key, customTTL = null) {
    try {
      const filePath = this._getFilePath(key);
      if (!fsSync.existsSync(filePath)) return false;
      
      const content = await fs.readFile(filePath, 'utf-8');
      const cacheEntry = JSON.parse(content);
      
      return !this._isExpired(cacheEntry.metadata, customTTL);
    } catch (error) {
      return false;
    }
  }

  // Format age for logging
  _formatAge(timestamp) {
    const age = Date.now() - timestamp;
    const minutes = Math.floor(age / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  // Clean up expired and oversized cache
  async _cleanup() {
    try {
      const files = await fs.readdir(this.cacheDir);
      const cacheFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.lock') && !f.endsWith('.tmp'));
      
      let deletedCount = 0;
      let deletedSize = 0;
      let totalSize = 0;
      const fileInfos = [];

      // Collect file information
      for (const file of cacheFiles) {
        const filePath = path.join(this.cacheDir, file);
        try {
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          const cacheEntry = JSON.parse(content);
          
          fileInfos.push({
            file,
            filePath,
            size: stats.size,
            timestamp: cacheEntry.metadata.timestamp,
            metadata: cacheEntry.metadata
          });
          
          totalSize += stats.size;
        } catch (error) {
          // Corrupted file, mark for deletion
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      // Delete expired files
      for (const fileInfo of fileInfos) {
        if (this._isExpired(fileInfo.metadata) || (Date.now() - fileInfo.timestamp) > this.maxAge) {
          await fs.unlink(fileInfo.filePath);
          deletedCount++;
          deletedSize += fileInfo.size;
          totalSize -= fileInfo.size;
        }
      }

      // If still over size limit, delete oldest files
      if (totalSize > this.maxCacheSize) {
        const remainingFiles = fileInfos.filter(f => fsSync.existsSync(f.filePath));
        remainingFiles.sort((a, b) => a.timestamp - b.timestamp); // Oldest first
        
        for (const fileInfo of remainingFiles) {
          if (totalSize <= this.maxCacheSize * 0.9) break; // Leave some headroom
          
          await fs.unlink(fileInfo.filePath);
          deletedCount++;
          deletedSize += fileInfo.size;
          totalSize -= fileInfo.size;
        }
      }

      if (deletedCount > 0) {
        console.log(`Cache cleanup: deleted ${deletedCount} files (${this._formatSize(deletedSize)})`);
      }

      return { deletedCount, deletedSize, remainingSize: totalSize };
    } catch (error) {
      console.error("Cache cleanup failed:", error.message);
      return { deletedCount: 0, deletedSize: 0, remainingSize: 0 };
    }
  }

  // Clear all cache
  async clear() {
    try {
      const files = await fs.readdir(this.cacheDir);
      let deletedCount = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.cacheDir, file));
          deletedCount++;
        }
      }
      
      console.log(`Cache cleared: ${deletedCount} files deleted`);
      return deletedCount;
    } catch (error) {
      console.error("Cache clear failed:", error.message);
      return 0;
    }
  }
}

module.exports = CacheManager;
