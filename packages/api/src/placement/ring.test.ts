import { describe, expect, it } from 'vitest';
import { ConsistentHashRing, moduloNode } from './ring.js';

const baseNodes = ['node-a', 'node-b', 'node-c'];
const keys = Array.from({ length: 1000 }, (_, index) => `chunk-${index}`);

describe('consistent hash placement ring', () => {
  it('returns deterministic distinct nodes in clockwise order', () => {
    const ring = new ConsistentHashRing(baseNodes, 64);
    const first = ring.getNodesFor('chunk-42', 2);
    expect(first).toHaveLength(2);
    expect(new Set(first).size).toBe(2);
    expect(ring.getNodesFor('chunk-42', 2)).toEqual(first);
  });

  it('distributes a key set across all registered nodes', () => {
    const ring = new ConsistentHashRing(baseNodes, 128);
    const counts = new Map(baseNodes.map((node) => [node, 0]));
    for (const key of keys) counts.set(ring.getNodesFor(key)[0], counts.get(ring.getNodesFor(key)[0])! + 1);
    expect([...counts.values()].every((count) => count > 200)).toBe(true);
  });

  it('remaps fewer keys than modulo hashing when a node is added', () => {
    const before = new ConsistentHashRing(baseNodes, 128);
    const after = new ConsistentHashRing([...baseNodes, 'node-d'], 128);
    const ringRemaps = keys.filter((key) => before.getNodesFor(key)[0] !== after.getNodesFor(key)[0]).length;
    const moduloRemaps = keys.filter((key) => moduloNode(key, baseNodes) !== moduloNode(key, [...baseNodes, 'node-d'])).length;
    expect(ringRemaps).toBeLessThan(moduloRemaps);
  });

  it('rejects duplicate or empty node sets', () => {
    expect(() => new ConsistentHashRing([], 32)).toThrow('at least one node');
    expect(() => new ConsistentHashRing(['node-a', 'node-a'], 32)).toThrow('duplicate node');
  });
});
