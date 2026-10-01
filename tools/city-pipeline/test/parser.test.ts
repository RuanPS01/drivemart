import { describe, expect, it } from 'vitest';
import { isNode, isUse, parseVrml } from '../src/vrml/parser';
import { buildScene } from '../src/scene';
import { fixtureVrml } from './fixture';

describe('parseVrml', () => {
  it('lê DEF, USE, campos numéricos, strings, booleanos e listas', () => {
    const doc = parseVrml(`#VRML V2.0 utf8
      # comentário
      DEF tex ImageTexture { url "3.bmp" repeatS FALSE }
      DEF T Transform { translation 1 2 3 rotation 0 1 0 1.5 children [ USE tex ] }`);
    expect(doc.root).toHaveLength(2);
    const tex = doc.defs.get('tex')!;
    expect(tex.fields.url).toEqual(['3.bmp']);
    expect(tex.fields.repeatS).toBe(false);
    const t = doc.defs.get('T')!;
    expect(t.fields.translation).toEqual([1, 2, 3]);
    const children = t.fields.children as unknown[];
    expect(isUse(children[0] as never)).toBe(true);
    expect(isNode(t)).toBe(true);
  });

  it('acusa erro com número de linha', () => {
    expect(() => parseVrml('Group {\n children [ \n')).toThrow(/linha/);
  });
});

describe('buildScene', () => {
  it('monta modelos e instâncias em metros com rotação em Y', () => {
    const scene = buildScene(parseVrml(fixtureVrml()), { unitsPerMeter: 164 });
    expect(scene.models.size).toBe(4);
    const road = scene.models.get('_0001_ROAD01')!;
    expect(road.triangles).toBe(2);
    expect(road.bbox[3] - road.bbox[0]).toBeCloseTo(6, 1);
    expect(scene.instances).toHaveLength(9 * 3 + 2);
    const lamp = scene.instances.find((i) => i.model === '_0004_SLIGHT01')!;
    expect(lamp.x).toBeCloseTo(4, 1);
    expect(lamp.z).toBeCloseTo(10, 1);
    expect(lamp.rot).toBeCloseTo(Math.PI / 2, 3);
  });
});
