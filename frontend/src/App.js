import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import EventPanel from './components/EventPanel';
import EventModal from './components/EventModal';
import ScenarioWizard from './components/ScenarioWizard';

// Scenario filter mappings
const EXPERIENCE_WEIGHT_MAP = {
  newbies: { min: 1.0, max: 2.0 },
  mixed: { min: 1.5, max: 3.0 },
  enthusiasts: { min: 2.5, max: 5.0 }
};

const MOOD_CATEGORIES = {
  thinky: ['Strategy Game', 'Economic', 'Puzzle'],
  social: ['Party Game', 'Bluffing', 'Negotiation'],
  chaotic: ['Dice', 'Take That', 'Real-time'],
  chill: ['Family Game', 'Abstract Strategy', 'Card Game']
};

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
  
  const [sortBy, setSortBy] = useState('name-asc');
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [darkTheme, setDarkTheme] = useState(false);

  // Event states
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [addToEventGameId, setAddToEventGameId] = useState(null);
  
  // Scenario states
  const [filterMode, setFilterMode] = useState('manual'); // 'manual' or 'scenario'
  const [showScenarioWizard, setShowScenarioWizard] = useState(false);
  const [currentScenario, setCurrentScenario] = useState(null);

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

  // Event token helpers - store creator tokens in localStorage
  const getEventTokens = () => {
    try {
      const tokens = localStorage.getItem('eventTokens');
      return tokens ? JSON.parse(tokens) : {};
    } catch {
      return {};
    }
  };

  const saveEventToken = (eventId, token) => {
    const tokens = getEventTokens();
    tokens[eventId] = token;
    localStorage.setItem('eventTokens', JSON.stringify(tokens));
  };

  const getEventToken = (eventId) => {
    const tokens = getEventTokens();
    return tokens[eventId] || null;
  };

  const removeEventToken = (eventId) => {
    const tokens = getEventTokens();
    delete tokens[eventId];
    localStorage.setItem('eventTokens', JSON.stringify(tokens));
  };

  // Check if we own an event (have its token)
  const isEventOwner = (eventId) => {
    return !!getEventToken(eventId);
  };

  // Fetch events for user
  const fetchEvents = useCallback(async (targetUsername) => {
    if (!targetUsername) return;
    
    setEventsLoading(true);
    try {
      const response = await fetch(`/api/events/user/${targetUsername}`);
      if (response.ok) {
        const data = await response.json();
        setEvents(data);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // Initialize username and theme from cookies
  useEffect(() => {
    const savedUsername = getCookie('bgg-username');
    if (savedUsername) {
      setUsername(savedUsername);
      setTempUsername(savedUsername);
    } else {
      setIsEditingUsername(true);
    }

    const savedTheme = getCookie('bgg-dark-theme');
    if (savedTheme === 'true') {
      setDarkTheme(true);
      document.body.classList.add('dark-theme');
    }
  }, []);

  // Load games for user function
  const loadGamesForUser = useCallback(async (targetUsername) => {
    if (!targetUsername.trim()) return;

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/collection/${targetUsername}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }
      
      const data = await response.json();
      setGames(data.games || []);
      
      // Note: checkForNewGames is called inline to avoid circular dependency
      if (data.fromCache) {
        setTimeout(async () => {
          if (!targetUsername) return;
          setRefreshing(true);
          try {
            const refreshResponse = await fetch(`/api/collection/${targetUsername}/refresh`);
            const refreshData = await refreshResponse.json();
            if (refreshData.hasNewGames && refreshData.allGames) {
              setGames(refreshData.allGames);
            }
          } catch (err) {
            console.error('Error checking for new games:', err);
          } finally {
            setRefreshing(false);
          }
        }, 1000);
      }
    } catch (err) {
      setError(err.message);
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load games and events when username changes
  useEffect(() => {
    if (username) {
      loadGamesForUser(username);
      fetchEvents(username);
    } else {
      setGames([]);
      setEvents([]);
    }
  }, [username, fetchEvents, loadGamesForUser]);

  const checkForNewGames = async (targetUsername = username) => {
    if (!targetUsername || refreshing) return;
    
    setRefreshing(true);
    try {
      const response = await fetch(`/api/collection/${targetUsername}/refresh`);
      const data = await response.json();
      
      if (data.hasNewGames && data.allGames) {
        setGames(data.allGames);
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
    setCookie('bgg-dark-theme', newTheme.toString(), 365);
    
    if (newTheme) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  };

  // Event management functions
  const handleCreateEvent = async (name) => {
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          createdBy: username, 
          name,
          scenario: currentScenario 
        })
      });
      
      if (response.ok) {
        const newEvent = await response.json();
        // Store the creator token in localStorage
        if (newEvent.creatorToken) {
          saveEventToken(newEvent.id, newEvent.creatorToken);
        }
        // Remove token from state (not needed in UI)
        const { creatorToken, ...eventWithoutToken } = newEvent;
        setEvents(prev => [eventWithoutToken, ...prev]);
        return eventWithoutToken;
      }
    } catch (err) {
      console.error('Error creating event:', err);
    }
    return null;
  };

  const handleSelectEvent = async (event) => {
    try {
      const response = await fetch(`/api/events/${event.id}`);
      if (response.ok) {
        const fullEvent = await response.json();
        setSelectedEvent(fullEvent);
        setShowEventModal(true);
      }
    } catch (err) {
      console.error('Error fetching event:', err);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    const token = getEventToken(eventId);
    if (!token) {
      alert('You do not have permission to delete this event');
      return;
    }
    
    if (!window.confirm('Delete this event?')) return;
    
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
        headers: { 'X-Creator-Token': token }
      });
      
      if (response.ok) {
        removeEventToken(eventId);
        setEvents(prev => prev.filter(e => e.id !== eventId));
        if (selectedEvent?.id === eventId) {
          setShowEventModal(false);
          setSelectedEvent(null);
        }
      } else if (response.status === 403) {
        alert('You do not have permission to delete this event');
      }
    } catch (err) {
      console.error('Error deleting event:', err);
    }
  };

  const handleAddGameToEvent = async (eventId, game) => {
    const token = getEventToken(eventId);
    if (!token) {
      alert('You do not have permission to add games to this event');
      setAddToEventGameId(null);
      return;
    }
    
    const stats = getGameStats(game);
    const gameData = {
      id: getGameId(game),
      name: getGameName(game),
      thumbnail: getGameImage(game),
      weight: parseFloat(stats.weight) || 0,
      playingTime: parseInt(safeGetValue(game.playingtime, '0')) || 0,
      minPlayers: parseInt(stats.minPlayers) || 1,
      maxPlayers: parseInt(stats.maxPlayers) || 10
    };

    try {
      const response = await fetch(`/api/events/${eventId}/games`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Creator-Token': token
        },
        body: JSON.stringify({ game: gameData })
      });
      
      if (response.ok) {
        const updatedEvent = await response.json();
        setEvents(prev => prev.map(e => e.id === eventId ? updatedEvent : e));
        if (selectedEvent?.id === eventId) {
          setSelectedEvent(updatedEvent);
        }
      } else if (response.status === 403) {
        alert('You do not have permission to add games to this event');
      }
    } catch (err) {
      console.error('Error adding game to event:', err);
    }
    
    setAddToEventGameId(null);
  };

  const handleRemoveGameFromEvent = async (eventId, gameId) => {
    const token = getEventToken(eventId);
    if (!token) {
      alert('You do not have permission to remove games from this event');
      return;
    }
    
    try {
      const response = await fetch(`/api/events/${eventId}/games/${gameId}`, {
        method: 'DELETE',
        headers: { 'X-Creator-Token': token }
      });
      
      if (response.ok) {
        const updatedEvent = await response.json();
        setEvents(prev => prev.map(e => e.id === eventId ? updatedEvent : e));
        if (selectedEvent?.id === eventId) {
          setSelectedEvent(updatedEvent);
        }
      } else if (response.status === 403) {
        alert('You do not have permission to remove games from this event');
      }
    } catch (err) {
      console.error('Error removing game from event:', err);
    }
  };

  // Scenario functions
  const handleScenarioComplete = (scenario) => {
    setCurrentScenario(scenario);
    setShowScenarioWizard(false);
    setFilterMode('scenario');
    
    // Apply scenario filters
    const weightRange = EXPERIENCE_WEIGHT_MAP[scenario.experience] || {};
    setFilters(prev => ({
      ...prev,
      minWeight: weightRange.min?.toString() || '',
      maxWeight: weightRange.max?.toString() || '',
      minPlayers: scenario.players?.toString() || '',
      maxPlayers: scenario.players?.toString() || '',
      hideExpansions: true
    }));
  };

  const clearScenario = () => {
    setCurrentScenario(null);
    setFilterMode('manual');
    clearFilters();
  };

  // Game helper functions
  const getGameStats = (game) => {
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
    if (value.$ && value.$.value !== undefined) return String(value.$.value);
    if (value._ !== undefined) return String(value._);
    return fallback;
  };

  const isExpansion = (game) => {
    if (game.$.type === 'boardgameexpansion') return true;
    
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
    
    const baseGameLink = game.link.find(link => 
      link.$.type === 'boardgameexpansion' && 
      link.$.inbound === 'true'
    );
    
    return baseGameLink ? {
      id: baseGameLink.$.id,
      name: baseGameLink.$.value
    } : null;
  };

  const getGameCategories = (game) => {
    if (!game.link || !Array.isArray(game.link)) return [];
    return game.link
      .filter(link => link.$.type === 'boardgamecategory' || link.$.type === 'boardgamemechanic')
      .map(link => link.$.value);
  };

  const matchesMood = (game, mood) => {
    if (!mood) return true;
    const categories = getGameCategories(game);
    const moodCategories = MOOD_CATEGORIES[mood] || [];
    return categories.some(cat => 
      moodCategories.some(moodCat => cat.toLowerCase().includes(moodCat.toLowerCase()))
    );
  };

  const isCooperative = (game) => {
    const categories = getGameCategories(game);
    return categories.some(cat => cat.toLowerCase().includes('cooperative'));
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

  // Filter games based on current filter settings and scenario
  const filteredGames = games.filter(game => {
    const stats = getGameStats(game);
    
    // Name filter
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
    
    // Player count filter
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

    // Scenario-based filters
    if (currentScenario) {
      // Duration filter
      if (currentScenario.duration) {
        const playingTime = parseInt(safeGetValue(game.playingtime, '0')) || 0;
        if (playingTime > currentScenario.duration * 1.5) return false;
      }
      
      // Mood filter
      if (currentScenario.mood && !matchesMood(game, currentScenario.mood)) {
        return false;
      }
      
      // Cooperative filter
      if (currentScenario.cooperative !== null) {
        const gameIsCoop = isCooperative(game);
        if (currentScenario.cooperative !== gameIsCoop) return false;
      }
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
    // Also clear scenario when clearing filters
    setCurrentScenario(null);
    setFilterMode('manual');
  };

  // Sort games
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

  const sortedAndFilteredGames = sortGames(filteredGames);

  if (error && !username) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-left">
          <h1>Good Game Finder</h1>
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

      {/* Event Panel */}
      {username && (
        <EventPanel
          events={events}
          username={username}
          onCreateEvent={handleCreateEvent}
          onSelectEvent={handleSelectEvent}
          onDeleteEvent={handleDeleteEvent}
          loading={eventsLoading}
          isEventOwner={isEventOwner}
        />
      )}

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
            <div className="filters-title">
              <h3>
                {filterMode === 'scenario' && currentScenario ? 'Scenario Filters' : 'Filters'}
              </h3>
              {currentScenario && (
                <span className="scenario-active-badge">Scenario Active</span>
              )}
              <span className={`filters-toggle ${filtersCollapsed ? 'collapsed' : 'expanded'}`}>
                {filtersCollapsed ? '▼' : '▲'}
              </span>
            </div>
          </div>
          
          {!filtersCollapsed && (
            <div className="filters-content">
              {/* Filter mode toggle */}
              <div className="filter-mode-toggle">
                <button 
                  className={`mode-btn ${filterMode === 'manual' ? 'active' : ''}`}
                  onClick={() => {
                    setFilterMode('manual');
                    setCurrentScenario(null);
                  }}
                >
                  Manual Filters
                </button>
                <button 
                  className={`mode-btn ${filterMode === 'scenario' ? 'active' : ''}`}
                  onClick={() => setShowScenarioWizard(true)}
                >
                  Scenario Wizard
                </button>
              </div>

              {/* Scenario summary */}
              {currentScenario && (
                <div className="scenario-summary">
                  <div className="scenario-tags">
                    <span className="scenario-tag">{currentScenario.players} players</span>
                    <span className="scenario-tag">{currentScenario.experience}</span>
                    <span className="scenario-tag">{currentScenario.duration} min</span>
                    {currentScenario.mood && <span className="scenario-tag">{currentScenario.mood}</span>}
                    {currentScenario.cooperative !== null && (
                      <span className="scenario-tag">
                        {currentScenario.cooperative ? 'Coop' : 'Competitive'}
                      </span>
                    )}
                  </div>
                  <button className="clear-scenario-btn" onClick={clearScenario}>
                    Clear Scenario
                  </button>
                </div>
              )}

              {/* Name filter */}
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
          
              {/* Other filters */}
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
                
                {/* Add to Event button - only show events user owns */}
                {events.filter(e => isEventOwner(e.id)).length > 0 && (
                  <div className="add-to-event-container">
                    <button 
                      className="add-to-event-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddToEventGameId(addToEventGameId === gameId ? null : gameId);
                      }}
                      title="Add to event"
                    >
                      +
                    </button>
                    
                    {addToEventGameId === gameId && (
                      <div className="add-to-event-dropdown">
                        {events.filter(e => isEventOwner(e.id)).map(event => (
                          <button
                            key={event.id}
                            className="event-option"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddGameToEvent(event.id, game);
                            }}
                          >
                            {event.name}
                          </button>
                        ))}
                      </div>
                    )}
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

      {/* Game Details Modal */}
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

      {/* Event Modal */}
      {showEventModal && selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => {
            setShowEventModal(false);
            setSelectedEvent(null);
          }}
          onRemoveGame={handleRemoveGameFromEvent}
          isCreator={isEventOwner(selectedEvent.id)}
        />
      )}

      {/* Scenario Wizard Modal */}
      {showScenarioWizard && (
        <div className="scenario-modal-overlay" onClick={() => setShowScenarioWizard(false)}>
          <div className="scenario-modal-content" onClick={(e) => e.stopPropagation()}>
            <ScenarioWizard
              onComplete={handleScenarioComplete}
              onCancel={() => setShowScenarioWizard(false)}
              initialScenario={currentScenario}
            />
          </div>
        </div>
      )}

      <footer className="app-footer">
        <a 
          href="https://boardgamegeek.com/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="powered-by-link"
        >
          <img 
            src="https://cf.geekdo-images.com/HZy35cmzmmyV9BarSuk6ug__small/img/gbE7sulIurZE_Tx8EQJXnZSKI6w=/fit-in/200x150/filters:strip_icc()/pic7779581.png" 
            alt="Powered by BoardGameGeek"
            className="powered-by-logo"
          />
        </a>
        <a 
          href="https://github.com/silverflax/bgg-gg" 
          target="_blank" 
          rel="noopener noreferrer"
          className="github-link"
          title="View source on GitHub"
        >
          <svg 
            height="24" 
            width="24" 
            viewBox="0 0 16 16" 
            fill="currentColor"
            className="github-logo"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
      </footer>
    </div>
  );
}

export default App;
