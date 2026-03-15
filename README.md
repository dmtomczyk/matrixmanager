# Matrix Manager

A lightweight resource planning MVP that lets you keep track of employees, projects, and time-phased assignments ("Alice @ 50% on Project X for 2 weeks"). The backend is FastAPI + SQLite, and the built-in single-page UI uses vanilla JavaScript/Fetch so you can interact with the data immediately.

## Features

- **Organizations** – Define top-level groups and assign each employee to exactly one org.
- **Employees** – CRUD fields for name, role, location, organization, and available capacity (1.0 = 100%).
- **Projects** – CRUD for initiatives, including optional description + start/end dates.
- **Assignments** – Capture who is staffed on what with `start_date`, `end_date`, and allocation (in %). Editing + deletion supported.
- **Assignment graph + CSV** – Visual node graph links employees to projects, and an Export button produces a CSV with employee, project, date, and allocation columns.
- **Canvas view** – A dedicated `/canvas` page gives you a pan-able spatial canvas with per-project assignment boxes and context-menu shortcuts for creating work.
- **Timelines** – Quick schedule views per employee or per project powered by `/schedule/*` endpoints.
- **Allocation watchdog** – A Chart.js line chart overlays time-phased allocation vs. capacity (choose presets or custom ranges) and highlights >100% overloads.
- **REST API** – FastAPI automatically exposes OpenAPI docs at `/docs` for programmatic integrations.
- **Login page auth** – The entire site and API are protected behind an app login page backed by env-configured credentials and a signed session cookie.
- **DB Management** – Admins can manage SQLite and PostgreSQL connection profiles, then activate one as the live app backend from `/db-management`.
- **SQLite persistence** – Default database lives in `matrixmanager/matrix.db`, making it trivial to back up or inspect.

## Project layout

```
matrixmanager/
├── app/
│   ├── main.py          # FastAPI app + models + routes
│   └── static/          # Front-end (index.html, app.js, styles.css)
├── matrix.db            # Created on first run
├── README.md
└── requirements.txt
```

## Getting started

1. **Install dependencies** (use a virtualenv if desired):

   ```bash
   cd matrixmanager
   python3 -m venv .venv && source .venv/bin/activate  # optional but recommended
   pip install -r requirements.txt
   ```

2. **Set login credentials**:

   ```bash
   export MATRIX_AUTH_USERNAME=admin
   export MATRIX_AUTH_PASSWORD='choose-a-strong-password'
   # optional but recommended for stronger session signing
   export MATRIX_AUTH_SECRET='another-long-random-secret'
   ```

3. **Run the dev server**:

   ```bash
   uvicorn app.main:app --reload
   ```

   The app listens on `http://127.0.0.1:8000/`. Unauthenticated page requests are redirected to `/login`, where users can sign in with the configured credentials.

3. **Use the UI** – visit the root URL for the planning page, then navigate between:
   - `/` → demand/planning view (projects, timelines, allocation chart, assignment graph)
   - `/employees` → employee roster and hierarchy management
   - `/assignments` → assignment CRUD and CSV export
   - `/orgs` → organization management
   - `/canvas` → visual staffing canvas
   - `/audit` → full change history with filters/export
   - `/db-management` → admin-only database connection management and activation

For PostgreSQL connectors, install the Python dependencies from `requirements.txt` so the bundled `psycopg` driver is available.

## API cheat sheet

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET    | `/organizations` | List organizations |
| POST   | `/organizations` | Create organization |
| PUT    | `/organizations/{id}` | Update organization |
| DELETE | `/organizations/{id}` | Delete organization (must be empty) |
| GET    | `/employees` | List employees |
| POST   | `/employees` | Create employee |
| PUT    | `/employees/{id}` | Update employee |
| DELETE | `/employees/{id}` | Remove employee + its assignments |
| GET    | `/projects` | List projects |
| POST   | `/projects` | Create project |
| PUT    | `/projects/{id}` | Update project |
| DELETE | `/projects/{id}` | Remove project + its assignments |
| GET    | `/assignments` | List assignments (filter via `?employee_id` / `?project_id`) |
| POST   | `/assignments` | Create assignment |
| PUT    | `/assignments/{id}` | Update assignment |
| DELETE | `/assignments/{id}` | Delete assignment |
| GET    | `/schedule/employee/{id}` | Time-phased assignments for an employee |
| GET    | `/schedule/project/{id}` | Staffing timeline for a project |

All endpoints return JSON. The UI uses these endpoints via Fetch; you can automate against them as well.

## Running tests

Install test dependencies from `requirements.txt`, then run:

```bash
cd matrixmanager
. .venv/bin/activate  # if using the local venv
pytest
```

The suite lives in `tests/` and exercises core TP-backed API and UI-surface regressions.
It relies on the versions pinned in `requirements.txt` for FastAPI/TestClient compatibility.

## Running Playwright E2E

Install the Node dependencies and browser once:

```bash
cd matrixmanager
npm install
npx playwright install chromium
```

Then run:

```bash
npm run test:e2e
```

The E2E specs live in `e2e/` and target the highest-value browser workflows.

## TP coverage tracking

- `requirements.csv` — product requirements
- `requirements_test_plan.csv` — suggested test approaches and scenarios
- `tp_coverage_matrix.csv` — current automation status per TP

## Database reset and sample data

Reset to a fresh empty database:

```bash
cd matrixmanager
python scripts/reset_db.py
# or
npm run db:reset
```

Generate a clean sample dataset:

```bash
cd matrixmanager
python scripts/seed_sample_data.py
# or
npm run db:seed
```

The sample seeder recreates the database and loads organizations, a multi-level hierarchy, projects, and assignments.

## Next steps / ideas

- Wire the login flow into your existing identity provider.
- Export utilization snapshots (e.g., CSV or calendar feeds).
- Add scenario planning (what-if allocations, soft bookings vs. confirmed).
- Integrate with your preferred project tracking tool (Jira, Linear, etc.).

For now, this MVP gives you a clean starting point and clear separation between API + UI so you can grow it as needed.
