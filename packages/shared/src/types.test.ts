import { describe, expect, it } from 'vitest';
import { toCityStateEntry, type ParcelDoc } from './types';

const base: ParcelDoc = {
  cityId: 'rio',
  basePrice: 24000,
  area: 77,
  floors: 3,
  height: 9.4,
  sector: 'D1',
  orla: true,
  region: 'rio_0_-7',
  purchasable: true,
};

describe('toCityStateEntry', () => {
  it('não gera resumo para lote disponível', () => {
    expect(toCityStateEntry(base)).toBeNull();
  });

  it('resume dono, link, preço de revenda e fachada liberada', () => {
    const e = toCityStateEntry({
      ...base,
      status: 'for_sale',
      ownerUid: 'u1',
      ownerName: 'Maria',
      displayName: 'Loja da Maria',
      linkUrl: 'https://maria.com.br',
      salePrice: 150000,
      facade: {
        path: 'facades/rio-1/a.gif',
        url: 'https://x/a.gif',
        kind: 'gif',
        fit: 'cover',
        region: 'full',
        ps1: false,
        background: '#000000',
        width: 320,
        height: 200,
        moderation: 'ok',
        updatedAt: 5,
      },
    });
    expect(e).toEqual({
      s: 'for_sale',
      ou: 'u1',
      o: 'Maria',
      n: 'Loja da Maria',
      l: 'https://maria.com.br',
      p: 150000,
      f: { u: 'https://x/a.gif', k: 'gif', fit: 'cover', r: 'full', ps1: false, bg: '#000000', v: 5 },
    });
  });

  it('esconde fachada bloqueada pela moderação', () => {
    const e = toCityStateEntry({
      ...base,
      status: 'owned',
      ownerUid: 'u1',
      facade: {
        path: 'p',
        url: 'u',
        kind: 'image',
        fit: 'cover',
        region: 'full',
        ps1: false,
        background: '#000',
        width: 1,
        height: 1,
        moderation: 'blocked',
        updatedAt: 1,
      },
    });
    expect(e?.f).toBeUndefined();
  });
});
