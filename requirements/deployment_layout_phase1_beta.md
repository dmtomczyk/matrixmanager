# Matrix Manager Phase 1 Beta Deployment Layout

## Purpose
Define the on-disk deployment layout for the Docker Compose-based beta installer.

## Recommended Install Directory
```text
<install-dir>/
├── .env
├── docker-compose.yml
├── release/
│   └── matrixmanager/
├── data/
│   ├── sqlite/
│   │   └── matrix.db
│   ├── app/
│   │   └── matrixmanager_control.db
│   └── backups/
└── logs/
```

## Ownership Rules
1. `.env` is installer-generated runtime configuration.
2. `release/` is replaceable by upgrade operations.
3. `data/sqlite/` is persistent application data for SQLite installs.
4. `data/app/` is persistent local control/config database storage.
5. PostgreSQL persistence is handled through a Docker named volume in Phase 1.
6. `logs/` is optional convenience storage for later lifecycle scripts.

## Replace vs Preserve
### Safe to replace during upgrade
- `release/`
- compose file templates if installer manages them carefully

### Must preserve during upgrade
- `.env`
- `data/`
- Docker named volumes

## Phase 1 Notes
- SQLite visibility on disk is intentional for ease of backup and inspection.
- PostgreSQL uses a named volume by default for simpler operational handling.
