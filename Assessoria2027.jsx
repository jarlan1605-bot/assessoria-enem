import { NOME_SITE, FOTO_PERFIL, FOTO_SOCIA } from './constants'

// Página /assessoria: tudo o que a assessoria oferece em 2027 (sem preços; todo contato vai para o direct)
const DIRECT = 'https://ig.me/m/jarlanamed'

const PLATAFORMA = [
  ['🗓️', 'Cronograma personalizado', 'Montado para a sua rotina e ajustado pelo seu mentor sempre que precisar.'],
  ['🧠', 'Banco de questões', 'Questões do ENEM organizadas por área e assunto, para treinar onde você precisa.'],
  ['📕', 'Caderno de erros inteligente', 'Você registra as questões que errou e a plataforma cruza com os dados do ENEM, mostrando se aquele assunto cai muito ou pouco. Assim você sabe onde vale a pena insistir.'],
  ['📈', 'Gráfico de evolução', 'Lance seus simulados nas 4 áreas e acompanhe as suas notas subindo.'],
]

const MENTOR = [
  ['🤝', 'Um mentor só seu', 'Do início das aulas até o 2º dia do ENEM.'],
  ['💬', 'Mensagem todos os dias', 'Você manda, ele responde. Dúvida não fica parada.'],
  ['🩺', 'Estudantes de Medicina da UFRN', 'Quem te acompanha já passou pelo ENEM e sabe o caminho.'],
]

const MAIS = [
  ['🎥', 'Lives e aulões', 'Resolução de prova ao vivo.'],
  ['🧪', 'Workshops temáticos', 'Um assunto a fundo, como Estequiometria.'],
  ['▶️', 'Resoluções no YouTube', 'Simulados resolvidos para rever quando quiser.'],
  ['⏱️', 'Estratégia de prova', 'Gestão de tempo por blocos, ordem de resolução e chute consciente.'],
  ['🎓', 'Orientação pós-ENEM', 'SISU, notas de corte e outros vestibulares.'],
  ['👨‍👩‍👧', 'Resumo para os pais', 'Um resumo mensal do seu progresso.'],
]

const RESUMO = [
  'Cronograma de estudos personalizado',
  'Banco de questões',
  'Caderno de erros inteligente',
  'Gráfico de evolução dos simulados',
  'Mentor individual do início ao 2º dia do ENEM',
  'Mensagens todos os dias',
  'Chamada mensal de estratégia',
  'Chamada mensal de simulado (45 questões)',
  'Lives e aulões de resolução de prova',
  'Workshops temáticos',
  'Resoluções de simulados no YouTube',
  'Estratégia de prova',
  'Orientação pós-ENEM (SISU e notas de corte)',
  'Resumo mensal de progresso para os pais',
]

export const FAQ_ASSESSORIA = [
  ['Serve para quem está no 3º ano ou já terminou o ensino médio?', 'Sim, para os dois.'],
  ['Já faço cursinho. A assessoria serve pra mim?', 'Serve, e muito. A assessoria não é cursinho e não substitui suas aulas. Ela te dá um rumo: organiza seu estudo, mostra onde focar e corrige a rota. Tem muita gente que passa anos no cursinho sem entender por que não passa; a assessoria existe para encurtar esse caminho.'],
  ['Como funciona o pagamento?', 'Via Pix ou cartão de crédito, com parcelamento. Chama no direct que eu te explico os detalhes.'],
  ['Quando começa?', 'No fim de janeiro de 2027, junto com o início das aulas, e vai até o 2º dia do ENEM.'],
  ['Posso ver a plataforma antes de fechar?', 'Pode. A gente marca uma chamada rápida ou te manda um vídeo mostrando tudo por dentro.'],
]

