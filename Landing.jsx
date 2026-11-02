import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { NOME_SITE, NOME_MENTOR, INSTAGRAM, FOTO_PERFIL, FOTOS_AULAS } from './constants'
import Avatar from './Avatar'
import FormInteresse from './Interesse'

const PADRAO = {
  titulo: 'Sua aprovação com um plano feito para você',
  subtitulo: 'Mentoria para o ENEM com horário de estudos personalizado, simulados acompanhados de perto e aulas individuais.',
  whatsapp: '',
  instagram: INSTAGRAM,
  planos: [],
  numeros: [],
}


const PASSOS = [
  ['Conversa e diagnóstico', 'Entendo a rotina, a meta de curso e onde o aluno está hoje, com base nos simulados.'],
  ['Horário personalizado', 'Monto um horário de estudos que cabe na rotina real, com metas para cada área.'],
  ['Atendimentos e correções', 'Encontros ao vivo, correção de simulados e de redação, com ajustes sempre que precisar.'],
  ['Evolução registrada', 'Cada simulado e cada meta ficam na plataforma, e a família também pode acompanhar.'],
]

const PAIS = [
  ['📊', 'Você acompanha a evolução', 'Notas dos simulados, metas e horário ficam na plataforma, com relatório mensal em PDF.'],
  ['🤝', 'Ele não estuda sozinho', 'Tem alguém acompanhando de perto, e você não precisa ficar cobrando todo dia.'],
  ['🧭', 'Rotina e calma', 'Um plano claro diminui a ansiedade: ele sabe o que estudar e por quê.'],
]

const FAQ = [
  ['E se meu filho não se adaptar?', 'Nas primeiras semanas a gente ajusta o plano junto: horário, ritmo e prioridades mudam conforme a rotina dele. Se algo não estiver funcionando, é só conversar comigo.'],
  ['Funciona para quem está no 2º ano?', 'Funciona. Quanto antes começa, mais tempo para construir base com calma. O plano é montado para o momento de cada aluno.'],
  ['Preciso pagar cursinho junto?', 'Não é obrigatório. A mentoria organiza o que estudar e como estudar; dá para usar cursinho, plataforma ou materiais gratuitos, e eu ajudo a escolher o que faz sentido.'],
  ['Como são os atendimentos?', 'Online e ao vivo, marcados pela própria plataforma, com suporte pelo WhatsApp entre um encontro e outro.'],
]

const FAIXA = ['Horário sob medida', 'Simulados', 'Redação nota 1000', 'Aulas ao vivo', 'Caderno de erros', 'Metas por área']

export function linkWhatsApp(numero, texto) {
  const n = (numero || '').replace(/\D/g, '')
  if (!n) return null
  return `https://wa.me/${n.length <= 11 ? '55' + n : n}?text=${encodeURIComponent(texto)}`
}

// Divide o título para destacar as últimas palavras em itálico
function partesTitulo(titulo) {
  const palavras = titulo.trim().split(/\s+/)
  if (palavras.length < 4) return [titulo, '']
  const n = Math.min(3, Math.ceil(palavras.length / 3))
  return [palavras.slice(0, -n).join(' '), palavras.slice(-n).join(' ')]
}

