# Matrix Manager Phase 1 Beta Installer Plan

## Goal
Turn the Phase 1 beta installer PRD into an executable delivery plan with clear priorities and sequencing.

## Priority Levels
- **P0** — must have before beta
- **P1** — strongly recommended before beta release
- **P2** — can land after beta starts if needed

## Phase 0 — Decision Lock / Beta Scope Freeze
**Priority:** P0

### Objective
Decide the exact supported beta deployment path before implementation expands in multiple directions.

### Deliverables
1. Choose Docker Compose as the sole official Phase 1 installer path.
2. Define the supported OS baseline.
3. Define exact installer inputs.
4. Define release artifact format.
5. Define app container and PostgreSQL container strategy.

### Exit Criteria
- Supported deployment model is frozen.
- Install modes are frozen.
- Team agrees on what Phase 1 explicitly does not support.

### Status
**Accepted / frozen** via:
- `requirements/phase0_beta_installer_decisions.md`
- `requirements/phase0_p0_delivery_checklist.md`

---

## Phase 1 — Make Runtime Deployable
**Priority:** P0

### Objective
Make the current app reliably runnable as a packaged service.

### Work Items
1. Create application Dockerfile.
2. Create Compose stack for app-only SQLite mode.
3. Create Compose stack/profile for app + PostgreSQL mode.
4. Add healthchecks.
5. Ensure app startup waits cleanly on DB readiness.
6. Verify persistent volume/file paths.
7. Pin runtime dependencies fully.

### Exit Criteria
- App runs cleanly in containerized SQLite mode.
- App runs cleanly in bundled PostgreSQL mode.
- Persistent data survives restart in both modes.

---

## Phase 2 — Installer Skeleton
**Priority:** P0

### Objective
Provide one obvious install command that writes config and launches the stack.

### Work Items
1. Create `install.sh`.
2. Prompt for:
   - SQLite vs PostgreSQL
   - install path
   - app port
   - optional hostname
   - admin password or auto-generated credential
3. Generate `.env`.
4. Select or generate the appropriate Compose config.
5. Launch the stack.
6. Print success summary.

### Exit Criteria
- Fresh user can install from one script.
- No manual env editing is required for the default path.

---

## Phase 3 — Bundled PostgreSQL Provisioning
**Priority:** P0

### Objective
Make PostgreSQL installer choice genuinely zero-manual-setup.

### Work Items
1. Add PostgreSQL service definition.
2. Generate DB/user/password automatically.
3. Add readiness healthcheck.
4. Configure app connection automatically.
5. Initialize schema on first run.
6. Validate persistence across restart.

### Exit Criteria
- Choosing PostgreSQL results in a working app without manual DB setup.
- App starts already configured to use the provisioned PostgreSQL backend.

---

## Phase 4 — Operational Commands + Supportability
**Priority:** P1

### Objective
Make deployed instances maintainable by normal admins.

### Work Items
1. Document start/stop/restart/status/logs commands.
2. Add wrapper scripts if needed:
   - `mm-start`
   - `mm-stop`
   - `mm-status`
   - `mm-logs`
3. Define deployment directory layout.
4. Document where config and data live.
5. Ensure reboot-safe restart behavior.

### Exit Criteria
- Admins can operate the install without remembering Compose internals.

---

## Phase 5 — Backup / Restore Baseline
**Priority:** P1

### Objective
Provide a survivable failure story for beta users.

### Work Items
1. Define SQLite backup command.
2. Define PostgreSQL backup command.
3. Document restore steps.
4. Optionally add helper scripts:
   - `mm-backup`
   - `mm-restore` (or documentation-only initially)
5. Verify backed-up data restores successfully.

### Exit Criteria
- Both modes have documented backup/restore procedures.
- At least one successful restore has been verified.

---

## Phase 6 — Upgrade Path
**Priority:** P1

### Objective
Make releases installable beyond the first install.

### Work Items
1. Define release versioning.
2. Create `upgrade.sh`.
3. Preserve `.env` and volumes.
4. Run schema migrations automatically.
5. Document rollback basics.

### Exit Criteria
- User can move from beta build N to N+1 without reinstalling.

---

## Phase 7 — Release Validation / Smoke Tests
**Priority:** P1

### Objective
Prove the installer works under repeatable conditions.

### Work Items
1. Automated SQLite install smoke test.
2. Automated PostgreSQL install smoke test.
3. Smoke test post-install login.
4. Smoke test basic CRUD.
5. Smoke test restart persistence.
6. Clean-machine or clean-VM manual validation checklist.

### Exit Criteria
- Both install modes pass repeatable validation before release.

---

## Phase 8 — Beta Docs
**Priority:** P1

### Objective
Reduce support burden and make beta usage self-service.

### Work Items
1. Quick Start doc.
2. PostgreSQL install doc.
3. Upgrade doc.
4. Backup/restore doc.
5. Troubleshooting doc.
6. FAQ: SQLite vs PostgreSQL.

### Exit Criteria
- A new beta user can succeed with docs alone.

---

## Phase 9 — Nice-to-Have Hardening
**Priority:** P2

### Objective
Improve polish after the core path works.

### Work Items
1. Add “test connection” to DB Management.
2. Improve generated admin password display/copy UX.
3. Add better startup diagnostics.
4. Add optional hostname/reverse proxy templates.
5. Add optional automatic backups.
6. Improve secret handling ergonomics.

### Exit Criteria
- Quality-of-life improves, but beta does not depend on these features.

---

## Priority Summary

### P0 — Must Have Before Beta
1. Deployment model freeze.
2. Dockerfile + Compose.
3. SQLite mode works.
4. Bundled PostgreSQL mode works.
5. Guided installer script.
6. Startup health checks.
7. Auto-generated config and secrets.
8. App reachable after install.

### P1 — Strongly Recommended Before Beta Release
1. Operational commands/docs.
2. Backup/restore.
3. Upgrade path.
4. Install smoke tests.
5. Release docs.

### P2 — Can Follow Shortly After Beta Starts
1. Connection test UX.
2. Extra diagnostics and polish.
3. Reverse proxy templates.
4. Auto-backup helpers.
5. Advanced admin ergonomics.

---

## Suggested Implementation Order
1. Containerize app.
2. Bundle PostgreSQL in Compose.
3. Prove both modes boot.
4. Write installer script.
5. Add healthchecks and readiness.
6. Add backup commands/docs.
7. Add upgrade path.
8. Automate smoke tests.
9. Polish docs and installer UX.

## Recommended Next Artifact
The best next implementation artifact is a concrete file-level delivery plan covering:

1. `Dockerfile`
2. `docker-compose.yml`
3. `.env.example`
4. `install.sh`
5. `upgrade.sh`
6. backup helper scripts
7. smoke test entrypoints
