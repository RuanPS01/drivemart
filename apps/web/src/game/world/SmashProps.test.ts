import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CityLayout } from '@drivemart/shared';
import { SmashProps } from './SmashProps';

const layout = {
  propTypes: ['cone', 'streetlight'],
  // tipo, x, y, z, rotação
  props: [0, 10, 0, 10, 0, 1, 20, 0, 20, 0],
} as unknown as CityLayout;

describe('SmashProps', () => {
  it('só os objetos quebráveis entram (postes continuam fixos)', () => {
    expect(new SmashProps(layout, new THREE.MeshBasicMaterial()).count).toBe(1);
  });

  it('o carro derruba o cone, que voa e depois assenta no chão', () => {
    const props = new SmashProps(layout, new THREE.MeshBasicMaterial());
    let hits = 0;
    props.onSmash = () => hits++;
    const velocity = { x: 0, y: 0, z: 15 };
    // Longe: nada acontece.
    props.update({ position: new THREE.Vector3(10, 0.6, 5), heading: 0, velocity }, 1 / 60);
    expect(props.stateOf(0)).toBe('static');
    // Para-choque encostando no cone.
    props.update({ position: new THREE.Vector3(10, 0.6, 8.2), heading: 0, velocity }, 1 / 60);
    expect(hits).toBe(1);
    expect(props.stateOf(0)).toBe('flying');
    expect(velocity.z).toBeLessThan(15);
    const far = { position: new THREE.Vector3(10, 0.6, 60), heading: 0, velocity: { x: 0, y: 0, z: 0 } };
    for (let t = 0; t < 6; t += 1 / 60) props.update(far, 1 / 60);
    expect(props.stateOf(0)).toBe('resting');
  });

  it('parado ou devagar não derruba nada', () => {
    const props = new SmashProps(layout, new THREE.MeshBasicMaterial());
    props.update(
      { position: new THREE.Vector3(10, 0.6, 9), heading: 0, velocity: { x: 0, y: 0, z: 0.5 } },
      1 / 60,
    );
    expect(props.stateOf(0)).toBe('static');
  });
});
