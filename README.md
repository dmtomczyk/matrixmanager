# MatrixManager

MatrixManager is a resource-planning and staffing web app for tracking:

- organizations
- employees and reporting lines
- projects
- time-phased assignments
- utilization / allocation over time
- audit history
- database connections and runtime configuration

The app uses **FastAPI + SQLModel** on the backend and a **vanilla HTML/CSS/JavaScript** frontend. It can run against **SQLite by default** and also supports **PostgreSQL**.

## What the current app includes

The repository currently includes these major capabilities:

- **Authentication** via login page and signed session cookie
- **Organizations** CRUD
- **Employees** CRUD, including manager relationships and capacity
- **Projects** CRUD with optional dates and descriptions
- **Assignments** CRUD with time windows, allocation, and notes
- **Planning views** for staffing and schedule visibility
- **Canvas view** for spatial/project-centered staffing workflows
- **Project dashboard** page
- **Audit log** UI and backend tracking
- **Database management** UI for managing and activating DB connection profiles
- **SQLite + PostgreSQL support**
- **OpenAPI docs** at `/docs`
- **pytest + Playwright coverage**
- **Reset and seed scripts** for local development
- **Docker / docker-compose** runtime support

## Tech stack

- **Backend:** Python, FastAPI, SQLModel
- **Database:** SQLite by default, PostgreSQL optional
- **Frontend:** static HTML, CSS, vanilla JavaScript
- **Tests:** pytest, Playwright
- **Containerization:** Docker, docker-compose

## Repository layout

```text
matrixmanager/
├── app/
│   ├── main.py                  # FastAPI app, models, auth, routes
│   └── static/                  # Frontend pages, styles, and JS
├── e2e/                         # Playwright end-to-end tests
├── requirements/                # PRD / test-plan / coverage docs
├── scripts/                     # reset + seed helpers
├── tests/                       # pytest suite
├── .env.example                 # runtime configuration template
├── Dockerfile
├── docker-compose.yml
├── package.json
├── playwright.config.js
├── pytest.ini
├── requirements.txt
└── README.md
```

## Main UI routes

Once the app is running and you are authenticated, the repo currently exposes these primary pages:

- `/` — app entry / root
- `/planning` — planning view
- `/employees` — employee roster and hierarchy management
- `/assignments` — assignment management and export flows
- `/organizations` — organization management
- `/canvas` — visual staffing canvas
- `/audit` — change history and audit trail
- `/db-management` — database connection management
- `/project-dashboard` — project-centric dashboard
- `/login` — sign-in page
- `/docs` — FastAPI OpenAPI docs

> Note: exact navigation behavior may depend on auth state and the active frontend shell.

## Quick start (local dev)

### 1) Create a virtual environment and install Python deps

```bash
cd matrixmanager
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2) Configure environment

Start from `.env.example` or export env vars manually.

Example minimal local setup:

```bash
export MATRIX_INSTALL_MODE=sqlite
export MATRIX_ACTIVE_DB_TYPE=sqlite
export MATRIX_AUTH_USERNAME=admin
export MATRIX_AUTH_PASSWORD='change-me-now'
export MATRIX_AUTH_SECRET='replace-with-a-long-random-secret'
export MATRIX_APP_PORT=8000
export MATRIX_BASE_URL='http://127.0.0.1:8000'
```

If you want file locations to match the deployment-style layout, you can also set:

```bash
export MATRIX_SQLITE_PATH="$PWD/matrix.db"
export MATRIX_CONTROL_DB_PATH="$PWD/matrixmanager_control.db"
```

### 3) Run the app

```bash
uvicorn app.main:app --reload
```

Open:

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/docs`

If auth is enabled, page requests will redirect to `/login` until you sign in.

## Environment variables

The current `.env.example` defines these key settings:

### App/auth/runtime

- `MATRIX_INSTALL_MODE` — `sqlite` or `postgresql`
- `MATRIX_ACTIVE_DB_TYPE` — active runtime DB type
- `MATRIX_AUTH_USERNAME`
- `MATRIX_AUTH_PASSWORD`
- `MATRIX_AUTH_SECRET`
- `MATRIX_APP_PORT`
- `MATRIX_BASE_URL`

