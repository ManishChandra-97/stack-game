# STACK

STACK is a local, single-player probability-and-risk score game: grow a stack of 100 points, read imperfect signals, and decide when to bank. It has no accounts, payments, gambling, advertising, crypto, multiplayer, or external APIs.

## Run locally

Requires Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Other commands: `npm test`, `npm run simulate`, and `npm start`.

## Architecture

The vanilla browser UI renders API responses only. Express owns validation and state transitions; the pure game engine creates states/signals/outcomes; SQLite persists runs and rounds. Random mode uses a server crypto seed. Daily mode builds a deterministic 60-round deck from `stack-daily-v1:YYYY-MM-DD`.

The engine uses five hidden market states, correlated but noisy signal meters, SAFE/PUSH/YOLO reward formulas, compounding integer scores, a 20-point bust threshold, and a 9,999,999 cap. The backend never returns probabilities, losses, hidden states, rolls, or seeds to an active browser run.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/run/start` | Start random or daily run |
| `POST /api/run/:id/choice` | Resolve SAFE, PUSH, or YOLO |
| `POST /api/run/:id/continue` | Create/advance to next round |
| `POST /api/run/:id/bank` | Bank after a success |
| `GET /api/run/:id` | Restore a run |
| `GET /api/stats`, `GET /api/daily` | Local aggregate stats and daily metadata |

This local V1 uses validation, parameterized SQLite queries, Helmet, request limits, and server-authoritative scoring. It is not unhackable and has no user authentication.

## Screenshots

Screenshot placeholders — add screenshots after running the app locally.
