/**
 * Endereço de um arquivo ou página do próprio site, respeitando a pasta base
 * (no GitHub Pages o jogo fica em /<repositório>/, não na raiz).
 */
export function appUrl(path = ''): string {
  return import.meta.env.BASE_URL + path.replace(/^\/+/, '');
}

/** Rota atual sem a pasta base e sem barra no fim ("" no jogo, "/admin", "/termos"...). */
export function currentRoute(): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  let path = window.location.pathname;
  if (base && path.startsWith(base)) path = path.slice(base.length);
  return path.replace(/\/+$/, '');
}

/** Domínio legível de um link (sem "www."). */
export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Abre o link do estabelecimento numa nova aba, sem dar acesso à página do jogo. */
export function openShopLink(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return;
    window.open(u.toString(), '_blank', 'noopener,noreferrer');
  } catch {
    /* link inválido: ignora */
  }
}
