# DriveMart

Jogo de navegador no estilo dos clássicos de direção do PS1 (Driver 1 e 2), em modo de direção livre pelo Rio de Janeiro. Cada prédio da cidade pode ser comprado via Pix, ganhar uma imagem ou GIF animado na fachada, um nome e um link de entrada que abre quando alguém para o carro na vaga em frente. Os donos podem revender os imóveis para outros jogadores.

O site abre direto no jogo: não é preciso conta para dirigir. A conta (e-mail e senha ou Google) só é pedida na hora de comprar.

## Recursos

- Cidade do Rio recriada a partir do traçado do nível de Driver 2: ruas, calçadas, calçadão da orla, praia, lagoa, prédios, postes, semáforos, árvores e palmeiras.
- Visual de PS1 feito por código: texturas pintadas proceduralmente, vértices tremidos, UV afim, cores de 15 bits com pontilhado, neblina, modo noite com janelas acesas, faróis e luz dos postes.
- Carro com física arcade (Rapier): freio de mão que solta a traseira, desvirar automático, câmera de perseguição, para-choque e olhar para trás.
- Objetos de rua (cones, caixas, barris, mesas, cadeiras) que voam quando o carro bate.
- Som sintetizado em tempo real: motor com troca de marcha, pneus cantando, batidas e objetos quebrando.
- Minimapa giratório, mapa da cidade, GPS com setas até o seu imóvel e teleporte.
- Compra pela plataforma com Pix do Mercado Pago (QR Code e copia e cola, confirmação automática por webhook).
- Revenda entre jogadores com dois Pix: a taxa da plataforma (10%) pelo Mercado Pago e o restante direto na chave Pix do vendedor, com confirmação do vendedor e disputas analisadas pelo admin.
- Gestão dos imóveis: fachada (PNG, JPG, WebP ou GIF animado, com ajuste e área), nome, link, localização, venda e pendências.
- Denúncias e painel admin em `/admin` (disputas, pedidos, denúncias, moderação, preços e taxas).
- Controles por teclado, gamepad e toque (celular e tablet).

## Estrutura

```
apps/web/              jogo (Vite + React + TypeScript + three.js)
  src/game/            motor: mundo, física, carro, câmera, áudio, lotes, GPS
  src/ui/              HUD e modais
  src/admin/           painel admin (/admin)
  src/legal/           termos de uso e privacidade (/termos e /privacidade)
  e2e/                 testes de ponta a ponta (Playwright)
functions/             Cloud Functions (pagamentos, revenda, fachadas, admin)
packages/shared/       tipos e regras comuns (BR Code Pix, chave Pix, preços, pedidos)
packages/city-data/    traçado derivado da cidade (layout.json, só números)
tools/city-pipeline/   extração do traçado a partir dos níveis em VRML
tests/                 testes de regras e de functions contra os emuladores
```

## Sobre o conteúdo original

Nenhum arquivo do jogo original vai para o site ou para este repositório: nem texturas, nem malhas, nem carros, nem sons. O pacote de níveis em VRML é lido só localmente pelo `tools/city-pipeline` para extrair o traçado (posição das ruas, calçadas, prédios e objetos). O resultado, `packages/city-data/rio/layout.json`, contém apenas números e está versionado, então o projeto roda sem o pacote original. Toda a arte e o som são gerados por código próprio.

## Rodando localmente

Requisitos: Node 22.12 ou mais novo e Java 21 (para os emuladores do Firebase).

```bash
npm install
npm run dev:all          # emuladores do Firebase + jogo em http://localhost:5173
npm run emulators:seed   # em outro terminal, uma única vez: grava o catálogo de lotes no emulador
```

- Os emuladores usam o projeto `demo-drivemart`, um provedor de pagamento falso e o botão "Simular pagamento (teste)" no lugar do Pix real.
- Os dados dos emuladores são salvos em `.emulator-data` ao sair (Ctrl+C) e recarregados na próxima vez.
- Interface dos emuladores: http://localhost:4000 (contas, documentos e arquivos). O link de confirmação de e-mail aparece no terminal dos emuladores.
- Para virar admin no emulador: `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run admin:grant -- seu@email.com` e depois "Atualizar acesso" em `/admin`.
- Só o jogo, sem Firebase (modo de teste): `npm run dev` com `VITE_OFFLINE=true` em `apps/web/.env.local`. Dá para dirigir, usar o mapa e teleportar para qualquer imóvel; login e compras ficam desativados.

