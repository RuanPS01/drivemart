/**
 * Parser do subconjunto de VRML 2.0 usado pelos níveis exportados do Driver:
 * DEF/USE, nós com campos, campos numéricos simples e múltiplos, strings, booleanos e listas de nós.
 */

export interface VrmlUse {
  use: string;
}

export interface VrmlNode {
  type: string;
  def?: string;
  fields: Record<string, VrmlFieldValue>;
}

export type VrmlItem = VrmlNode | VrmlUse;
export type VrmlFieldValue = number[] | string[] | boolean | VrmlItem | VrmlItem[] | null;

export interface VrmlDocument {
  root: VrmlItem[];
  defs: Map<string, VrmlNode>;
}

const WS = new Set([32, 9, 10, 13, 44]); // espaço, tab, \n, \r e vírgula
const DELIMS = new Set([123, 125, 91, 93, 34, 35]); // { } [ ] " #

function isNumberStart(c: number): boolean {
  return (c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46; // 0-9 - + .
}

export function isUse(item: VrmlFieldValue | undefined): item is VrmlUse {
  return typeof item === 'object' && item !== null && !Array.isArray(item) && 'use' in item;
}

export function isNode(item: VrmlFieldValue | undefined): item is VrmlNode {
  return typeof item === 'object' && item !== null && !Array.isArray(item) && 'type' in item;
}

class Lexer {
  i = 0;
  constructor(private readonly s: string) {}

  skip(): void {
    const s = this.s;
    for (;;) {
      const c = s.charCodeAt(this.i);
      if (WS.has(c)) {
        this.i++;
      } else if (c === 35) {
        const nl = s.indexOf('\n', this.i);
        this.i = nl < 0 ? s.length : nl + 1;
      } else {
        return;
      }
    }
  }

  peek(): number {
    this.skip();
    return this.s.charCodeAt(this.i);
  }

  eof(): boolean {
    this.skip();
    return this.i >= this.s.length;
  }

  expect(ch: string): void {
    if (this.peek() !== ch.charCodeAt(0)) {
      throw this.error(`esperado "${ch}"`);
    }
    this.i++;
  }

  word(): string {
    this.skip();
    const s = this.s;
    const start = this.i;
    while (this.i < s.length) {
      const c = s.charCodeAt(this.i);
      if (WS.has(c) || DELIMS.has(c)) break;
      this.i++;
    }
    if (this.i === start) throw this.error('identificador esperado');
    return s.slice(start, this.i);
  }

  string(): string {
    this.expect('"');
    const end = this.s.indexOf('"', this.i);
    if (end < 0) throw this.error('string sem fim');
    const v = this.s.slice(this.i, end);
    this.i = end + 1;
    return v;
  }

  number(): number {
    const w = this.word();
    const v = Number(w);
    if (Number.isNaN(v)) throw this.error(`número inválido "${w}"`);
    return v;
  }

  error(msg: string): Error {
    const line = this.s.slice(0, this.i).split('\n').length;
    return new Error(`VRML: ${msg} (linha ${line})`);
  }
}

export function parseVrml(text: string): VrmlDocument {
  const lx = new Lexer(text);
  const defs = new Map<string, VrmlNode>();

  function parseItem(first?: string): VrmlItem {
    const w = first ?? lx.word();
    if (w === 'USE') return { use: lx.word() };
    if (w === 'DEF') {
      const name = lx.word();
      const node = parseNode(lx.word());
      node.def = name;
      defs.set(name, node);
      return node;
    }
    return parseNode(w);
  }

  function parseNode(type: string): VrmlNode {
    lx.expect('{');
    const fields: Record<string, VrmlFieldValue> = {};
    while (lx.peek() !== 125) {
      if (lx.eof()) throw lx.error(`nó ${type} sem fim`);
      const name = lx.word();
      fields[name] = parseValue();
    }
    lx.i++;
    return { type, fields };
  }

  function parseValue(): VrmlFieldValue {
    const c = lx.peek();
    if (c === 91) return parseList();
    if (c === 34) return [lx.string()];
    if (isNumberStart(c)) {
      const nums: number[] = [];
      while (isNumberStart(lx.peek())) nums.push(lx.number());
      return nums;
    }
    const w = lx.word();
    if (w === 'TRUE') return true;
    if (w === 'FALSE') return false;
    if (w === 'NULL') return null;
    return parseItem(w);
  }

  function parseList(): number[] | string[] | VrmlItem[] {
    lx.expect('[');
    const nums: number[] = [];
    const strs: string[] = [];
    const items: VrmlItem[] = [];
    for (;;) {
      const c = lx.peek();
      if (c === 93) {
        lx.i++;
        break;
      }
      if (Number.isNaN(c)) throw lx.error('lista sem fim');
      if (isNumberStart(c)) nums.push(lx.number());
      else if (c === 34) strs.push(lx.string());
      else items.push(parseItem());
    }
    if (items.length) return items;
    if (strs.length) return strs;
    return nums;
  }

  const root: VrmlItem[] = [];
  while (!lx.eof()) {
    // Cabeçalho "#VRML V2.0 utf8" é tratado como comentário pelo lexer.
    root.push(parseItem());
  }
  return { root, defs };
}

/** Lê um campo numérico com valor padrão. */
export function numField(node: VrmlNode, name: string, fallback: number[]): number[] {
  const v = node.fields[name];
  return Array.isArray(v) && (v.length === 0 || typeof v[0] === 'number') ? (v as number[]) : fallback;
}

/** Retorna os itens de um campo de lista de nós (children, choice). */
export function itemsField(node: VrmlNode, name: string): VrmlItem[] {
  const v = node.fields[name];
  if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v as VrmlItem[];
  if (isNode(v) || isUse(v)) return [v];
  return [];
}
