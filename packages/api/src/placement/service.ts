import { MetadataDatabase } from '../db/database.js';
import { ConsistentHashRing } from './ring.js';

export class PlacementService {
  public constructor(
    private readonly database: MetadataDatabase,
    private readonly virtualNodes = 128,
  ) {}

  public placeChunk(chunkId: string, count = 1): string[] {
    const selected = this.selectNodes(chunkId, count);
    this.database.recordPlacement(chunkId, selected);
    return selected;
  }

  public selectNodes(chunkId: string, count = 1): string[] {
    const healthyNodes = this.database.listStorageNodes('HEALTHY').map((node) => node.node_id);
    if (healthyNodes.length === 0) throw new Error('no healthy storage nodes');
    return new ConsistentHashRing(healthyNodes, this.virtualNodes).getNodesFor(chunkId, count);
  }
}
