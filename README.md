# BGG Game Collection Viewer

A modern web application for viewing and filtering your BoardGameGeek collection with a beautiful dark theme.

## Features

- 🎲 **Collection Display**: View your BGG collection in an elegant grid layout
- 🌙 **Dark Theme**: Beautiful gradient dark theme with cookie-based persistence
- 🔍 **Advanced Filtering**: Filter by weight, player count, and search by name
- 📱 **Responsive Design**: Works great on desktop and mobile
- ⚡ **Smart Caching**: 30-day cache for improved performance
- 🎨 **Modern UI**: Glass-morphism design with backdrop blur effects

## Tech Stack

- **Frontend**: React, CSS3 with gradients and backdrop filters
- **Backend**: Node.js with Express
- **Caching**: File-based caching system
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

## Configuration

The application uses environment variables for configuration:
- Cache duration: 30 days (configurable via backend)
- Port: 3000 (frontend), 4000 (backend)

## Development

- Frontend runs on port 3000
- Backend runs on port 4000
- Hot reload enabled for development
- Docker volumes for cache persistence

## License

MIT License - feel free to use and modify!
