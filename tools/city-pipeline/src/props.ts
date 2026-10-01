import { PROP_TYPES, TREE_TYPES, type ModelClass } from './classify';
import type { Scene } from './scene';

export interface PropsResult {
  /** [tipo, x, y, z, rot] achatado. */
  props: number[];
  /** [tipo, x, y, z, altura] achatado. */
  trees: number[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function collectProps(scene: Scene, classes: Map<string, ModelClass>): PropsResult {
  const props: number[] = [];
  const trees: number[] = [];
  for (const inst of scene.instances) {
    const cls = classes.get(inst.model);
    if (!cls) continue;
    if (cls.kind === 'prop') {
      props.push(PROP_TYPES.indexOf(cls.prop), r2(inst.x), r2(inst.y), r2(inst.z), r2(inst.rot));
    } else if (cls.kind === 'tree') {
      const m = scene.models.get(inst.model)!;
      trees.push(
        TREE_TYPES.indexOf(cls.tree),
        r2(inst.x),
        r2(inst.y + m.bbox[1]),
        r2(inst.z),
        r2(m.bbox[4] - m.bbox[1]),
      );
    }
  }
  return { props, trees };
}
