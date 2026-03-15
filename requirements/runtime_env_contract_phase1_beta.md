# Matrix Manager Phase 1 Beta Runtime Environment Contract

## Purpose
Define the environment variables used by the Phase 1 beta runtime scaffolding.

## Installer-Owned Variables
These are expected to be written by the installer into `.env`.

| Variable | Required | Modes | Description |
| --- | --- | --- | --- |
| `MATRIX_INSTALL_MODE` | yes | sqlite, postgresql | Installer-selected deployment mode. |
| `MATRIX_ACTIVE_DB_TYPE` | yes | sqlite, postgresql | Initial active application DB type. |
| `MATRIX_AUTH_USERNAME` | yes | all | Initial login username. |
| `MATRIX_AUTH_PASSWORD` | yes | all | Initial login password. |
| `MATRIX_AUTH_SECRET` | yes | all | Session signing secret. |
| `MATRIX_APP_PORT` | yes | all | External host port published by Compose. |
| `MATRIX_BASE_URL` | no | all | Optional base URL / hostname hint for later docs or app use. |
| `MATRIX_SQLITE_PATH` | yes | sqlite | SQLite database file path. |
| `MATRIX_CONTROL_DB_PATH` | yes | all | Path to the local control database. |
| `POSTGRES_HOST` | yes | postgresql | PostgreSQL hostname used by the app container. |
| `POSTGRES_PORT` | yes | postgresql | PostgreSQL port. |
| `POSTGRES_DB` | yes | postgresql | PostgreSQL database name. |
| `POSTGRES_USER` | yes | postgresql | PostgreSQL username. |
| `POSTGRES_PASSWORD` | yes | postgresql | PostgreSQL password. |
| `POSTGRES_SSLMODE` | yes | postgresql | PostgreSQL SSL mode. |

## Defaults / Intended Values
- `MATRIX_INSTALL_MODE=sqlite` for quick-start installs
- `MATRIX_ACTIVE_DB_TYPE` should match the install mode for the default path
- `POSTGRES_HOST=postgres` in bundled Compose mode
- `POSTGRES_PORT=5432`
- `POSTGRES_SSLMODE=prefer`

## Notes
1. End users should not need to hand-edit these values during the default install path.
2. The app currently uses these variables at startup to bootstrap the initial active database connection.
3. The local control DB remains separate from the active app data backend.
