# Project Changelog - VoidShare

All notable changes to the VoidShare project will be documented in this file.

---

## [0.2.0] - 2026-09-08
### Added
- Comprehensive update of all foundational project documentation based on the Master Project Context specification:
  - `docs/PRD.md`: Vision, problem statement, user workflows, scope, and non-goals.
  - `docs/REQUIREMENTS.md`: Confirmed functional & non-functional requirements, constraints, and operational modes.
  - `docs/ARCHITECTURE.md`: Five-layer system model, topology, sequence flows, component responsibilities, and distributed mechanics.
  - `docs/TRD.md`: Cryptographic specifications (AES-GCM 256-bit), chunking protocols, storage abstraction contract, heartbeat intervals, and error protocols.
  - `docs/SECURITY.md`: Zero-knowledge threat model, capability-based access control, honest security claims, and logging privacy guardrails.
  - `docs/DATABASE.md`: Schema definitions (`transfers`, `chunks`, `storage_nodes`, `chunk_replicas`), indexes, and atomic CAS SQL queries.
  - `docs/API.md`: Complete REST endpoints, binary chunk streaming contracts, JSON payloads, and error codes.
  - `docs/DECISIONS.md`: Approved Architecture Decision Records (ADR-001 through ADR-007).
  - `docs/ROADMAP.md`: Phased development roadmap prioritizing correctness, security, ephemeral lifecycle, and fault tolerance.
  - `docs/RISKS.md`: Comprehensive risk log covering distributed systems, cryptographic, operational, and engineering risks.
  - `docs/DISTRIBUTED_SYSTEMS.md`: Dedicated guide detailing problem-to-mechanism mapping, consistent hashing, heartbeats, replication, and node interfaces.
  - `docs/LIFECYCLE.md`: Detailed transfer state machine, lifecycle stages, and race condition mitigations.

## [0.1.0] - 2026-09-08
### Added
- Initialized VoidShare project documentation foundation and AI development protocol.
