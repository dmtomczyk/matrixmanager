# Matrix Manager Phase 0 / P0 Delivery Checklist

## Goal
Convert the accepted Phase 0 decisions into concrete implementation-ready work items for the Phase 1 beta installer.

## Status Summary
- [x] Official deployment model chosen
- [x] Install modes chosen
- [x] Platform baseline chosen
- [x] Installer entry point chosen
- [x] Required installer inputs chosen
- [x] Release artifact format chosen
- [x] Container strategy chosen
- [x] DB provisioning strategy chosen
- [x] Scope exclusions documented
- [ ] Implementation scaffolding started

---

## P0-A — Scope Freeze
### Deliverables
- [x] Accept Docker Compose as the only official Phase 1 deployment path
- [x] Accept two install modes: SQLite Quick Start and PostgreSQL Recommended
- [x] Freeze Linux as the primary supported platform
- [x] Freeze `install.sh` as the initial installer entry point
- [x] Freeze minimal required installer inputs

### Output Artifact
- `requirements/phase0_beta_installer_decisions.md`

---

## P0-B — Release Shape Freeze
### Deliverables
- [x] Define the expected release artifact set
- [x] Define required runtime/config files
- [x] Define the Compose/service topology for SQLite and PostgreSQL modes
- [x] Define what is intentionally excluded from beta scope

### Output Artifact
- `requirements/phase0_beta_installer_decisions.md`

---

## P0-C — Implementation Handoff
### Deliverables
- [ ] Create file-level implementation plan for:
  - `Dockerfile`
  - `docker-compose.yml` or split Compose files
  - `.env.example`
  - `install.sh`
  - `upgrade.sh`
  - backup helper docs/scripts
- [ ] Define deployment directory layout
- [ ] Define environment variable contract for installer-generated config
- [ ] Define healthcheck strategy for app and PostgreSQL

### Suggested Output Artifact
- `requirements/phase1_beta_installer_file_plan.md`

---

## P0-D — Go / No-Go Gate for Phase 1 Build Work
Phase 1 implementation should start only when the following are true:

- [x] Supported deployment model is frozen
- [x] Install modes are frozen
- [x] Platform target is frozen
- [x] Installer inputs are frozen
- [x] Runtime topology is frozen
- [ ] File-level implementation plan exists
- [ ] Initial container/build scaffolding exists

---

## Immediate Next Recommended Work
1. Create a **file-level implementation plan**.
2. Build the **Dockerfile**.
3. Build the **Compose stack** for both modes.
4. Add the **installer shell scaffold**.

## Definition of Done for Phase 0 / P0
Phase 0 / P0 is fully complete when:

1. the decision record is accepted
2. the project plan references the frozen scope
3. a file-level build plan exists
4. implementation can proceed without unresolved architecture questions
