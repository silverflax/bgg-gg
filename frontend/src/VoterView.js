import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

function SortableGameItem({ game, index }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: game.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`voter-game-item ${isDragging ? 'dragging' : ''}`}
      {...attributes} 
      {...listeners}
    >
      <span className="voter-game-rank">{index + 1}</span>
      <div className="voter-game-drag-handle">⋮⋮</div>
      {game.thumbnail && (
        <img 
          src={game.thumbnail} 
          alt={game.name}
          className="voter-game-thumb"
        />
      )}
      <div className="voter-game-info">
        <span className="voter-game-name">{game.name}</span>
        <span className="voter-game-meta">
          {game.minPlayers}-{game.maxPlayers} players · {game.playingTime} min
        </span>
      </div>
    </div>
  );
}

function VoterView() {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fingerprint, setFingerprint] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hasExistingVote, setHasExistingVote] = useState(false);
  const [scores, setScores] = useState(null);
  const [voterCount, setVoterCount] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150, // 150ms hold before drag starts
        tolerance: 5, // 5px movement tolerance during delay
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Initialize fingerprint
  useEffect(() => {
    const initFingerprint = async () => {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        setFingerprint(result.visitorId);
      } catch (err) {
        console.error('Failed to get fingerprint:', err);
        // Fallback to random ID stored in localStorage
        let storedId = localStorage.getItem('voter_id');
        if (!storedId) {
          storedId = 'fallback_' + Math.random().toString(36).substr(2, 9);
          localStorage.setItem('voter_id', storedId);
        }
        setFingerprint(storedId);
      }
    };
    initFingerprint();
  }, []);

  // Fetch event data
  const fetchEvent = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/events/${eventId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Event not found');
        }
        throw new Error('Failed to load event');
      }
      
      const data = await response.json();
      setEvent(data);
      setScores(data.scores || null);
      setVoterCount(data.voterCount || 0);
      
      // Check if user has already voted
      if (fingerprint && data.votes && data.votes[fingerprint]) {
        setHasExistingVote(true);
        // Use their existing vote order
        const existingOrder = data.votes[fingerprint];
        const orderedGames = existingOrder
          .map(id => data.games.find(g => g.id === id))
          .filter(Boolean);
        // Add any new games that weren't in their vote
        const votedIds = new Set(existingOrder);
        const newGames = data.games.filter(g => !votedIds.has(g.id));
        setGames([...orderedGames, ...newGames]);
      } else {
        setGames(data.games || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [eventId, fingerprint]);

  useEffect(() => {
    if (fingerprint) {
      fetchEvent();
    }
  }, [fetchEvent, fingerprint]);

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setGames((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSubmitVote = async () => {
    if (!fingerprint || games.length === 0) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/events/${eventId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fingerprint,
          rankedGameIds: games.map(g => g.id),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit vote');
      }

      const result = await response.json();
      setScores(result.scores || null);
      setVoterCount(result.voterCount || 0);
      setSubmitted(true);
      setHasExistingVote(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="voter-view">
        <div className="voter-loading">
          <div className="loading-spinner"></div>
          <p>Loading event...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="voter-view">
        <div className="voter-error">
          <h2>Oops!</h2>
          <p>{error}</p>
          <Link to="/" className="voter-home-link">Go to Home</Link>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="voter-view">
        <div className="voter-error">
          <h2>Event Not Found</h2>
          <p>This event may have been deleted or the link is incorrect.</p>
          <Link to="/" className="voter-home-link">Go to Home</Link>
        </div>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="voter-view">
        <div className="voter-header">
          <h1>{event.name}</h1>
          <p className="voter-subtitle">Vote for your favorite games</p>
        </div>
        <div className="voter-no-games">
          <p>No games have been added to this event yet.</p>
          <p>Check back later!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="voter-view">
      <div className="voter-header">
        <h1>{event.name}</h1>
        <p className="voter-subtitle">
          Drag to rank games in order of preference (best at top)
        </p>
      </div>

      {submitted && (
        <div className="voter-success">
          <span className="voter-success-icon">✓</span>
          Vote submitted! You can change your ranking and submit again.
        </div>
      )}

      {hasExistingVote && !submitted && (
        <div className="voter-existing">
          You've already voted. Reorder and submit to update your vote.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={games.map(g => g.id)} strategy={verticalListSortingStrategy}>
          <div className="voter-games-list">
            {games.map((game, index) => (
              <SortableGameItem key={game.id} game={game} index={index} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="voter-actions">
        <button
          className="voter-submit-btn"
          onClick={handleSubmitVote}
          disabled={submitting || games.length === 0}
        >
          {submitting ? 'Submitting...' : hasExistingVote ? 'Update Vote' : 'Submit Vote'}
        </button>
      </div>

      {/* Show rankings if voter has voted and event allows it */}
      {event.showResultsToVoters && (hasExistingVote || submitted) && scores && scores.length > 0 && (
        <div className="voter-results">
          <h2>Current Rankings</h2>
          <p className="voter-results-meta">{voterCount} vote{voterCount !== 1 ? 's' : ''} so far</p>
          <div className="voter-results-list">
            {scores.map((item, index) => {
              const game = games.find(g => g.id === item.gameId) || { name: item.name };
              return (
                <div key={item.gameId} className="voter-result-item">
                  <span className="voter-result-rank">{index + 1}</span>
                  <span className="voter-result-name">{game.name || item.name}</span>
                  <span className="voter-result-score">{item.score} pts</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="voter-footer">
        <p>
          Powered by{' '}
          <a href="https://boardgamegeek.com" target="_blank" rel="noopener noreferrer">
            BoardGameGeek
          </a>
        </p>
      </div>
    </div>
  );
}

export default VoterView;

