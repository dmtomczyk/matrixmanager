# Matrix Manager Phase 0 Beta Installer Decisions

## Status
**Accepted**

## Purpose
Freeze the Phase 0 / P0 decisions for the Phase 1 beta installer so implementation can proceed without scope drift.

---

## D-001 — Official Deployment Model
**Decision:** Matrix Manager Phase 1 beta will officially support **Docker Compose** as the sole installer/deployment model.

### Rationale
- Simplest path to bundled PostgreSQL provisioning.
- Most consistent cross-machine runtime behavior.
- Easiest support story for beta.
- Best fit for one-command install and later upgrades.

### In Scope
- Docker Engine + Docker Compose plugin
- Docker Desktop compatibility where it works

### Out of Scope for Phase 1 beta
- native non-container installs
- systemd-first/manual Python installs
- Kubernetes
- multi-node deployments

---

## D-002 — Supported Install Modes
**Decision:** The installer will support exactly two install modes:

1. **SQLite Quick Start**
2. **PostgreSQL Recommended**

### Rationale
- Gives users an easy evaluation path and a more durable shared-use path.
- Prevents uncontrolled permutations during beta.

### Notes
- SQLite is acceptable for trial, evaluation, and lightweight use.
- PostgreSQL is the recommended beta deployment mode.

---

## D-003 — Supported Platform Baseline
**Decision:** The primary supported beta platform is **Linux**.

### Supported Baseline
- Ubuntu/Debian-class Linux hosts are the reference environment.
- VPS, local workstation, and small server targets are all acceptable.

### Best-Effort Only
- macOS with Docker Desktop
- Windows with Docker Desktop

### Out of Scope
- OS-specific native installers
- package-manager-specific install flows

---

## D-004 — Installer Entry Point
**Decision:** The Phase 1 beta installer entry point will be a single shell script:

- `install.sh`

### Rationale
- Lowest friction for Linux-first deployment.
- Easy to document.
- Easy to version alongside release artifacts.

### Required Behavior
- validate prerequisites
- collect minimal user input
- generate configuration
- launch the stack
- verify app readiness
- print post-install summary

---

## D-005 — Required Installer Inputs
**Decision:** The installer will ask for only the following required inputs:

1. install mode (`sqlite` or `postgresql`)
2. install path
3. app port
4. admin username/password setup strategy

### Optional Inputs
5. hostname/base URL
6. non-default app bind host if needed later

### Inputs Explicitly Excluded in the default flow
- manual DB connection string editing
- manual PostgreSQL user/database creation
- reverse proxy setup details
- advanced TLS configuration

---

## D-006 — Secrets Strategy
**Decision:** The installer will generate secrets automatically unless the user explicitly supplies them.

### Secrets/credentials to generate
- application/session secret
- PostgreSQL password when PostgreSQL mode is selected
- optional admin password if not provided interactively

### Storage
- generated values will be written to a local `.env` file in the deployment directory
- local file permissions should be restricted where possible

---

## D-007 — Release Artifact Format
**Decision:** Phase 1 beta release artifacts will include:

1. application source/release bundle
2. `Dockerfile`
3. Compose definition(s)
4. `.env.example`
5. `install.sh`
6. `upgrade.sh` (required before beta release, may land after initial scaffolding)
7. backup/restore documentation

### Notes
- Release artifacts must be versioned.
- Compose definitions must support both SQLite and PostgreSQL modes.

---

## D-008 — Container Strategy
**Decision:** The stack will use containerized services with a single Compose project.

### Services
#### SQLite mode
- `app`

#### PostgreSQL mode
- `app`
- `postgres`

### Networking
- internal Compose network by default
- PostgreSQL not exposed publicly by default
- app exposed on configured HTTP port

### Storage
#### SQLite mode
- persistent bind mount or named volume for app data

#### PostgreSQL mode
- named volume for PostgreSQL data
- persistent app config/data volume as needed

---

## D-009 — Database Provisioning Strategy
**Decision:** Bundled PostgreSQL will be provisioned automatically by Compose and configured by generated environment values.

### Required Installer Responsibilities
- generate DB name/user/password
- write env/config
- start PostgreSQL service
- wait for readiness
- start app against provisioned PostgreSQL

### Out of Scope for initial install path
- connecting to external managed PostgreSQL as the primary installer flow
- advanced HA Postgres setups

### Note
External PostgreSQL may remain an advanced/admin path later, but it is not part of the default beta installer success criteria.

---

## D-010 — Runtime Health and Success Criteria
**Decision:** Installer success requires both service startup and application reachability verification.

### The installer may only report success after:
1. containers are up
2. PostgreSQL is healthy when selected
3. app is reachable over HTTP
4. login page responds successfully

---

## D-011 — DB Management Positioning
**Decision:** The in-app DB Management page remains an **advanced admin feature**, not the primary install flow.

### Meaning
- installer configures the first/active DB automatically
- end users should not need to visit DB Management for initial success
- DB Management should not be required to complete beta installation

---

## D-012 — Phase 1 Beta Exclusions
**Decision:** The following are explicitly excluded from Phase 1 beta scope:

1. Kubernetes deployment
2. native desktop installers
3. non-Docker official deployment path
4. HA/failover
5. cloud-managed database automation
6. full RBAC / multi-user auth model
7. public production internet hardening beyond sane defaults
8. one-click TLS/reverse-proxy automation

---

## Phase 0 Exit Criteria
Phase 0 is considered complete when:

1. these decisions are accepted as the implementation baseline
2. the PRD and plan reference these decisions
3. Phase 1 work begins against this frozen scope