function Direct({ children, contorno = false, className = '' }) {
  return (
    <a className={`as-botao ${contorno ? 'as-botao-contorno' : ''} ${className}`} href={DIRECT} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

export default function Assessoria2027() {
  return (
    <div className="as">
      <header className="as-topo">
        <a className="as-marca" href="/">
          <span className="as-marca-duo" aria-hidden="true">
            <img src={FOTO_PERFIL} alt="" />
            <img src={FOTO_SOCIA} alt="" />
          </span>
          <strong>{NOME_SITE}</strong>
        </a>
        <nav className="as-nav">
          <a href="/">Início</a>
          <Direct className="as-botao-pequeno">Quero uma vaga</Direct>
        </nav>
      </header>

      {/* 1. Hero */}
      <section className="as-hero">
        <span className="as-selo">✦ Mentoria ENEM 2027</span>
        <h1>Tudo que você recebe na <em>Mentoria ENEM 2027</em></h1>
        <p className="as-sub">Do fim de janeiro até o último dia de prova, você não estuda sozinho.</p>
        <div className="as-ctas">
          <Direct>Quero uma vaga →</Direct>
          <div className="as-cta-apoio">
            <Direct contorno>Ver a plataforma por dentro</Direct>
            <small>Quero uma demonstração</small>
          </div>
        </div>
      </section>

      <SecoesAssessoria />

      {/* 9. FAQ */}
      <section className="as-secao">
        <div className="as-cabeca">
          <span className="as-kicker">Dúvidas</span>
          <h2>Perguntas <em>frequentes</em></h2>
        </div>
        <div className="as-faq">
          {FAQ_ASSESSORIA.map(([p, r]) => (
            <details key={p}>
              <summary>{p}</summary>
              <p>{r}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 10. CTA final */}
      <section className="as-final">
        <h2>As vagas são limitadas, porque cada aluno tem <em>acompanhamento de verdade.</em></h2>
        <Direct>Me chama no direct</Direct>
      </section>

      <footer className="as-rodape">
        <span>{NOME_SITE} · @jarlanamed</span>
        <a href="/">Voltar ao início</a>
      </footer>
    </div>
  )
}

// Seções 2 a 8 (rumo, linha do tempo, plataforma, mentor, chamadas, extras e resumo).
// Usadas aqui e também dentro da página inicial.
export function SecoesAssessoria() {
  return (
    <>
      {/* 2. Não é cursinho */}
      <section className="as-secao">
        <div className="as-rumo">
          <h2>Não é cursinho. <em>É rumo.</em></h2>
          <p>A assessoria não é um cursinho. Tem gente que faz cursinho por anos e não sabe por que não passa. A gente te dá um norte: mostra como estudar, onde focar e o que ajustar, para você chegar na aprovação em menos tempo.</p>
        </div>
      </section>

      {/* 3. Linha do tempo */}
      <section className="as-secao">
        <div className="as-cabeca">
          <span className="as-kicker">Linha do tempo</span>
          <h2>Do primeiro dia de aula <em>até a prova</em></h2>
        </div>
        <ol className="as-tempo">
          <li>
            <span className="as-tempo-ponto">1</span>
            <strong>Início das aulas</strong>
            <p>Fim de janeiro de 2027. Montamos seu cronograma e você conhece seu mentor.</p>
          </li>
          <li>
            <span className="as-tempo-ponto">2</span>
            <strong>Acompanhamento mês a mês</strong>
            <p>Mensagens todos os dias e duas chamadas por mês, ajustando a rota sempre que precisar.</p>
          </li>
          <li>
            <span className="as-tempo-ponto">3</span>
            <strong>2º dia do ENEM 2027</strong>
            <p>A gente segue junto até o último dia de prova.</p>
          </li>
        </ol>
      </section>

      {/* 4. Plataforma */}
      <section className="as-secao">
        <div className="as-cabeca">
          <span className="as-kicker">A plataforma</span>
          <h2>Tudo do seu estudo <em>num lugar só</em></h2>
        </div>
        <div className="as-cards">
          {PLATAFORMA.map(([ic, t, d]) => (
            <article key={t} className="as-card">
              <span className="as-icone" aria-hidden="true">{ic}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
        <div className="as-destaque">
          <p><strong>Quer ver por dentro antes de decidir?</strong> A gente faz uma chamada rápida com você ou te manda um vídeo mostrando tudo.</p>
          <Direct>Quero ver a plataforma</Direct>
        </div>
      </section>

      {/* 5. Mentor */}
      <section className="as-secao">
        <div className="as-cabeca">
          <span className="as-kicker">Seu mentor individual</span>
          <h2>Alguém do seu lado <em>o ano inteiro</em></h2>
        </div>
        <div className="as-cards as-cards-3">
          {MENTOR.map(([ic, t, d]) => (
            <article key={t} className="as-card as-card-claro">
              <span className="as-icone" aria-hidden="true">{ic}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 6. Duas chamadas */}
      <section className="as-secao">
        <div className="as-cabeca">
          <span className="as-kicker">Duas chamadas por mês</span>
          <h2>Conversa de verdade, <em>todo mês</em></h2>
        </div>
        <div className="as-chamadas">
          <article className="as-chamada">
            <span className="as-chamada-tag">Chamada 1</span>
            <h3>Chamada de estratégia</h3>
            <p>O que está funcionando, o que não está, dicas, estratégia de prova e ajuste do cronograma.</p>
          </article>
          <article className="as-chamada as-chamada-laranja">
            <span className="as-chamada-tag">Chamada 2</span>
            <h3>Chamada de simulado</h3>
            <p>Uma vez por mês você faz um simulado de 45 questões, na área que escolher (Linguagens, Humanas, Natureza ou Matemática). Seu mentor analisa os seus erros, identifica as questões mais importantes e corrige elas com você, entendendo o porquê de cada erro e como não repetir.</p>
          </article>
        </div>
      </section>

      {/* 7. Mais do que isso */}
      <section className="as-secao">
        <div className="as-cabeca">
          <span className="as-kicker">E mais</span>
          <h2>Mais do que <em>isso</em></h2>
        </div>
        <div className="as-mini">
          {MAIS.map(([ic, t, d]) => (
            <article key={t} className="as-mini-card">
              <span aria-hidden="true">{ic}</span>
              <div><strong>{t}</strong><p>{d}</p></div>
            </article>
          ))}
        </div>
      </section>

      {/* 8. Resumo */}
      <section className="as-secao">
        <div className="as-resumo">
          <h2>Tudo <em>incluso</em></h2>
          <ul>{RESUMO.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="as-resumo-marca">{NOME_SITE} · Mentoria ENEM 2027 · @jarlanamed</p>
        </div>
      </section>
    </>
  )
}
