import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function EventModal({ 
  event, 
  onClose, 
  onRemoveGame,
  isCreator 
}) {
  const [copied, setCopied] = useState(false);
  
  if (!event) return null;

  const shareUrl = `${window.location.origin}/event/${event.id}`;
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const scores = event.scores || [];
  const voterCount = event.voterCount || Object.keys(event.votes || {}).length;

  return (
    <div className="event-modal-overlay" onClick={onClose}>
      <div className="event-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="event-modal-close" onClick={onClose}>×</button>
        
        <div className="event-modal-header">
          <h2>{event.name}</h2>
          <span className="event-modal-date">
            Created {new Date(event.createdAt).toLocaleDateString()}
          </span>
        </div>

        <div className="event-modal-body">
          {/* Share Section */}
          <div className="event-share-section">
            <h3>Share with Friends</h3>
            <p className="event-share-hint">
              Share this link so others can vote on their favorite games
            </p>
            
            <div className="event-share-row">
              <div className="event-qr-code">
                <QRCodeSVG 
                  value={shareUrl} 
                  size={120}
                  level="M"
                  includeMargin={true}
                />
              </div>
              
              <div className="event-share-link">
                <input 
                  type="text" 
                  value={shareUrl} 
                  readOnly 
                  className="event-share-input"
                />
                <button 
                  className="event-share-copy"
                  onClick={handleCopyLink}
                >
                  {copied ? '✓ Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          </div>

          {/* Games Section */}
          <div className="event-games-section">
            <h3>
              Games ({event.games?.length || 0})
              {voterCount > 0 && (
                <span className="event-voter-count"> · {voterCount} vote{voterCount !== 1 ? 's' : ''}</span>
              )}
            </h3>
            
            {(!event.games || event.games.length === 0) ? (
              <p className="event-no-games">
                No games added yet. Click the + button on any game card to add it to this event.
              </p>
            ) : (
              <div className="event-games-list">
                {(scores.length > 0 ? scores : event.games.map(g => ({ ...g, gameId: g.id, score: 0 }))).map((item, index) => {
                  const game = event.games.find(g => g.id === (item.gameId || item.id)) || item;
                  const score = item.score || 0;
                  const hasVotes = voterCount > 0;
                  
                  return (
                    <div key={game.id} className="event-game-item">
                      <span className="event-game-rank">
                        {hasVotes ? `#${index + 1}` : '—'}
                      </span>
                      {game.thumbnail && (
                        <img 
                          src={game.thumbnail} 
                          alt={game.name}
                          className="event-game-thumb"
                        />
                      )}
                      <div className="event-game-info">
                        <span className="event-game-name">{game.name}</span>
                        <span className="event-game-meta">
                          {game.minPlayers}-{game.maxPlayers} players · {game.playingTime} min
                        </span>
                      </div>
                      {hasVotes && (
                        <span className="event-game-score">
                          {score} pts
                        </span>
                      )}
                      {isCreator && (
                        <button
                          className="event-game-remove"
                          onClick={() => onRemoveGame(event.id, game.id)}
                          title="Remove game"
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

          {/* Scenario Info */}
          {event.scenario && (
            <div className="event-scenario-section">
              <h3>Scenario Filters</h3>
              <div className="event-scenario-tags">
                <span className="scenario-tag">{event.scenario.players} players</span>
                <span className="scenario-tag">{event.scenario.experience}</span>
                <span className="scenario-tag">{event.scenario.duration} min</span>
                {event.scenario.mood && (
                  <span className="scenario-tag">{event.scenario.mood}</span>
                )}
                {event.scenario.cooperative !== null && (
                  <span className="scenario-tag">
                    {event.scenario.cooperative ? 'Cooperative' : 'Competitive'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventModal;

