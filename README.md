# BGG Good Game Finder

A modern web application for viewing and filtering your BoardGameGeek collection, creating game night events, and letting friends vote on what to play.

## Features

- 🎲 **Collection Display**: View your BGG collection in an elegant grid layout
- 🌙 **Dark Theme**: Beautiful gradient dark theme with cookie-based persistence
- 🔍 **Advanced Filtering**: Filter by weight, player count, and search by name
- 🎯 **Scenario Wizard**: Answer simple questions to find the perfect game for your group
- 🎉 **Game Events**: Create shareable game night polls for friends to vote on
- 📊 **Borda Count Voting**: Fair ranking system aggregates everyone's preferences
- 📱 **Responsive Design**: Works great on desktop and mobile
- ⚡ **Smart Caching**: 30-day cache for improved performance
- 🎨 **Modern UI**: Glass-morphism design with backdrop blur effects

## Game Events

Game Events let you create lightweight, shareable polls for game nights:

1. **Create an Event**: Click "+ New Event" and give it a name
2. **Use Scenario Filters** (optional): Answer questions about player count, experience level, time available, and mood to filter your collection
3. **Add Games**: Click the + button on any game card to add it to your event
4. **Share**: Open the event to get a QR code and shareable link
5. **Vote**: Friends visit the link and drag games to rank them in order of preference
6. **Results**: See aggregated scores using Borda count voting

Events are lightweight and disposable - they auto-expire after 30 days.

## Tech Stack

- **Frontend**: React, React Router, @dnd-kit for drag-and-drop
- **Backend**: Node.js with Express
- **Caching**: File-based caching system
- **Voting**: Anonymous fingerprint-based voting with FingerprintJS
- **Deployment**: Docker with multi-stage builds
- **API**: BoardGameGeek XML API integration

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/silverflax/bgg-gg.git
   cd bgg-gg
   ```

2. Start with Docker:
   ```bash
   docker-compose up --build
   ```

3. Open your browser to `http://localhost:3000`

4. Enter your BGG username to view your collection

## Scenario Wizard

The Scenario Wizard helps filter games based on your game night context:

| Question | How it filters |
|----------|----------------|
| **Players** | Games that support the player count |
| **Experience** | Newbies (weight 1-2), Mixed (1.5-3), Enthusiasts (2.5-5) |
| **Duration** | Games within 1.5x the selected time |
| **Mood** | Thinky, Social, Chaotic, or Chill based on BGG categories |
| **Competitive/Coop** | Filters by cooperative game category |

## Configuration

The application uses environment variables for configuration:
- Cache duration: 30 days (configurable via backend)
- Event expiration: 30 days
- Port: 3000 (frontend), 4000 (backend)

## Development

- Frontend runs on port 3000
- Backend runs on port 4000
- Hot reload enabled for development
- Docker volumes for cache persistence

## API Endpoints

### Collection
- `GET /api/collection/:username` - Get user's game collection
- `GET /api/collection/:username/refresh` - Check for new games

### Events
- `POST /api/events` - Create a new event
- `GET /api/events/:id` - Get event details with scores
- `DELETE /api/events/:id` - Delete an event
- `GET /api/events/user/:username` - List user's events
- `POST /api/events/:id/games` - Add game to event
- `DELETE /api/events/:id/games/:gameId` - Remove game from event
- `POST /api/events/:id/vote` - Submit vote ranking

## License

MIT License - feel free to use and modify!