### Testes

```bash
npm run lint && npm run typecheck
npm test                 # unitários (Vitest)
npm run test:emulator    # regras do Firestore e Cloud Functions contra os emuladores
npm run test:e2e         # Playwright; o fluxo de compra roda quando os emuladores estão no ar
```

## Versão de teste no GitHub Pages

A pipeline `.github/workflows/pages.yml` publica o jogo no modo de teste (sem Firebase: só direção, sem login nem compras) a cada push na `main`, e também pode ser rodada à mão em Actions > GitHub Pages > Run workflow. O endereço fica `https://<usuário>.github.io/<repositório>/` (aqui, `https://ruanps01.github.io/drivemart/`).

Para ativar uma vez:

1. Em Settings > Pages, escolha **GitHub Actions** em Build and deployment > Source.
2. Repositório privado: o GitHub Pages exige o plano GitHub Pro (ou outro pago) para publicar a partir de repositório privado. Sem ele, torne o repositório público. O site publicado fica público nos dois casos.
3. Faça um push na `main` (ou rode o workflow manualmente) e acompanhe em Actions.

A pipeline monta o site com `VITE_OFFLINE=true` e com a pasta base que o Pages informa (`/drivemart/`, ou `/` se houver domínio próprio), e copia o `index.html` para `404.html` para que endereços como `/drivemart/termos` abram direto.

## Colocando no ar

### 1. Projeto Firebase

