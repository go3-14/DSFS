import { createHash } from 'node:crypto';

type RingPoint = { position: bigint; nodeId: string };
const HASH_BITS = 256n;
const HASH_SPACE = 1n << HASH_BITS;

function hashPosition(value: string): bigint {
  return BigInt(`0x${createHash('sha256').update(value).digest('hex')}`);
}

export function moduloNode(key: string, nodes: readonly string[]): string {
  if (nodes.length === 0) throw new Error('at least one node is required');
  const index = Number(hashPosition(key) % BigInt(nodes.length));
  return nodes[index];
}

export class ConsistentHashRing {
  private readonly points: RingPoint[];
  private readonly nodeIds: string[];

  public constructor(nodes: readonly string[], virtualNodes = 128) {
    if (nodes.length === 0) throw new Error('at least one node is required');
    if (!Number.isSafeInteger(virtualNodes) || virtualNodes < 1) throw new Error('virtual node count must be positive');
    if (new Set(nodes).size !== nodes.length) throw new Error('duplicate node is not allowed');
    this.nodeIds = [...nodes];
    this.points = this.nodeIds
      .flatMap((nodeId) => Array.from({ length: virtualNodes }, (_, replica) => ({
        position: hashPosition(`${nodeId}#${replica}`),
        nodeId,
      })))
      .sort((left, right) => left.position < right.position ? -1 : left.position > right.position ? 1 : 0);
  }

  public getNodesFor(key: string, count = 1): string[] {
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('node count must be positive');
    const wanted = Math.min(count, this.nodeIds.length);
    const position = hashPosition(key) % HASH_SPACE;
    let low = 0;
    let high = this.points.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.points[middle].position < position) low = middle + 1;
      else high = middle;
    }
    const selected: string[] = [];
    for (let offset = 0; selected.length < wanted && offset < this.points.length; offset += 1) {
      const point = this.points[(low + offset) % this.points.length];
      if (!selected.includes(point.nodeId)) selected.push(point.nodeId);
    }
    return selected;
  }
}
