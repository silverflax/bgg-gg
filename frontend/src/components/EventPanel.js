import React, { useState } from 'react';

function EventPanel({ 
  events, 
  username, 
  onCreateEvent, 
  onSelectEvent, 
  onDeleteEvent,
  loading,
  isEventOwner 
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(true); // Collapsed by default

  const handleCreate = async () => {
    if (!newEventName.trim()) return;
    
    await onCreateEvent(newEventName.trim());
    setNewEventName('');
    setIsCreating(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleCreate();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewEventName('');
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const handleHeaderClick = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleCreateClick = (e) => {
    e.stopPropagation(); // Don't toggle collapse when clicking create button
    setIsCreating(true);
    if (isCollapsed) {
      setIsCollapsed(false); // Expand when creating
    }
  };

  if (!username) {
    return null;
  }

  return (
    <div className="event-panel">
      <div className="event-panel-header" onClick={handleHeaderClick}>
        <div className="event-panel-title">
          <h3>Game Events</h3>
          {events.length > 0 && (
            <span className="event-count-badge">{events.length}</span>
          )}
          <span className={`event-panel-toggle ${isCollapsed ? 'collapsed' : 'expanded'}`}>
            {isCollapsed ? '▼' : '▲'}
          </span>
        </div>
        {!isCreating && (
          <button 
            className="event-create-btn"
            onClick={handleCreateClick}
            title="Create new event"
          >
            + New Event
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="event-panel-content">
          {isCreating && (
            <div className="event-create-form">
              <input
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Event name (e.g., Friday Game Night)"
                autoFocus
                className="event-name-input"
              />
              <div className="event-create-actions">
                <button 
                  className="event-btn primary"
                  onClick={handleCreate}
                  disabled={!newEventName.trim() || loading}
                >
                  Create
                </button>
                <button 
                  className="event-btn secondary"
                  onClick={() => {
                    setIsCreating(false);
                    setNewEventName('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading && <div className="event-loading">Loading events...</div>}

          {!loading && events.length === 0 && !isCreating && (
            <div className="event-empty">
              <p>No active events</p>
              <p className="event-empty-hint">Create an event to start adding games and invite friends to vote!</p>
            </div>
          )}

          {!loading && events.length > 0 && (
            <div className="event-list">
              {events.map(event => {
                const canDelete = isEventOwner && isEventOwner(event.id);
                return (
                  <div 
                    key={event.id} 
                    className="event-item"
                    onClick={() => onSelectEvent(event)}
                  >
                    <div className="event-item-info">
                      <span className="event-item-name">{event.name}</span>
                      <span className="event-item-meta">
                        {event.games?.length || 0} games · {formatDate(event.createdAt)}
                      </span>
                    </div>
                    {canDelete && (
                      <button
                        className="event-item-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEvent(event.id);
                        }}
                        title="Delete event"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EventPanel;