export default function Landing({ onEntrar }) {
  const [cfg, setCfg] = useState(PADRAO)
  const [depoimentos, setDepoimentos] = useState([])
  const [fotoMentor, setFotoMentor] = useState(null)
  const [mentores, setMentores] = useState([])

  useEffect(() => {
    supabase.from('site_config').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setCfg({ ...PADRAO, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== null)) })
    })
    supabase.from('depoimentos').select('*').eq('publicado', true).order('ordem').order('criado_em').then(({ data }) => setDepoimentos(data ?? []))
    supabase.rpc('foto_do_mentor').then(({ data }) => setFotoMentor(data || null))
    supabase.rpc('mentores_publicos').then(({ data }) => setMentores(data ?? []))
  }, [])

  // Link do Instagram (?vagas ou #interesse): rola direto até o formulário de 2027
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('vagas') && window.location.hash !== '#interesse') return
    const t = setTimeout(() => document.getElementById('interesse')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
    return () => clearTimeout(t)
  }, [])

  const arroba = cfg.instagram ? cfg.instagram.replace('@', '') : ''
  const insta = arroba ? `https://ig.me/m/${arroba}` : null
  const perfilInsta = arroba ? `https://instagram.com/${arroba}` : null
  const [inicio, destaque] = partesTitulo(cfg.titulo)

  const msgWpp = `Oi, ${NOME_MENTOR}! Quero saber mais sobre a mentoria 2027`
  const wpp2027 = linkWhatsApp(cfg.whatsapp, msgWpp)
  const contato = wpp2027 || insta

  return (
    <div className="lp">
      <header className="lp-topo">
        <div className="lp-marca">
          <Avatar src={fotoMentor} nome={NOME_MENTOR} tamanho={36} />
          <strong>{NOME_SITE}</strong>
        </div>
        <div className="lp-topo-acoes">
          <a className="lp-link lp-topo-link" href="#como-funciona">Como funciona</a>
          <a className="lp-link lp-topo-link" href="#interesse">Vagas 2027</a>
          <button className="lp-botao lp-botao-pequeno" onClick={onEntrar}>Área do aluno</button>
        </div>
      </header>

      {/* 1. Dor primeiro */}
      <section className="lp-hero">
        <div className="lp-hero-texto">
          <span className="lp-etiqueta">✦ Mentoria individual para o ENEM</span>
          <h1>
            {inicio} {destaque && <em>{destaque}</em>}
          </h1>
          <p className="lp-sub">{cfg.subtitulo}</p>
          <div className="lp-ctas">
            {contato && <a className="lp-botao lp-botao-cheio" href={contato} target="_blank" rel="noreferrer">Quero conhecer a mentoria →</a>}
            <a className="lp-botao lp-botao-contorno" href="#interesse">Vagas 2027</a>
          </div>
          <button className="lp-link" onClick={onEntrar}>Já sou aluno · entrar →</button>
        </div>
        <div className="lp-hero-foto">
          <div className="lp-arco">
            <img src={FOTO_PERFIL} alt={`${NOME_MENTOR}, mentor`} />
          </div>
          <span className="lp-adesivo lp-adesivo-1">🩺 Medicina · UFRN</span>
          <span className="lp-adesivo lp-adesivo-2">🎯 Plano feito pra rotina dele</span>
          {arroba && <span className="lp-adesivo lp-adesivo-3">@{arroba}</span>}
        </div>
      </section>

      {/* 2. Números */}
      {cfg.numeros?.length > 0 && (
        <section className="lp-numeros-bloco" aria-label="Números da mentoria">
          <p className="lp-numeros-titulo">A mentoria em números · resultados dos alunos</p>
          <div className="lp-numeros-faixa">
          {cfg.numeros.map((n, i) => (
            <div key={i}><strong>{n.valor}</strong><span>{n.rotulo}</span></div>
          ))}
          </div>
        </section>
      )}

      {/* 3. Antes × depois */}
      <AntesDepois depoimentos={depoimentos} />

      {/* 4. Depoimentos */}
      <Feedbacks depoimentos={depoimentos} />

      {/* 5. Como funciona */}
      <section className="lp-secao lp-passos-secao" id="como-funciona">
        <div className="lp-cabeca">
          <span className="lp-kicker">Como funciona</span>
          <h2>Simples, claro e <em>de perto</em></h2>
        </div>
        <ol className="lp-passos lp-passos-4">
          {PASSOS.map(([t, d], i) => (
            <li key={t}>
              <span className="lp-passo-num">{i + 1}</span>
              <strong>{t}</strong>
              <p>{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 6. Autoridade */}
      <section className="lp-secao">
        <div className="lp-autor">
          <div className="lp-autor-foto"><img src={FOTO_PERFIL} alt={NOME_MENTOR} loading="lazy" /></div>
          <div className="lp-autor-texto">
            <span className="lp-kicker">Quem vai acompanhar</span>
            <h2>Eu sei o caminho, <em>porque fiz ele</em></h2>
            <p>Sou {NOME_MENTOR}, aprovado em Medicina na UFRN. Passei pelas mesmas dúvidas, pela mesma rotina puxada e pela mesma ansiedade. Hoje uso o que funcionou para montar o plano de cada aluno, um por um.</p>
            <ul className="lp-mentor-tags">
              <li>Medicina · UFRN</li>
              <li>Mentoria individual</li>
              <li>Acompanhamento de perto</li>
            </ul>
          </div>
        </div>
      </section>

      {mentores.length > 1 && (
        <section className="lp-secao" id="mentores">
          <div className="lp-cabeca">
            <span className="lp-kicker">Equipe</span>
            <h2>Conheça os <em>mentores</em></h2>
          </div>
          <div className="lp-mentores">
            {mentores.map((m) => {
              const primeiro = (m.nome || '').split(' ')[0]
              const link = linkWhatsApp(cfg.whatsapp, `Olá! Vi o site da ${NOME_SITE} e quero saber sobre a mentoria com ${primeiro}.`)
              return (
                <article key={m.id} className="lp-mentor">
                  <div className="lp-mentor-foto">
                    {m.foto_url ? <img src={m.foto_url} alt={m.nome} loading="lazy" /> : <span className="lp-mentor-inicial" aria-hidden="true">{primeiro.slice(0, 1)}</span>}
                    <span className={m.disponivel ? 'lp-vaga aberta' : 'lp-vaga'}>{m.disponivel ? '● Vagas abertas' : 'Agenda cheia'}</span>
                  </div>
                  <div className="lp-mentor-corpo">
                    <h3>{m.nome}</h3>
                    {(m.idade || m.naturalidade) && (
                      <p className="lp-mentor-dados">{[m.idade && `${m.idade} anos`, m.naturalidade].filter(Boolean).join(' · ')}</p>
                    )}
                    {m.caracteristicas?.length > 0 && (
                      <ul className="lp-mentor-tags">{m.caracteristicas.map((c) => <li key={c}>{c}</li>)}</ul>
                    )}
                    {m.legenda && (
                      <blockquote className="lp-mentor-legenda">
                        “{m.legenda}”
                        <cite>— {primeiro}</cite>
                      </blockquote>
                    )}
                    {m.disponivel && (link || insta) && (
                      <a className="lp-botao lp-botao-cheio lp-mentor-cta" href={link || insta} target="_blank" rel="noreferrer">Quero estudar com {primeiro}</a>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {/* 7. Para os pais */}
      <section className="lp-secao">
        <div className="lp-pais">
          <div className="lp-cabeca">
            <span className="lp-kicker">Para os pais</span>
            <h2>Seu filho não estuda sozinho, <em>e você fica tranquilo</em></h2>
          </div>
          <div className="lp-pais-grade">
            {PAIS.map(([ic, t, d]) => (
              <div key={t} className="lp-pais-item">
                <span aria-hidden="true">{ic}</span>
                <strong>{t}</strong>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {FOTOS_AULAS.length > 0 && (
        <section className="lp-secao">
          <div className="lp-cabeca">
            <span className="lp-kicker">Por dentro das aulas</span>
            <h2>Estudar junto <em>dá resultado</em></h2>
          </div>
          <div className="lp-mural">
            {FOTOS_AULAS.map((src, i) => (
              <figure key={i} className={`lp-foto lp-foto-${i % 8}`}>
                <img src={src} alt="Aula da mentoria" loading="lazy" />
              </figure>
            ))}
          </div>
          {perfilInsta && (
            <div className="lp-centro">
              <a className="lp-botao lp-botao-contorno" href={perfilInsta} target="_blank" rel="noreferrer">Ver mais no Instagram @{arroba}</a>
            </div>
          )}
        </section>
      )}

      {/* 8. Planos */}
      {cfg.planos?.length > 0 && (
        <section className="lp-secao">
          <div className="lp-cabeca">
            <span className="lp-kicker">Planos</span>
            <h2>Escolha o <em>seu plano</em></h2>
          </div>
          <div className="lp-planos">
            {cfg.planos.map((p, i) => (
              <div key={i} className={p.destaque ? 'lp-plano destaque' : 'lp-plano'}>
                {p.destaque && cfg.planos.length > 1 && <span className="lp-plano-selo">Mais escolhido</span>}
                <h3>{p.nome}</h3>
                {p.preco && <div className="lp-preco">{p.preco}</div>}
                <ul>{(p.itens || []).map((it, k) => <li key={k}>{it}</li>)}</ul>
                {contato && <a className="lp-botao lp-botao-cheio" href={contato} target="_blank" rel="noreferrer">{p.preco ? 'Quero este plano' : 'Consultar valores'}</a>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 9. Escassez verdadeira + lista */}
      <div className="lp-escassez">
        <strong>Atendo poucos alunos para manter a qualidade.</strong> As vagas para 2027 são limitadas. Entre na lista para saber primeiro quando abrirem.
      </div>
      <FormInteresse />

      {/* 10. Dúvidas */}
      <section className="lp-secao">
        <div className="lp-cabeca">
          <span className="lp-kicker">Dúvidas</span>
          <h2>Perguntas <em>frequentes</em></h2>
        </div>
        <div className="lp-faq">
          {FAQ.map(([p, r]) => (
            <details key={p}>
              <summary>{p}</summary>
              <p>{r}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 11. Chamada final */}
      <section className="lp-final">
        <h2>O próximo resultado pode ser <em>o do seu filho</em></h2>
        <p>Me chama no WhatsApp e eu explico como funciona a mentoria de 2027.</p>
        <div className="lp-ctas lp-ctas-centro">
          {contato && <a className="lp-botao lp-botao-cheio" href={contato} target="_blank" rel="noreferrer">💬 Falar comigo no WhatsApp</a>}
        </div>
      </section>

      <footer className="lp-rodape">
        <span>{NOME_SITE} · {NOME_MENTOR}</span>
        <button className="lp-link" onClick={onEntrar}>Área do aluno</button>
      </footer>

      {wpp2027 && (
        <a className="lp-zap-fixo" href={wpp2027} target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp">
          <span aria-hidden="true">💬</span><span className="lp-zap-texto">WhatsApp</span>
        </a>
      )}
    </div>
  )
}

// Junta, por aluno, cada evolução "Área: de X para Y" e a fala dele
function evolucoesPorAluno(depoimentos) {
  const alunos = []
  for (const d of depoimentos) {
    const areas = []
    for (const parte of String(d.resultado || '').split('·')) {
      const m = parte.match(/^\s*([^:]+):\s*de\s*(\d+)\s*para\s*(\d+)/i)
      if (m && Number(m[3]) > Number(m[2])) areas.push({ area: m[1].trim(), de: Number(m[2]), para: Number(m[3]) })
    }
    if (!areas.length) continue
    let a = alunos.find((x) => x.nome === d.nome)
    if (!a) alunos.push((a = { nome: d.nome, foto: d.foto_url, areas: [], fala: '' }))
    a.areas.push(...areas)
    if (!a.fala) a.fala = d.texto
  }
  return alunos
}

const pct = (n) => Math.round((n / 45) * 100)

function AntesDepois({ depoimentos }) {
  const alunos = evolucoesPorAluno(depoimentos)
  if (!alunos.length) return null
  return (
    <section className="lp-secao">
      <div className="lp-cabeca">
        <span className="lp-kicker">Evolução dos alunos</span>
        <h2>Resultados de <em>alunos reais</em></h2>
        <p>Quanto esses alunos subiram nos simulados. Cada área do ENEM tem 45 questões.</p>
      </div>
      <div className="lp-evo">
        {alunos.map((a) => (
          <article key={a.nome} className="lp-evo-cartao">
            <header>
              <Avatar src={a.foto} nome={a.nome} tamanho={44} />
              <div>
                <strong>{a.nome}</strong>
                <span>Aluno(a) da mentoria</span>
              </div>
            </header>
            {a.areas.map((x) => (
              <div key={x.area} className="lp-evo-area">
                <div className="lp-evo-topo">
                  <span>{x.area}</span>
                  <b>+{x.para - x.de} acertos</b>
                </div>
                <div className="lp-evo-numeros">
                  <div><small>No começo</small><em>{x.de}</em><small>{pct(x.de)}% de acerto</small></div>
                  <span className="lp-evo-seta" aria-hidden="true">→</span>
                  <div className="agora"><small>Agora</small><em>{x.para}</em><small>{pct(x.para)}% de acerto</small></div>
                </div>
                <div className="lp-evo-trilho" aria-hidden="true">
                  <i className="antes" style={{ width: `${pct(x.de)}%` }} />
                  <i className="depois" style={{ left: `${pct(x.de)}%`, width: `${pct(x.para) - pct(x.de)}%` }} />
                </div>
              </div>
            ))}
            {a.fala && <p className="lp-evo-fala">“{a.fala}”</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

// "de 25 para 37" -> { de: 25, para: 37 }
function evolucao(resultado) {
  const m = (resultado || '').match(/de\s*(\d+)\s*para\s*(\d+)/i)
  return m ? { de: Number(m[1]), para: Number(m[2]) } : null
}

// Feedbacks dos alunos no estilo de conversa do Instagram: um cartão por aluno com as mensagens dele
function Feedbacks({ depoimentos }) {
  if (!depoimentos.length) return null
  const porAluno = []
  for (const d of depoimentos) {
    let g = porAluno.find((x) => x.nome === d.nome)
    if (!g) porAluno.push((g = { nome: d.nome, foto: d.foto_url, mensagens: [] }))
    if (!g.foto && d.foto_url) g.foto = d.foto_url
    g.mensagens.push(d)
  }
  const resultados = depoimentos.filter((d) => d.resultado && !evolucao(d.resultado) && /acert|quest|nota|pontos/i.test(d.resultado))

  return (
    <section className="lp-secao lp-feedbacks" id="feedbacks">
      <div className="lp-cabeca">
        <span className="lp-kicker">Feedbacks reais</span>
        <h2>O que os alunos <em>estão dizendo</em></h2>
        <p>Mensagens que chegaram no direct e no WhatsApp, com autorização de quem mandou.</p>
      </div>

      <div className="lp-conversas">
        {porAluno.map((g, i) => (
          <article key={g.nome} className={`lp-conversa lp-conversa-${i % 4}`}>
            <header className="lp-conversa-topo">
              <span className="lp-conversa-avatar"><Avatar src={g.foto} nome={g.nome} tamanho={40} /></span>
              <span>
                <strong>{g.nome}</strong>
                <small>Aluno(a) da mentoria</small>
              </span>
              <span className="lp-conversa-icones" aria-hidden="true">📞 ⓘ</span>
            </header>
            <div className="lp-conversa-corpo">
              {g.mensagens.map((d) => (
                <div key={d.id} className="lp-msg">
                  <p className="lp-balao">{d.texto}<span className="lp-coracao" aria-hidden="true">❤️</span></p>
                  {d.resultado && <span className="lp-msg-resultado">🏆 {d.resultado}</span>}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      {resultados.length > 0 && (
        <div className="lp-faixa lp-faixa-resultados" aria-hidden="true">
          <div className="lp-faixa-trilho">
            {[...resultados, ...resultados, ...resultados, ...resultados].map((d, i) => <span key={i}>{d.resultado}<i>✦</i></span>)}
          </div>
        </div>
      )}
    </section>
  )
}
