import { useState } from 'react';
import { isOffline } from '../../services/firebase';

const KEY = 'drivemart:help-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Ajuda de controles exibida na primeira visita. */
export function ControlsHelp() {
  const [open, setOpen] = useState(() => !readDismissed());
  if (!open) {
    return (
      <button className="hud-button help-toggle" onClick={() => setOpen(true)} aria-label="Mostrar controles">
        ?
      </button>
    );
  }
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* armazenamento indisponível */
    }
  };
  return (
    <div className="controls-help panel">
      <h3>Controles</h3>
      <ul>
        <li>
          <kbd>W</kbd> ou seta para cima: acelerar
        </li>
        <li>
          <kbd>S</kbd> ou seta para baixo: frear e ré
        </li>
        <li>
          <kbd>A</kbd>
          <kbd>D</kbd> ou setas laterais: virar
        </li>
        <li>
          <kbd>Espaço</kbd> freio de mão
        </li>
        <li>
          <kbd>C</kbd> câmera, <kbd>V</kbd> olhar para trás
        </li>
        <li>
          <kbd>R</kbd> voltar para a rua
        </li>
        <li>
          <kbd>E</kbd> interagir com o prédio
        </li>
        <li>
          <kbd>M</kbd> mapa
        </li>
      </ul>
      <p>
        {isOffline()
          ? 'Pare o carro na vaga marcada em frente a um prédio para ver o imóvel. Nesta versão de teste o login e as compras estão desativados.'
          : 'Pare o carro na vaga marcada em frente a um prédio para ver o preço e comprar.'}
      </p>
      <button className="btn primary" onClick={close}>
        Dirigir
      </button>
    </div>
  );
}
