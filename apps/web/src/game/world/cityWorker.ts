/// <reference lib="webworker" />
import type { CityLayout } from '@drivemart/shared';
import { buildChunk, indexLayout, type ChunkBuild, type CityIndex } from './cityGen';

export type WorkerRequest = { type: 'init'; url: string } | { type: 'build'; key: string };
export type WorkerResponse =
  | { type: 'ready'; keys: string[] }
  | { type: 'chunk'; chunk: ChunkBuild }
  | { type: 'error'; message: string };

let index: CityIndex | null = null;

function transferables(c: ChunkBuild): Transferable[] {
  const m = c.mesh;
  return [
    m.position.buffer,
    m.uv.buffer,
    m.layer.buffer,
    m.tint.buffer,
    m.shade.buffer,
    m.index.buffer,
    c.trees.center.buffer,
    c.trees.corner.buffer,
    c.trees.uv.buffer,
    c.trees.layer.buffer,
    c.trees.index.buffer,
    c.colliders.boxes.buffer,
    c.colliders.groundPosition.buffer,
    c.colliders.groundIndex.buffer,
  ] as Transferable[];
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      const layout = (await (await fetch(msg.url)).json()) as CityLayout;
      index = indexLayout(layout);
      (self as unknown as Worker).postMessage({ type: 'ready', keys: index.keys } satisfies WorkerResponse);
    } else if (msg.type === 'build') {
      if (!index) throw new Error('worker não inicializado');
      const chunk = buildChunk(index, msg.key);
      (self as unknown as Worker).postMessage(
        { type: 'chunk', chunk } satisfies WorkerResponse,
        transferables(chunk),
      );
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: String(err) } satisfies WorkerResponse);
  }
};
