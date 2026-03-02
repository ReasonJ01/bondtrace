# Bondtrace - API Demo Recorder & Timeline Player

A local-first tool that records Postman collection runs via Newman and turns them into curated, sequential demo playback.

## Quick Start
https://bondtrace.reason.place/

Test it out with the sample files in /samples

### One-time setup

```bash
git clone <repo>
cd bondtrace
npm install
npm run build
```

### Recording a tape

From the repo root:

```bash
npm run record -- path/to/collection.json -e path/to/environment.json -o tape.json
```

With a specific folder:

```bash
npm run record -- collection.json -e env.json -f "Demo Flow" -o tape.json
```

### Playing

```bash
npm run play
```

Open http://localhost:5173 and load your `tape.json`. Optionally load a `story.json` or continue with the default story.

For help:

```bash
node recorder/dist/index.js --help
```

## Documentation

- [Recorder Guide](docs/recorder-guide.md) - Recording setup, Postman environment tips
- [Player Guide](docs/player-guide.md) - Running the player locally, loading tapes and stories

## Project Structure

- **recorder/** - Newman-based CLI that produces tape.json
- **player/** - Local web app for curation and playback
- **samples/** - Sample tape and story for testing

## Features

- **Recording**: Full request/response capture via Newman
- **Timeline**: Sequential step navigation with hide/show
- **Persistent State**: JSONPath-based values across steps
- **Templating**: `{{response.body.id}}` style interpolation
- **Curation**: Rename steps, persistent fields
- **Keyboard**: Arrow keys for navigation
