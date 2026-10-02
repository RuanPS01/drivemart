import type { ReactNode } from 'react';
import { appUrl } from '../ui/links';

/**
 * Termos de Uso e Política de Privacidade.
 * RASCUNHO: os textos abaixo são um ponto de partida e precisam ser revisados por quem responde
 * juridicamente pelo DriveMart antes de publicar (dados da empresa, contato, foro etc.).
 */
export function LegalPage({ page }: { page: 'termos' | 'privacidade' }) {
  return (
    <div className="legal">
      <header className="admin-head">
        <a className="logo small" href={appUrl()}>
          DRIVE<span>MART</span>
        </a>
        <nav className="row">
          <a className="btn" href={appUrl('termos')}>
            Termos de Uso
          </a>
          <a className="btn" href={appUrl('privacidade')}>
            Privacidade
          </a>
          <a className="btn primary" href={appUrl()}>
            Voltar ao jogo
          </a>
        </nav>
      </header>
      <main className="legal-main">{page === 'termos' ? <Terms /> : <Privacy />}</main>
    </div>
  );
}

function Draft() {
  return (
    <p className="form-info">
      Rascunho: este texto precisa ser revisado e completado (razão social, CNPJ, endereço e contato) antes do
      lançamento.
    </p>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Terms() {
  return (
    <article>
      <h1>Termos de Uso</h1>
      <Draft />
      <Section title="1. O que é o DriveMart">
        <p>
          O DriveMart é um jogo de navegador em que você dirige por uma cidade virtual e pode comprar o
          direito de personalizar prédios do jogo: trocar a fachada por uma imagem ou GIF, dar um nome e
          colocar um link de entrada. Os imóveis são itens virtuais dentro do jogo; não representam imóveis
          reais nem qualquer direito sobre propriedades fora do jogo.
        </p>
      </Section>
      <Section title="2. Conta">
        <p>
          Para comprar é preciso criar uma conta com e-mail e senha ou com o Google. Contas de e-mail e senha
          precisam confirmar o e-mail. Você é responsável pelo uso da sua conta e pelas informações que
          fornece.
        </p>
      </Section>
      <Section title="3. Compras pela plataforma">
        <p>
          Imóveis ainda não vendidos são comprados da plataforma por Pix, processado pelo Mercado Pago. O
          imóvel fica reservado enquanto o código Pix estiver válido e passa para a sua conta assim que o
          pagamento é confirmado. Pagamentos que chegarem depois do prazo, quando o imóvel já tiver sido
          vendido a outra pessoa, são devolvidos.
        </p>
      </Section>
      <Section title="4. Revenda entre jogadores">
        <p>
          O dono pode anunciar o imóvel pelo preço que quiser, dentro dos limites exibidos no jogo, informando
          uma chave Pix para receber. A compra acontece em duas etapas: o comprador paga a taxa da plataforma
          (atualmente 10% do preço) pelo Mercado Pago e depois paga o restante diretamente ao vendedor, pelo
          QR Code gerado com a chave do vendedor. O imóvel é transferido quando o vendedor confirma o
          recebimento.
        </p>
        <p>
          O pagamento ao vendedor é feito diretamente entre as partes; o DriveMart não recebe nem guarda esse
          valor. Se o vendedor não confirmar no prazo ou disser que não recebeu, a venda fica em análise e a
          equipe decide com base nas informações e comprovantes apresentados. Se a compra for cancelada ou
          expirar depois da taxa paga, a taxa é devolvida, salvo em caso de fraude comprovada.
        </p>
      </Section>
      <Section title="5. Conteúdo das fachadas e links">
        <p>
          Você é responsável pelas imagens, nomes e links que publicar. É proibido publicar conteúdo ilegal,
          ofensivo, sexual explícito, discriminatório, que viole direitos autorais ou de marca, ou links para
          golpes, malware e páginas enganosas. Qualquer jogador pode denunciar um imóvel. A equipe pode
          bloquear fachadas e links que violem estas regras, sem reembolso quando a violação for do dono.
        </p>
      </Section>
      <Section title="6. Links externos">
        <p>
          Os links de entrada levam a sites de terceiros, abertos numa nova aba. O DriveMart não controla nem
          se responsabiliza pelo conteúdo, pelas ofertas ou pelas compras feitas nesses sites.
        </p>
      </Section>
      <Section title="7. Disponibilidade e mudanças">
        <p>
          O jogo pode passar por manutenção, mudanças de visual, de regras e de preços. Mudanças relevantes
          nestes termos serão avisadas no jogo. Se o serviço for encerrado, os donos de imóveis serão avisados
          com antecedência.
        </p>
      </Section>
      <Section title="8. Contato">
        <p>[Preencher: e-mail de suporte e dados da empresa responsável.]</p>
      </Section>
    </article>
  );
}

function Privacy() {
  return (
    <article>
      <h1>Política de Privacidade</h1>
      <Draft />
      <Section title="Quais dados coletamos">
        <ul>
          <li>Conta: nome, e-mail e, no login com Google, a foto do perfil.</li>
          <li>
            Compras: pedidos, valores, situação dos pagamentos e identificadores do Mercado Pago. Não
            recebemos dados de cartão nem senhas bancárias.
          </li>
          <li>
            Revenda: a chave Pix, o nome e a cidade do recebedor informados pelo vendedor. A chave completa
            fica visível só para o próprio vendedor; o comprador vê parte dela e o nome, para conferir no
            banco.
          </li>
          <li>
            Conteúdo publicado: imagens de fachada, nomes e links dos imóveis, que são públicos no jogo.
          </li>
          <li>Comprovantes de Pix enviados na revenda, vistos só por comprador, vendedor e equipe.</li>
          <li>Denúncias enviadas por você.</li>
        </ul>
      </Section>
      <Section title="Para que usamos">
        <p>
          Para manter sua conta, processar compras e revendas, exibir os imóveis personalizados, analisar
          denúncias e disputas, prevenir fraudes e cumprir obrigações legais. Preferências do jogo (gráficos,
          volume) ficam só no seu navegador.
        </p>
      </Section>
      <Section title="Com quem compartilhamos">
        <p>
          Google Firebase (hospedagem, autenticação, banco de dados e arquivos) e Mercado Pago (pagamentos
          Pix). Seu nome público aparece como dono dos seus imóveis para outros jogadores.
        </p>
      </Section>
      <Section title="Seus direitos (LGPD)">
        <p>
          Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados, e revogar
          consentimentos, pelo contato abaixo. Alguns dados de pagamento podem ser mantidos pelo prazo exigido
          em lei.
        </p>
      </Section>
      <Section title="Contato do encarregado">
        <p>[Preencher: nome e e-mail do encarregado pelo tratamento de dados.]</p>
      </Section>
    </article>
  );
}