1. Crie um projeto no [console do Firebase](https://console.firebase.google.com) e ative o plano Blaze (Cloud Functions e Cloud Storage exigem; a cota gratuita continua valendo).
2. Authentication: ative os provedores E-mail/senha e Google. Em Configurações, adicione o domínio do site aos domínios autorizados.
3. Firestore: crie o banco no modo nativo, na região `southamerica-east1` (São Paulo).
4. Storage: crie o bucket padrão na mesma região.
5. Em Configurações do projeto, registre um app da Web e copie a configuração para `apps/web/.env.local` (use `apps/web/.env.example` como modelo, com `VITE_USE_EMULATORS=false`).
6. Aponte o Firebase CLI para o projeto: `npx firebase use --add` (escolha o projeto e um apelido).

### 2. Mercado Pago

1. No [painel de desenvolvedores](https://www.mercadopago.com.br/developers/panel/app), crie uma aplicação (Checkout Transparente / pagamentos online) na conta que vai receber, com uma chave Pix cadastrada.
2. Guarde o Access Token (comece pelas credenciais de teste).
3. Grave os segredos nas functions:
   ```bash
   npx firebase functions:secrets:set MP_ACCESS_TOKEN
   npx firebase functions:secrets:set MP_WEBHOOK_SECRET   # assinatura secreta do webhook (passo 5)
   ```
   No primeiro deploy o webhook ainda não existe: grave um valor provisório em `MP_WEBHOOK_SECRET` e troque depois.
4. Copie `functions/.env.example` para `functions/.env.<id-do-projeto>` e preencha `MP_WEBHOOK_URL` com a URL da função `mercadoPagoWebhook` (aparece no fim do deploy, no formato `https://southamerica-east1-<projeto>.cloudfunctions.net/mercadoPagoWebhook`).
5. Em Webhooks da aplicação, cadastre essa URL com o evento de Order (pedidos), copie a assinatura secreta, grave em `MP_WEBHOOK_SECRET` e faça o deploy das functions de novo.

### 3. Deploy

```bash
npm run build
npx firebase deploy                                   # hosting, functions, regras e índices
gsutil cors set storage.cors.json gs://<seu-bucket>   # permite usar as fachadas como textura no jogo
```

Grave o catálogo de lotes e as configurações iniciais (preços e taxa) no Firestore de produção com uma chave de conta de serviço (Configurações do projeto > Contas de serviço > Gerar nova chave privada):

```bash
GOOGLE_APPLICATION_CREDENTIALS=chave.json npm run city:seed -- --city rio --project <id-do-projeto>
GOOGLE_APPLICATION_CREDENTIALS=chave.json npm run admin:grant -- voce@exemplo.com --project <id-do-projeto>
```

O seed só grava campos de catálogo e pode ser repetido sem apagar donos, fachadas ou vendas. A pessoa promovida a admin precisa sair e entrar de novo (ou usar "Atualizar acesso" em `/admin`).

### 4. App Check (recomendado)

Crie uma chave do reCAPTCHA Enterprise para o domínio, ative o App Check no console com ela, coloque a chave em `VITE_RECAPTCHA_SITE_KEY` e, depois de conferir que o site funciona, ligue `ENFORCE_APP_CHECK=true` no arquivo de ambiente das functions.

### 5. Antes de abrir ao público

- Complete os textos de `/termos` e `/privacidade` (`apps/web/src/legal/LegalPage.tsx`) com os dados da empresa e o contato.
- Teste uma compra e uma revenda com as credenciais de teste do Mercado Pago e só então troque para as de produção.
- Ajuste preços, taxa e prazos em `/admin` > Preços e taxas.

## Como funcionam os pagamentos

**Compra pela plataforma.** O jogador para na vaga, vê o preço e gera um Pix. O imóvel fica reservado por 30 minutos. Quando o Mercado Pago avisa pelo webhook (assinatura conferida) ou quando a rotina periódica confirma o pagamento, o imóvel passa para o nome do comprador. Pagamento que chega depois do prazo, com o imóvel já vendido a outra pessoa, é estornado automaticamente.

**Revenda.** O dono anuncia com preço e chave Pix (CPF, CNPJ, e-mail, celular ou aleatória). O comprador:

1. paga a taxa da plataforma (10%) pelo Pix do Mercado Pago;
2. recebe um QR Code Pix estático gerado com a chave do vendedor no valor dos outros 90%, paga pelo app do banco e toca em "Já paguei o vendedor" (pode anexar o comprovante);
3. o vendedor confere a conta e confirma em Meus imóveis; o imóvel passa para o comprador com fachada e link zerados.

Prazos (ajustáveis no admin): 30 minutos para a taxa, 24 horas para pagar o vendedor (senão a compra expira e a taxa é devolvida) e 72 horas para o vendedor confirmar (senão vira disputa). Se o vendedor disser que não recebeu, a venda vai para a fila de disputas do admin, que conclui a favor do comprador ou anula, com ou sem devolução da taxa. O vendedor não consegue retirar o anúncio nem mudar a chave enquanto houver uma compra em andamento.

A integração com o Mercado Pago usa a API de Orders do SDK oficial atrás da interface `PaymentProvider` (`functions/src/payments`), pronta para receber o Stripe depois.

## Controles

| Ação                     | Teclado                               | Gamepad            |
| ------------------------ | ------------------------------------- | ------------------ |
| Acelerar e frear         | W e S ou setas para cima e para baixo | gatilhos           |
| Virar                    | A e D ou setas laterais               | analógico esquerdo |
| Freio de mão             | Espaço                                | A                  |
| Interagir com o prédio   | E                                     |                    |
| Câmera e olhar para trás | C e V                                 |                    |
| Voltar para a rua        | R                                     |                    |
| Mapa                     | M                                     |                    |

No celular aparecem botões na tela. As configurações (engrenagem) têm gráficos PS1 ou nítidos, distância de visão, dia ou noite, volume e velocímetro.

## Extraindo o traçado de novo (opcional)

Só é necessário para refazer ou acrescentar cidades. Com o pacote de níveis em VRML em mãos:

```bash
npm run city:extract -- --archive caminho/para/Driver_levels_as_VRML.7z --city rio
```

O comando extrai só a pasta do Rio para `.cache/` (fora do Git), gera `packages/city-data/rio/layout.json` e mantém os IDs dos lotes estáveis com `ids.lock.json`. Acrescente `--debug tools/city-pipeline/out/rio.png` para salvar uma imagem de conferência vista de cima.

## Fora desta versão

Tráfego, polícia e pedestres; multiplayer; pagamento com Stripe (a interface já existe); moderação automática de imagens; outras cidades (o pipeline aceita, mas cada uma precisa de conferência dos lotes); aviso por e-mail ao vendedor (por enquanto o aviso fica no jogo).
