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