### SQLite mode

- `MATRIX_SQLITE_PATH`
- `MATRIX_CONTROL_DB_PATH`

### PostgreSQL mode

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_SSLMODE`

## Database modes

### SQLite

SQLite is the default and simplest way to run the app locally.

Typical local flow:

```bash
cd matrixmanager
source .venv/bin/activate
uvicorn app.main:app --reload
```

### PostgreSQL

PostgreSQL is supported via runtime configuration and the included compose file.
The app can also manage DB connection profiles from the UI via `/db-management`.

## Docker / docker-compose

A container workflow is already included.

### Run app with SQLite-backed volumes

```bash
cd matrixmanager
docker compose up --build
```

This uses:

- `.env`
- app container on `${MATRIX_APP_PORT:-8000}`
- mounted data directories:
  - `./data/sqlite:/data/sqlite`
  - `./data/app:/data/app`

### Run with PostgreSQL profile enabled

```bash
cd matrixmanager
docker compose --profile postgres up --build
```

The compose setup also includes:

- app healthcheck on `/health`
- optional PostgreSQL service with persistent volume

## API overview

FastAPI exposes interactive API docs at:

- `/docs`

The README previously documented these core resource families, which still match the app’s domain model:

- `/organizations`
- `/employees`
- `/projects`
- `/assignments`
- `/schedule/employee/{id}`
- `/schedule/project/{id}`

In practice, the current backend also includes auth, audit, and DB-management related behavior surfaced through the app.

## Lifecycle scripts

For the containerized beta workflow:

```bash
cd matrixmanager
./install.sh
./start.sh
./stop.sh
./status.sh
./reset.sh
./uninstall.sh
```

- `install.sh` — guided install/bootstrap and `.env` generation
- `start.sh` — start the Compose stack with the correct profile
- `stop.sh` — stop the stack while preserving data
- `status.sh` — show Compose status plus a host-side health probe
- `reset.sh` — wipe Matrix Manager data while keeping config/scripts
- `uninstall.sh` — remove runtime, with an option to keep or delete all data

## Development scripts

### Reset the database

```bash
cd matrixmanager
python scripts/reset_db.py
# or
npm run db:reset
```

### Seed sample data

```bash
cd matrixmanager
python scripts/seed_sample_data.py
# or
npm run db:seed
```

The seeder recreates a clean sample dataset with organizations, hierarchy, projects, and assignments.

## Tests

### pytest

```bash
cd matrixmanager
source .venv/bin/activate
pytest
```

The pytest suite lives in `tests/`.

### Playwright E2E

```bash
cd matrixmanager
npm install
npx playwright install chromium
npm run test:e2e
```

Useful variants from `package.json`:

```bash
npm run test:e2e:headed
npm run test:e2e:ui
```

The E2E specs live in `e2e/`.

## Requirements and coverage tracking

The repo also includes product and QA artifacts under `requirements/`:

- `requirements.csv`
- `requirements_test_plan.csv`
- `tp_coverage_matrix.csv`
- phase planning / installer documents

These are useful if you want to understand current scope, delivery planning, and test coverage status.

## Notes for contributors

- The frontend is plain static assets under `app/static/`
- The backend entrypoint is `app/main.py`
- SQLite is easiest for local iteration
- The repo already includes both test and deployment scaffolding, so it is more than a one-file MVP at this point

## Next sensible improvements

A few likely next-step areas, based on the current repo shape:

- tighten README/API docs around auth/admin endpoints
- document `/project-dashboard` and `/db-management` more deeply
- add screenshots / workflow walkthroughs
- document production deployment and backup strategy
- describe the audit model and database switching behavior in more detail

---

If you are opening this repo fresh, the fastest path is:

1. create `.venv`
2. install `requirements.txt`
3. copy `.env.example` to `.env` and adjust credentials
4. run `uvicorn app.main:app --reload`
5. sign in and explore `/planning`, `/canvas`, `/audit`, and `/db-management`
