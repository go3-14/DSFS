# API Specifications - VoidShare

## 1. API Architecture Principles

- **Protocol**: HTTPS / RESTful endpoints with JSON payloads for control and binary octet-streams for encrypted chunk data.
- **Capability-Based Authorization**: Access requires presenting a valid authorization token derived from the transfer secret (e.g. `X-Capability-Token` header).
- **Privacy First (No Enumeration)**: Unauthorized or invalid requests receive generic `404 Not Found` to prevent attackers from discovering if a `File ID` exists.
- **Zero Decryption Key Exposure**: Decryption keys and plaintext payloads are never accepted by any endpoint.

---

## 2. API Endpoints Overview

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/transfers` | Initialize a new transfer session & get chunk upload manifest | No |
| `PUT` | `/api/transfers/:fileId/chunks/:chunkIndex` | Upload a specific encrypted chunk payload | No (Upload Session) |
| `POST` | `/api/transfers/:fileId/finalize` | Finalize upload session and mark transfer `READY` | No (Upload Session) |
| `POST` | `/api/transfers/:fileId/access` | Authenticate capability secret & fetch chunk manifest | Yes (Secret Token) |
| `GET` | `/api/transfers/:fileId/chunks/:chunkIndex` | Download encrypted chunk stream | Yes (Secret Token) |
| `POST` | `/api/transfers/:fileId/complete` | Signal successful download and trigger deletion policy | Yes (Secret Token) |
| `POST` | `/api/nodes/heartbeat` | Internal: Storage node heartbeat ping | Internal Node Token |
| `GET` | `/api/nodes/health` | Internal: Cluster health & node status report | Internal Admin |

---

## 3. Detailed Endpoint Contracts

### 3.1 Initialize Transfer Session
`POST /api/transfers`

#### Request Body
```json
{
  "totalSizeBytes": 15728640,
  "chunkCount": 4,
  "chunkSizeBytes": 4194304,
  "capabilityHash": "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3",
  "encryptedFileName": "U2FsdGVkX1+vIbZ...",
  "ttlSeconds": 3600,
  "maxDownloads": 1
}
```

#### Response (`201 Created`)
```json
{
  "fileId": "void-9f8a-4b2c-81e0",
  "status": "CREATING",
  "expiresAt": "2026-09-08T03:30:00Z",
  "chunkUploads": [
    { "chunkIndex": 0, "uploadUrl": "/api/transfers/void-9f8a-4b2c-81e0/chunks/0" },
    { "chunkIndex": 1, "uploadUrl": "/api/transfers/void-9f8a-4b2c-81e0/chunks/1" },
    { "chunkIndex": 2, "uploadUrl": "/api/transfers/void-9f8a-4b2c-81e0/chunks/2" },
    { "chunkIndex": 3, "uploadUrl": "/api/transfers/void-9f8a-4b2c-81e0/chunks/3" }
  ]
}
```

---

### 3.2 Upload Encrypted Chunk
`PUT /api/transfers/:fileId/chunks/:chunkIndex`

#### Headers
- `Content-Type`: `application/octet-stream`
- `X-Chunk-Checksum-Sha256`: `<64-char-hex-hash>`

#### Request Body
Binary octet-stream of the encrypted chunk payload (Ciphertext + IV + Auth Tag).

#### Response (`200 OK`)
```json
{
  "chunkIndex": 0,
  "storedSizeBytes": 4194304,
  "checksumVerified": true,
  "replicationAcknowledged": 2
}
```

---

### 3.3 Finalize Transfer
`POST /api/transfers/:fileId/finalize`

#### Request Body
```json
{
  "totalChunksUploaded": 4
}
```

#### Response (`200 OK`)
```json
{
  "fileId": "void-9f8a-4b2c-81e0",
  "status": "READY",
  "expiresAt": "2026-09-08T03:30:00Z"
}
```

---

### 3.4 Authenticate & Access Transfer Manifest
`POST /api/transfers/:fileId/access`

#### Request Body
```json
{
  "capabilityHash": "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3"
}
```

#### Response (`200 OK`)
```json
{
  "fileId": "void-9f8a-4b2c-81e0",
  "status": "READY",
  "totalSizeBytes": 15728640,
  "chunkCount": 4,
  "chunkSizeBytes": 4194304,
  "encryptedFileName": "U2FsdGVkX1+vIbZ...",
  "chunks": [
    { "chunkIndex": 0, "sizeBytes": 4194304, "checksum": "e3b0c44298fc...", "downloadUrl": "/api/transfers/void-9f8a-4b2c-81e0/chunks/0" },
    { "chunkIndex": 1, "sizeBytes": 4194304, "checksum": "f1d2d2f924e9...", "downloadUrl": "/api/transfers/void-9f8a-4b2c-81e0/chunks/1" },
    { "chunkIndex": 2, "sizeBytes": 4194304, "checksum": "a6c9d07f3612...", "downloadUrl": "/api/transfers/void-9f8a-4b2c-81e0/chunks/2" },
    { "chunkIndex": 3, "sizeBytes": 3145728, "checksum": "8b1a9953c461...", "downloadUrl": "/api/transfers/void-9f8a-4b2c-81e0/chunks/3" }
  ],
  "downloadAccessToken": "eyJhbGciOi..."
}
```

#### Error Response (`404 Not Found` for nonexistent or invalid capability)
```json
{
  "error": "TRANSFER_NOT_FOUND",
  "message": "The requested transfer does not exist, has expired, or the capability key is invalid."
}
```

---

### 3.5 Download Encrypted Chunk Stream
`GET /api/transfers/:fileId/chunks/:chunkIndex`

#### Headers
- `Authorization`: `Bearer <downloadAccessToken>`

#### Response (`200 OK`)
- `Content-Type`: `application/octet-stream`
- `X-Chunk-Checksum-Sha256`: `<64-char-hex-hash>`
- Body: Binary stream of the encrypted chunk.

---

### 3.6 Signal Download Completion
`POST /api/transfers/:fileId/complete`

#### Headers
- `Authorization`: `Bearer <downloadAccessToken>`

#### Request Body
```json
{
  "chunksVerified": 4,
  "clientDecryptionStatus": "SUCCESS"
}
```

#### Response (`200 OK`)
```json
{
  "status": "CONSUMED",
  "message": "Transfer consumption recorded. Ephemeral deletion scheduled."
}
```

---

### 3.7 Storage Node Heartbeat
`POST /api/nodes/heartbeat`

#### Request Body
```json
{
  "nodeId": "node-storage-1",
  "timestamp": 1725760800,
  "totalCapacityBytes": 107374182400,
  "usedCapacityBytes": 21474836480,
  "activeOperations": 3,
  "healthStatus": "HEALTHY"
}
```

#### Response (`200 OK`)
```json
{
  "acknowledged": true,
  "action": "NONE"
}
```
