import type { CityId } from '@drivemart/shared';
import { useGame } from './gameStore';
import { saveSettings, syncCityUrl } from './settings';
import { useUi } from './uiStore';

/** Troca de cidade: salva a escolha, atualiza o endereço e recarrega o motor com o novo traçado. */
export function chooseCity(city: CityId): void {
  const game = useGame.getState();
  if (game.settings.city === city) return;
  const settings = { ...game.settings, city };
  saveSettings(settings);
  syncCityUrl(city);
  useUi.getState().close();
  game.set({ settings, route: null });
}
