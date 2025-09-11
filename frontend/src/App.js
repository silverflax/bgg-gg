import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [username, setUsername] = useState('');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState('');
  
  // Filter states
  const [filters, setFilters] = useState({
    nameFilter: '',
    minWeight: '',
    maxWeight: '',
    minPlayers: '',
    maxPlayers: '',
    bestPlayerCount: '',
    hideExpansions: false
  });
  
  const [sortBy, setSortBy] = useState('name-asc'); // Default sort by name ascending
  const [filtersCollapsed, setFiltersCollapsed] = useState(true); // Collapsed by default
  const [darkTheme, setDarkTheme] = useState(false); // Dark theme state

  // Cookie helper functions
  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  };

  const setCookie = (name, value, days = 30) => {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
  };

  // Initialize username and theme from cookies
  useEffect(() => {
    const savedUsername = getCookie('bgg-username');
    if (savedUsername) {
      setUsername(savedUsername);
      setTempUsername(savedUsername);
    } else {
      // No username saved, start in edit mode
      setIsEditingUsername(true);
    }

    // Initialize dark theme from cookie
    const savedTheme = getCookie('bgg-dark-theme');
    if (savedTheme === 'true') {
      setDarkTheme(true);
      document.body.classList.add('dark-theme');
    }
  }, []);

  // Load games when username changes
  useEffect(() => {
    if (username) {
      loadGamesForUser(username);
    } else {
      setGames([]);
    }
  }, [username]);

  const loadGamesForUser = async (targetUsername) => {
    if (!targetUsername.trim()) return;

    setLoading(true);
    setError('');
    
    try {
      // Initial load - will serve cached data immediately if available
      const response = await fetch(`/api/collection/${targetUsername}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }
      
      const data = await response.json();
      setGames(data.games || []);
      
      // If we got cached data, check for new games in background
      if (data.fromCache) {
        setTimeout(() => checkForNewGames(targetUsername), 1000);
      }
    } catch (err) {
      setError(err.message);
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  // Smart refresh after initial load
  const checkForNewGames = async (targetUsername = username) => {
    if (!targetUsername || refreshing) return;
    
    setRefreshing(true);
    try {
      const response = await fetch(`/api/collection/${targetUsername}/refresh`);
      const data = await response.json();
      
      if (data.hasNewGames && data.allGames) {
        const newCount = data.newGamesCount || 0;
        const removedCount = data.removedGamesCount || 0;
        
        let message = '';
        if (newCount > 0 && removedCount > 0) {
          message = `Found ${newCount} new games and removed ${removedCount} games`;
        } else if (newCount > 0) {
          message = `Found ${newCount} new games!`;
        } else if (removedCount > 0) {
          message = `Removed ${removedCount} games from collection`;
        } else {
          message = 'Collection updated';
        }
        
        console.log(message);
        setGames(data.allGames);
      } else {
        console.log('No changes found in collection');
      }
    } catch (err) {
      console.error('Error checking for new games:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleUsernameEdit = () => {
    setTempUsername(username);
    setIsEditingUsername(true);
  };

  const handleUsernameSave = () => {
    const newUsername = tempUsername.trim();
    if (newUsername) {
      setUsername(newUsername);
      setCookie('bgg-username', newUsername);
      setIsEditingUsername(false);
    }
  };

  const handleUsernameCancel = () => {
    setTempUsername(username);
    setIsEditingUsername(false);
  };

  const handleUsernameKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleUsernameSave();
    } else if (e.key === 'Escape') {
      handleUsernameCancel();
    }
  };

  const manualRefresh = () => {
    checkForNewGames();
  };

  const toggleDarkTheme = () => {
    const newTheme = !darkTheme;
    setDarkTheme(newTheme);
    setCookie('bgg-dark-theme', newTheme.toString(), 365); // Save for 1 year
    
    if (newTheme) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  };

  const getGameStats = (game) => {
    // Try to get stats from detailed data first, then fallback to collection data
    const stats = game.statistics?.ratings || game.stats || {};
    
    const getRating = () => {
      const rating = stats.average?.$.value || stats.average?._ || stats.average;
      if (typeof rating === 'object') return 'N/A';
      return rating ? parseFloat(rating).toFixed(1) : 'N/A';
    };
    
    const getWeight = () => {
      const weight = stats.averageweight?.$.value || stats.averageweight?._ || stats.averageweight;
      if (typeof weight === 'object') return 'N/A';
      return weight ? parseFloat(weight).toFixed(1) : 'N/A';
    };
    
    const getMinPlayers = () => {
      const min = game.minplayers?.$.value || game.minplayers?._ || game.minplayers;
      if (typeof min === 'object') return 'N/A';
      return min || 'N/A';
    };
    
    const getMaxPlayers = () => {
      const max = game.maxplayers?.$.value || game.maxplayers?._ || game.maxplayers;
      if (typeof max === 'object') return 'N/A';
      return max || 'N/A';
    };
    
    return {
      rating: getRating(),
      weight: getWeight(),
      minPlayers: getMinPlayers(),
      maxPlayers: getMaxPlayers(),
      bestPlayerCount: getBestPlayerCount(game)
    };
  };

  const getBestPlayerCount = (game) => {
    // Try to find the best player count from poll results
    if (game.poll && Array.isArray(game.poll)) {
      const playerCountPoll = game.poll.find(p => p.$.name === 'suggested_numplayers');
      if (playerCountPoll && playerCountPoll.results) {
        const results = Array.isArray(playerCountPoll.results) ? playerCountPoll.results : [playerCountPoll.results];
        let bestCount = 'N/A';
        let bestScore = 0;
        
        results.forEach(result => {
          if (result.result && Array.isArray(result.result)) {
            const bestVotes = result.result.find(r => r.$.value === 'Best');
            if (bestVotes && parseInt(bestVotes.$.numvotes) > bestScore) {
              bestScore = parseInt(bestVotes.$.numvotes);
              bestCount = result.$.numplayers;
            }
          }
        });
        
        return bestCount;
      }
    }
    return 'N/A';
  };

  const getGameName = (game) => {
    if (game.name) {
      if (Array.isArray(game.name)) {
        const primaryName = game.name.find(n => n.$ && n.$.type === 'primary');
        if (primaryName && primaryName.$.value) return String(primaryName.$.value);
        const firstName = game.name[0];
        if (firstName && firstName.$.value) return String(firstName.$.value);
        if (typeof firstName === 'string') return firstName;
      } else if (game.name.$ && game.name.$.value) {
        return String(game.name.$.value);
      } else if (typeof game.name === 'string') {
        return game.name;
      } else if (game.name._) {
        return String(game.name._);
      }
    }
    return 'Unknown Game';
  };

  const getGameImage = (game) => {
    const thumbnail = game.thumbnail?._ || game.thumbnail;
    const image = game.image?._ || game.image;
    
    if (typeof thumbnail === 'string' && thumbnail) return thumbnail;
    if (typeof image === 'string' && image) return image;
    return '';
  };

  const getGameId = (game) => {
    const id = game.$.id || game.$.objectid;
    return typeof id === 'string' ? id : String(id);
  };

  const safeGetValue = (value, fallback = 'N/A') => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (value.$.value !== undefined) return String(value.$.value);
    if (value._ !== undefined) return String(value._);
    return fallback;
  };

  const isExpansion = (game) => {
    // Check if type is boardgameexpansion
    if (game.$.type === 'boardgameexpansion') return true;
    
    // Check if it has "Expansion for Base-game" category
    if (game.link && Array.isArray(game.link)) {
      return game.link.some(link => 
        link.$.type === 'boardgamecategory' && 
        link.$.value === 'Expansion for Base-game'
      );
    }
    
    return false;
  };

  const getBaseGameInfo = (game) => {
    if (!isExpansion(game) || !game.link || !Array.isArray(game.link)) {
      return null;
    }
    
    // Find the base game link (marked with inbound="true")
    const baseGameLink = game.link.find(link => 
      link.$.type === 'boardgameexpansion' && 
      link.$.inbound === 'true'
    );
    
    return baseGameLink ? {
      id: baseGameLink.$.id,
      name: baseGameLink.$.value
    } : null;
  };

  const openGameDetails = (game) => {
    setSelectedGame(game);
  };

  const closeGameDetails = () => {
    setSelectedGame(null);
  };

  const openBGGPage = (gameId) => {
    window.open(`https://boardgamegeek.com/boardgame/${gameId}`, '_blank');
  };

  // Filter games based on current filter settings
  const filteredGames = games.filter(game => {
    const stats = getGameStats(game);
    
    // Name filter (case-insensitive partial match)
    if (filters.nameFilter) {
      const gameName = getGameName(game).toLowerCase();
      const filterText = filters.nameFilter.toLowerCase();
      if (!gameName.includes(filterText)) return false;
    }
    
    // Hide expansions filter
    if (filters.hideExpansions && isExpansion(game)) return false;
    
    // Weight filter
    if (filters.minWeight && parseFloat(stats.weight) < parseFloat(filters.minWeight)) return false;
    if (filters.maxWeight && parseFloat(stats.weight) > parseFloat(filters.maxWeight)) return false;
    
    // Player count filter (check if the game supports the specified range)
    if (filters.minPlayers) {
      const gameMaxPlayers = parseInt(stats.maxPlayers);
      if (isNaN(gameMaxPlayers) || gameMaxPlayers < parseInt(filters.minPlayers)) return false;
    }
    if (filters.maxPlayers) {
      const gameMinPlayers = parseInt(stats.minPlayers);
      if (isNaN(gameMinPlayers) || gameMinPlayers > parseInt(filters.maxPlayers)) return false;
    }
    
    // Best player count filter
    if (filters.bestPlayerCount) {
      const bestCount = String(stats.bestPlayerCount);
      const filterValue = String(filters.bestPlayerCount);
      if (bestCount === 'N/A' || bestCount !== filterValue) return false;
    }
    
    return true;
  });

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      nameFilter: '',
      minWeight: '',
      maxWeight: '',
      minPlayers: '',
      maxPlayers: '',
      bestPlayerCount: '',
      hideExpansions: false
    });
  };

  // Sort games based on current sort setting
  const sortGames = (games) => {
    const [field, direction] = sortBy.split('-');
    
    return [...games].sort((a, b) => {
      let aValue, bValue;
      
      switch (field) {
        case 'name':
          aValue = getGameName(a).toLowerCase();
          bValue = getGameName(b).toLowerCase();
          break;
        case 'rating':
          aValue = parseFloat(getGameStats(a).rating) || 0;
          bValue = parseFloat(getGameStats(b).rating) || 0;
          break;
        case 'weight':
          aValue = parseFloat(getGameStats(a).weight) || 0;
          bValue = parseFloat(getGameStats(b).weight) || 0;
          break;
        default:
          return 0;
      }
      
      if (direction === 'asc') {
        if (typeof aValue === 'string') {
          return aValue.localeCompare(bValue);
        }
        return aValue - bValue;
      } else {
        if (typeof aValue === 'string') {
          return bValue.localeCompare(aValue);
        }
        return bValue - aValue;
      }
    });
  };

  // Apply sorting to filtered games
  const sortedAndFilteredGames = sortGames(filteredGames);

  // Get unique best player counts for dropdown
  const getBestPlayerCounts = () => {
    const counts = games.map(game => getGameStats(game).bestPlayerCount)
      .filter(count => count !== 'N/A')
      .sort((a, b) => {
        // Handle special cases like "2+" 
        const aNum = parseInt(a);
        const bNum = parseInt(b);
        if (isNaN(aNum) && isNaN(bNum)) return a.localeCompare(b);
        if (isNaN(aNum)) return 1;
        if (isNaN(bNum)) return -1;
        return aNum - bNum;
      });
    return [...new Set(counts)];
  };

  if (error && !username) {
    // Only show full error screen if there's no username to edit
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-left">
          <h1>My BGG Collection</h1>
        </div>
        
        <div className="header-right">
          <button onClick={toggleDarkTheme} className="theme-toggle" title={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'}>
            {darkTheme ? '☀️' : '🌙'}
          </button>
        </div>
        
        <div className="username-section">
          <label>BGG Username:</label>
          {isEditingUsername ? (
            <div className="username-edit">
              <input
                type="text"
                value={tempUsername}
                onChange={(e) => setTempUsername(e.target.value)}
                onKeyDown={handleUsernameKeyPress}
                placeholder="Enter BGG username"
                className="username-input"
                autoFocus
              />
              <button onClick={handleUsernameSave} className="username-save">✓</button>
              <button onClick={handleUsernameCancel} className="username-cancel">✕</button>
            </div>
          ) : (
            <div className="username-display">
              <span className="username-text">{username || 'No username set'}</span>
              <button onClick={handleUsernameEdit} className="username-edit-btn">✏️</button>
            </div>
          )}
        </div>

        <div className="header-info">
          <p>
            {loading ? 'Loading...' : `${sortedAndFilteredGames.length} of ${games.length} games`}
          </p>
          <div className="refresh-section">
            <button 
              onClick={manualRefresh} 
              disabled={refreshing || !username || loading}
              className="refresh-button"
            >
              {refreshing ? 'Checking for new games...' : 'Check for new games'}
            </button>
            {refreshing && <span className="refreshing-badge">Refreshing...</span>}
          </div>
        </div>
      </header>

      {loading && (
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Loading collection for {username}...</p>
        </div>
      )}

      {error && username && (
        <div className="error-content">
          <div className="error-icon">⚠️</div>
          <h3>Error loading collection</h3>
          <p>{error}</p>
          <p>Please check that the username "{username}" is correct and the collection is public.</p>
          <button onClick={handleUsernameEdit} className="retry-button">
            Change Username
          </button>
        </div>
      )}

      {!loading && !error && games.length === 0 && username && (
        <div className="no-content">
          <div className="no-content-icon">📚</div>
          <h3>No games found</h3>
          <p>The collection for "{username}" appears to be empty or private.</p>
          <button onClick={handleUsernameEdit} className="retry-button">
            Change Username
          </button>
        </div>
      )}

      {!loading && !error && games.length > 0 && (
        <div className="filters-container">
          <div className="filters-header" onClick={() => setFiltersCollapsed(!filtersCollapsed)}>
            <h3>Filters</h3>
            <span className={`filters-toggle ${filtersCollapsed ? 'collapsed' : 'expanded'}`}>
              {filtersCollapsed ? '▼' : '▲'}
            </span>
          </div>
          
          {!filtersCollapsed && (
            <div className="filters-content">
              {/* Name filter on its own row */}
              <div className="name-filter-row">
            <div className="filter-group">
              <label>Search by Name</label>
              <input
                type="text"
                placeholder="Filter games by name..."
                value={filters.nameFilter}
                onChange={(e) => handleFilterChange('nameFilter', e.target.value)}
                className="name-filter-input"
              />
            </div>
          </div>
          
          {/* Other filters in grid */}
          <div className="filters-grid">
            <div className="filter-group">
              <label>Weight Range</label>
              <div className="range-inputs">
                <input
                  type="number"
                  placeholder="Min"
                  step="0.1"
                  min="1"
                  max="5"
                  value={filters.minWeight}
                  onChange={(e) => handleFilterChange('minWeight', e.target.value)}
                />
                <span>to</span>
                <input
                  type="number"
                  placeholder="Max"
                  step="0.1"
                  min="1"
                  max="5"
                  value={filters.maxWeight}
                  onChange={(e) => handleFilterChange('maxWeight', e.target.value)}
                />
              </div>
            </div>

            <div className="filter-group">
              <label>Player Count Range</label>
              <div className="range-inputs">
                <input
                  type="number"
                  placeholder="Min"
                  min="1"
                  max="10"
                  value={filters.minPlayers}
                  onChange={(e) => handleFilterChange('minPlayers', e.target.value)}
                />
                <span>to</span>
                <input
                  type="number"
                  placeholder="Max"
                  min="1"
                  max="10"
                  value={filters.maxPlayers}
                  onChange={(e) => handleFilterChange('maxPlayers', e.target.value)}
                />
              </div>
            </div>

            <div className="filter-group">
              <label>Best Player Count</label>
              <div className="range-inputs">
                <input
                  type="number"
                  placeholder="Best at"
                  min="1"
                  max="10"
                  value={filters.bestPlayerCount}
                  onChange={(e) => handleFilterChange('bestPlayerCount', e.target.value)}
                />
              </div>
            </div>

            <div className="filter-group">
              <label>
                <input
                  type="checkbox"
                  checked={filters.hideExpansions}
                  onChange={(e) => handleFilterChange('hideExpansions', e.target.checked)}
                />
                Hide Expansions
              </label>
            </div>

            <div className="filter-group">
              <label>Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="rating-desc">Rating (High to Low)</option>
                <option value="rating-asc">Rating (Low to High)</option>
                <option value="weight-desc">Weight (Heavy to Light)</option>
                <option value="weight-asc">Weight (Light to Heavy)</option>
              </select>
            </div>

            <div className="filter-actions">
              <button onClick={clearFilters} className="clear-filters-btn">
                Clear Filters
              </button>
            </div>
          </div>
            </div>
          )}
        </div>
      )}

      {!loading && !error && filteredGames.length === 0 && games.length > 0 && (
        <div className="no-results">
          <h3>No games match your filters</h3>
          <button onClick={clearFilters} className="clear-filters-btn">Clear All Filters</button>
        </div>
      )}

      {!loading && !error && filteredGames.length > 0 && (
        <div className="games-grid">
          {sortedAndFilteredGames.map((game) => {
            const stats = getGameStats(game);
            const gameId = getGameId(game);
            
            return (
              <div key={gameId} className="game-card">
                {isExpansion(game) && (
                  <div className="expansion-badge">
                    <span>📦 Expansion</span>
                  </div>
                )}
              <div className="game-thumbnail">
                {getGameImage(game) && (
                  <img 
                    src={getGameImage(game)} 
                    alt={getGameName(game)}
                    onError={(e) => {e.target.style.display = 'none'}}
                  />
                )}
              </div>
              
              <div className="game-info">
                <h3 
                  className="game-title"
                  onClick={() => openGameDetails(game)}
                >
                  {getGameName(game)}
                </h3>
                
                <div className="game-stats">
                  <div className="stat">
                    <span className="label">Rating:</span>
                    <span className="value">{stats.rating}</span>
                  </div>
                  
                  <div className="stat">
                    <span className="label">Weight:</span>
                    <span className="value">{stats.weight}</span>
                  </div>
                  
                  <div className="stat">
                    <span className="label">Players:</span>
                    <span className="value">{stats.minPlayers}-{stats.maxPlayers}</span>
                  </div>
                  
                  <div className="stat">
                    <span className="label">Best:</span>
                    <span className="value">{stats.bestPlayerCount}</span>
                  </div>
                </div>
                
                <button 
                  className="bgg-link"
                  onClick={() => openBGGPage(gameId)}
                >
                  View on BGG
                </button>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {selectedGame && (
        <div className="game-modal" onClick={closeGameDetails}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={closeGameDetails}>×</button>
            
            <div className="modal-header">
              <h2>
                {getGameName(selectedGame)}
                {isExpansion(selectedGame) && (
                  <span className="expansion-indicator"> 📦</span>
                )}
              </h2>
              <button 
                className="bgg-link primary"
                onClick={() => openBGGPage(getGameId(selectedGame))}
              >
                View on BGG
              </button>
            </div>
            
            <div className="modal-body">
              {isExpansion(selectedGame) && (
                <div className="detail-section expansion-info">
                  <h3>🔗 Expansion Information</h3>
                  <div className="expansion-details">
                    <div>This is an expansion for: <strong>{getBaseGameInfo(selectedGame)?.name || 'Base Game'}</strong></div>
                    {getBaseGameInfo(selectedGame) && (
                      <button 
                        className="base-game-link"
                        onClick={() => openBGGPage(getBaseGameInfo(selectedGame).id)}
                      >
                        View Base Game on BGG
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              <div className="game-image">
                {getGameImage(selectedGame) && (
                  <img 
                    src={getGameImage(selectedGame)} 
                    alt={getGameName(selectedGame)}
                  />
                )}
              </div>
              
              <div className="game-details">
                <div className="detail-section">
                  <h3>Game Statistics</h3>
                  <div className="stats-grid">
                    <div>Rating: {getGameStats(selectedGame).rating}</div>
                    <div>Weight: {getGameStats(selectedGame).weight}</div>
                    <div>Players: {getGameStats(selectedGame).minPlayers}-{getGameStats(selectedGame).maxPlayers}</div>
                    <div>Best Count: {getGameStats(selectedGame).bestPlayerCount}</div>
                    <div>Year: {safeGetValue(selectedGame.yearpublished)}</div>
                    <div>Playing Time: {safeGetValue(selectedGame.playingtime)} min</div>
                  </div>
                </div>
                
                {selectedGame.description && (
                  <div className="detail-section">
                    <h3>Description</h3>
                    <div 
                      className="description" 
                      dangerouslySetInnerHTML={{
                        __html: safeGetValue(selectedGame.description, '')
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
