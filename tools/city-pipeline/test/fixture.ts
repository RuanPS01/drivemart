/**
 * Mini cidade em VRML para testes: uma rua norte-sul, calçada dos dois lados e um painel de fachada
 * de frente para a rua. Mesmas convenções do exportador (164 unidades por metro, tiles com instâncias).
 */
const U = 164;
const m = (v: number) => Math.round(v * U);

function quad(x0: number, z0: number, x1: number, z1: number, y = 0): string {
  return `${m(x0)} ${m(y)} ${m(z0)}\n${m(x1)} ${m(y)} ${m(z0)}\n${m(x1)} ${m(y)} ${m(z1)}\n${m(x0)} ${m(y)} ${m(z1)}`;
}

function shape(points: string, index: string): string {
  return `Shape {
  appearance Appearance { material USE Lit }
  geometry IndexedFaceSet {
    coord Coordinate { point [
${points}
    ] }
    coordIndex [ ${index} ]
  }
}`;
}

export function fixtureVrml(): string {
  // Peça de rua 6 x 6 m centrada na origem; calçada 3 x 6 m elevada 0,1 m; painel 12 m de largura x 9 m de altura.
  const road = shape(quad(-3, -3, 3, 3), '0 2 1 -1 0 3 2 -1');
  const walk = shape(quad(0, -3, 3, 3, 0.1), '0 2 1 -1 0 3 2 -1');
  const panel = shape(
    `0 0 ${m(-6)}\n0 0 ${m(6)}\n0 ${m(9)} ${m(6)}\n0 ${m(9)} ${m(-6)}`,
    '0 1 2 -1 0 2 3 -1',
  );
  const lamp = shape(`0 0 0\n${m(0.2)} 0 0\n${m(0.2)} ${m(9)} 0`, '0 1 2 -1');
  const instances: string[] = [];
  for (let k = -4; k <= 4; k++) {
    instances.push(`Transform { translation 0 0 ${m(k * 6)} children [ USE _0001_ROAD01 ] }`);
    instances.push(`Transform { translation ${m(3)} 0 ${m(k * 6)} children [ USE _0002_PATH1 ] }`);
    instances.push(`Transform { translation ${m(-6)} 0 ${m(k * 6)} children [ USE _0002_PATH1 ] }`);
  }
  // Painel na borda leste da calçada (x = 6 m), de frente para a rua (oeste).
  instances.push(`Transform { translation ${m(6)} 0 0 children [ USE _0003_ ] }`);
  instances.push(
    `Transform { translation ${m(4)} 0 ${m(10)} rotation 0 1 0 1.5707963 children [ USE _0004_SLIGHT01 ] }`,
  );
  return `#VRML V2.0 utf8
DEF Lit Material { }
DEF Meshes Switch {
  whichChoice -1
  choice [
DEF _0001_ROAD01 ${road}
DEF _0002_PATH1 ${walk}
DEF _0003_ ${panel}
DEF _0004_SLIGHT01 Group { children [ ${lamp} ] }
  ]
}
DEF tile0 Transform {
  translation 0 0 0
  children [
${instances.join('\n')}
  ]
}
`;
}
