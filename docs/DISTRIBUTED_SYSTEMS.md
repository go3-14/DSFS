# Distributed Systems Architecture Guide - VoidShare

## 1. Problem-to-Mechanism Mapping

Every distributed systems concept in VoidShare is implemented to solve a tangible engineering requirement rather than for cosmetic complexity (Section 44, 75, 88).

| Practical Engineering Problem | Distributed Systems Mechanism | Concrete Benefit in VoidShare |
| :--- | :--- | :--- |
| Large files cannot be uploaded or handled as monolithic payloads. | **Client-Side Chunk Partitioning** | Enables parallel streams, bounded browser memory, resumable uploads, and distributed storage. |
| Single storage disk creates bottlenecks and single points of failure. | **Multi-Node Data Placement** | Distributes storage footprint and I/O bandwidth across independent storage nodes. |
| Adding or removing storage nodes would require remapping all chunks. | **Consistent Hashing / Placement Ring** | Minimizes chunk remapping and dynamically balances storage distribution across nodes. |
| Single storage node crash causes permanent data loss for active transfers. | **Multi-Node Chunk Replication ($N=2$)** | Ensures high availability and failover retrieval even if a storage node disconnects. |
| Coordinator must know which nodes are alive before routing traffic. | **Heartbeat & Health Monitoring** | Automatically detects unreachable nodes and reroutes traffic to active replicas. |
| Node failures permanently reduce cluster chunk redundancy over time. | **Automated Re-Replication Recovery** | Detects under-replicated chunks and copies them to healthy nodes to restore target redundancy. |
| Simultaneous user downloads, expiration sweeps, and replication create races. | **Atomic State Transitions & Concurrency Locks** | Prevents metadata corruption, partial reads, and double-deletion anomalies. |
| Temporary transfers must be thoroughly purged from all locations upon TTL. | **Distributed Expiration Sweeper** | Cascades delete RPCs to all replica nodes and removes metadata to reclaim physical storage. |

---

## 2. Storage Node Abstraction Layer

Storage nodes operate as decoupled, modular micro-services or containers. The application communicates with storage nodes exclusively through a well-defined RPC/HTTP interface:

```
┌─────────────────────────────────────────────────────────────┐
│                      API Controller                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                      Storage Node Interface
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
   ┌─────────────────┐┌─────────────────┐┌─────────────────┐
   │  putChunk(...)  ││  getChunk(...)  ││ deleteChunk(...)│
   │  hasChunk(...)  ││ healthCheck()   ││                │
   └─────────────────┘└─────────────────┘└─────────────────┘
            │                  │                  │
   ┌────────┴────────┐┌────────┴────────┐┌────────┴────────┐
   │ Docker Volume 1 ││ Docker Volume 2 ││ Dedicated VPS   │
   │ (Local Dev)     ││ (Local Dev)     ││ (Production)    │
   └─────────────────┘└─────────────────┘└─────────────────┘
```

### Storage Node Interface Definition
1. `put_chunk(chunk_id: string, stream: ReadableStream, size: number) -> Promise<void>`
   - Writes the encrypted binary chunk stream to the node's underlying storage media.
   - Computes and verifies the SHA-256 hash before committing the chunk.
2. `get_chunk(chunk_id: string) -> Promise<ReadableStream>`
   - Returns a readable byte stream of the requested encrypted chunk.
   - Throws `CHUNK_NOT_FOUND` if the chunk does not exist on this node.
3. `delete_chunk(chunk_id: string) -> Promise<void>`
   - Idempotently deletes the chunk file from disk and frees allocated storage space.
4. `has_chunk(chunk_id: string) -> Promise<boolean>`
   - Fast filesystem check verifying whether the chunk exists and is non-empty.
5. `health_check() -> Promise<NodeHealthInfo>`
   - Returns node availability, disk capacity (total/free), and active operation counters.

---

## 3. Data Placement & Consistent Hashing

### 3.1 Consistent Hash Ring
To distribute chunks without centralized bottlenecks:
1. Each storage node is assigned $V$ virtual nodes on a $2^{32}-1$ integer ring based on `hash(node_id + "#" + v_index)`.
2. For any chunk $C_i$, the primary node is found by hashing `hash(file_id + "_" + chunk_index)` and walking clockwise to the first node.
3. The replica node is assigned to the next distinct physical node on the ring.

```
                  [0 / 2^32]
                 Node 1 (v1)
              .-'     |     '-.
          .-'         |         '-.
     Node 3 (v2)      |         Node 2 (v1)
        /             |             \
       |   Chunk X ───┼─► Node 1     |
       |   Chunk Y ───┼─► Node 2     |
        \             |             /
     Node 2 (v2)      |         Node 3 (v1)
          '-.         |         .-'
              '-.     |     .-'
                 Node 1 (v2)
```

---

## 4. Heartbeat Protocol & Failure Detection

### 4.1 State Definitions
- `HEALTHY`: Node is actively responding to heartbeats within the standard interval ($\le 10\text{s}$). Selected for uploads and downloads.
- `UNHEALTHY`: Node missed 2 consecutive heartbeats ($>20\text{s}$). Node Manager suspends assigning new chunk writes to this node.
- `UNAVAILABLE`: Node missed 5 consecutive heartbeats ($>50\text{s}$). Node is considered offline; download requests automatically failover to secondary replicas.
- `RECOVERING`: Node reconnected. Undergoes local catalog reconciliation before re-entering `HEALTHY` pool.

---

## 5. Recovery & Under-Replication Rebalancing

When a storage node enters `UNAVAILABLE` status:
1. The **Recovery Worker** queries the database for all active chunks mapped to the failed node.
2. For each affected chunk, it locates an active replica on a healthy node.
3. It dispatches a background copy command: `Stream(Chunk from Healthy Replica) → Write(New Replica Node)`.
4. The database metadata is updated to record the new node replica location once confirmed.

---

## 6. Local Multi-Node Simulation vs Production Architecture

```
[ LOCAL DEVELOPMENT SIMULATION ]
Single Machine / Host
├── Node Manager / API (Port 8080)
├── SQLite / PostgreSQL Metadata Database
├── Storage Container 1 (Port 9001 / Mount: ./data/node-1)
├── Storage Container 2 (Port 9002 / Mount: ./data/node-2)
└── Storage Container 3 (Port 9003 / Mount: ./data/node-3)

[ PRODUCTION MULTI-NODE CLUSTER ]
                     Internet (Clients)
                             │
                     [ Load Balancer ]
                      │             │
               ┌──────▼──────┐ ┌────▼────────┐
               │ API Node 1  │ │ API Node 2  │
               └──────┬──────┘ └────┬────────┘
                      │             │
                [ Metadata DB Cluster ]
                      │
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
[ Storage VM 1 ] [ Storage VM 2 ] [ Storage VM 3 ]
(Isolated Host)  (Isolated Host)  (Isolated Host)
```
