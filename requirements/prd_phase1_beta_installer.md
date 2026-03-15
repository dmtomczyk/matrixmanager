# Matrix Manager Phase 1 Beta Installer PRD

## Document Info
- **Product:** Matrix Manager
- **Feature:** Phase 1 Beta Installer
- **Goal:** Make Matrix Manager easy to deploy for end users with minimal steps/configuration, including optional bundled PostgreSQL installation.

## 1. Problem Statement
Matrix Manager has reached the point where ad hoc developer setup is not sufficient for beta users. Beta users need an installation experience that is:

1. easy to start
2. hard to misconfigure
3. stable enough for regular use
4. documented and supportable

The current setup assumes too much manual knowledge around runtime, database, and deployment choices.

## 2. Product Goal
Deliver a **Phase 1 beta installer** that enables an end user to install and run Matrix Manager with either:

1. **SQLite Quick Start**, or
2. **PostgreSQL Recommended**

with minimal manual intervention.

## 3. Non-Goals
For Phase 1, this work does **not** aim to deliver:

1. Kubernetes support
2. HA / clustering / failover
3. SaaS multi-tenancy
4. native desktop installers
5. full multi-user RBAC
6. advanced cloud-specific deployment automation
7. production-grade observability stack

## 4. Target Users
### 4.1 Primary Users
1. technical beta evaluators
2. small teams deploying internally
3. admins comfortable running one install command

### 4.2 Secondary Users
1. less technical users following copy-paste docs
2. homelab / small server operators
3. pilot customers evaluating hosted-vs-self-hosted fit

## 5. Supported Deployment Model
> Phase 0 implementation decisions for this PRD are frozen in `requirements/phase0_beta_installer_decisions.md`.

### PRD-001
The Phase 1 beta installer shall officially support a **Docker Compose-based deployment model**.

### PRD-002
The installer shall support two deployment modes:
1. SQLite Quick Start
2. PostgreSQL Recommended

### PRD-003
The PostgreSQL Recommended mode shall provision PostgreSQL automatically as part of installation.

### PRD-004
The installer shall use a single Compose stack to start the required runtime services.

### PRD-005
The primary tested/self-hosted target platform shall be Linux.

### PRD-006
Docker Desktop compatibility on macOS/Windows may be allowed, but Linux shall be the primary supported path.

## 6. Installation Experience
### PRD-007
The installer shall provide a **single guided install flow** with one obvious entrypoint.

### PRD-008
The installer shall require no manual database installation for the bundled PostgreSQL path.

### PRD-009
The installer shall minimize required user inputs to:
1. deployment mode
2. install path
3. bind port
4. optional hostname/base URL
5. initial admin credential setup or confirmation

### PRD-010
The installer shall generate required runtime configuration files automatically.

### PRD-011
The installer shall avoid requiring manual editing of connection strings in the default path.

### PRD-012
On success, the installer shall display:
1. app URL
2. admin username
3. admin password or setup result
4. data location
5. backup instructions or backup command

### PRD-013
On failure, the installer shall provide actionable human-readable errors.

## 7. Database Provisioning
### PRD-014
SQLite mode shall provision a working SQLite-backed install automatically.

### PRD-015
PostgreSQL mode shall provision a working PostgreSQL instance automatically.

### PRD-016
PostgreSQL mode shall configure:
1. container/service
2. database name
3. database user
4. database password
5. persistent storage

### PRD-017
The installer shall wait for PostgreSQL readiness before starting the app.

### PRD-018
The app shall initialize required schema on first run.

### PRD-019
Data shall persist across restarts and upgrades in both SQLite and PostgreSQL modes.

### PRD-020
The installer shall configure the initial active app database connection automatically.

## 8. Secrets and Security Defaults
### PRD-021
The installer shall generate a secure application/session secret automatically.

### PRD-022
The installer shall generate a secure PostgreSQL password automatically when PostgreSQL mode is selected.

### PRD-023
The installer shall persist generated secrets in a local config file with restricted permissions where possible.

### PRD-024
The installer shall not hardcode secrets in shipped source files.

### PRD-025
The PostgreSQL service shall not be exposed publicly by default.

### PRD-026
Default app-to-database networking shall remain internal to the Compose network.

## 9. App Startup and Health
### PRD-027
The stack shall include a health/readiness mechanism for the Matrix Manager app.

### PRD-028
The PostgreSQL stack shall include a readiness mechanism when enabled.

### PRD-029
The installer shall validate that the app login page is reachable before declaring success.

### PRD-030
The installer shall expose a simple post-install status command or documented equivalent.

## 10. Upgrade and Lifecycle Management
### PRD-031
Phase 1 shall define a supported upgrade path.

### PRD-032
Upgrades shall preserve:
1. config
2. secrets
3. database data
4. persistent volumes/files

### PRD-033
Upgrades shall not require reinstalling from scratch.

### PRD-034
If schema changes are introduced, migration execution shall be part of upgrade flow.

### PRD-035
Release artifacts shall be versioned.

## 11. Backup and Restore
### PRD-036
Phase 1 shall include documented backup procedures.

### PRD-037
SQLite installs shall support simple file-based backup.

### PRD-038
PostgreSQL installs shall support logical backup, such as `pg_dump`.

### PRD-039
The installer output shall direct the user to backup steps.

### PRD-040
Restore procedures shall be documented, even if not automated.

## 12. Operational Simplicity
### PRD-041
The deployment shall support simple documented commands for:
1. start
2. stop
3. restart
4. status
5. logs

### PRD-042
The installed stack shall restart cleanly after host reboot.

### PRD-043
Logs shall be accessible through a documented simple command.

### PRD-044
The installed stack shall be restartable without rerunning the installer.

## 13. Product Stability Requirements
### PRD-045
The application shall boot successfully in both SQLite and PostgreSQL installer modes.

### PRD-046
The login flow shall function immediately after installation.

### PRD-047
After a fresh install, the following workflows shall succeed:
1. create organization
2. create employee
3. create project
4. create assignment
5. view audit page

### PRD-048
The DB Management page shall remain an admin-only advanced feature and shall not be required for initial install success.

### PRD-049
If PostgreSQL mode is selected, the application shall start already configured to use the provisioned PostgreSQL backend.

## 14. Documentation
### PRD-050
Phase 1 shall include a Quick Start guide.

### PRD-051
Phase 1 shall include a PostgreSQL install guide.

### PRD-052
Phase 1 shall include an upgrade guide.

### PRD-053
Phase 1 shall include a backup/restore guide.

### PRD-054
Phase 1 shall include a troubleshooting guide for common install failures.

### PRD-055
Documentation shall describe only supported installation paths.

## 15. Testing and Release Validation
### PRD-056
The SQLite install flow shall be tested end-to-end.

### PRD-057
The PostgreSQL install flow shall be tested end-to-end.

### PRD-058
Release validation shall include smoke tests confirming:
1. app boots
2. login page reachable
3. selected DB reachable
4. basic CRUD works
5. data persists across restart

### PRD-059
Release validation shall include at least one clean-environment install test.

## 16. Success Metrics
A Phase 1 beta installer is successful if:

### PRD-060
A user can complete installation with one primary install flow.

### PRD-061
A user can choose SQLite or PostgreSQL during installation.

### PRD-062
If PostgreSQL is chosen, PostgreSQL is provisioned/configured automatically.

### PRD-063
A user can reach the login page immediately after install.

### PRD-064
A user can sign in and use core app functionality without manual DB setup.

### PRD-065
A user can restart or upgrade the deployment without losing data.
