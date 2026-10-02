/** Cidades disponíveis no jogo (o traçado de cada uma fica em packages/city-data/<id>/layout.json). */
export const CITY_LIST = [
  { id: 'rio', name: 'Rio de Janeiro', short: 'Rio' },
  { id: 'sf', name: 'San Francisco', short: 'SF' },
] as const;

/** Identificador de cidade suportada pelo jogo. */
export type CityId = (typeof CITY_LIST)[number]['id'];

export const DEFAULT_CITY: CityId = 'rio';

export function isCityId(value: unknown): value is CityId {
  return CITY_LIST.some((c) => c.id === value);
}

export function cityInfo(id: CityId): (typeof CITY_LIST)[number] {
  return CITY_LIST.find((c) => c.id === id) ?? CITY_LIST[0];
}
