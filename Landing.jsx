import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { NOME_SITE, NOME_MENTOR, INSTAGRAM, FOTO_PERFIL, FOTOS_AULAS } from './constants'
import Avatar from './Avatar'

const PADRAO = {
  titulo: 'Sua aprovação com um plano feito para você',
  subtitulo: 'Mentoria para o ENEM com horário de estudos personalizado, simulados acompanhados de perto e aulas individuais.',
  whatsapp: '',
  instagram: INSTAGRAM,
  planos: [],
  numeros: [],
}

const RECURSOS = [
  ['🗓️', 'Horário de estudos sob medida', 'Montado pelo seu mentor para a sua rotina, com check-in diário de cada bloco.'],
  ['📈', 'Evolução nos simulados', 'Gráficos de subida em cada área, metas e a área que mais precisa de foco.'],
  ['📕', 'Caderno de erros inteligente', 'Registre o que errou e revise no momento certo: 1, 7 e 30 dias depois.'],
  ['✍️', 'Redação corrigida por competência', 'Envie a foto da redação e receba nota nas 5 competências do ENEM.'],
  ['🎓', 'Aulas individuais', 'Marque aulas com o seu mentor direto pelo site, nos horários livres dele.'],
  ['📄', 'Relatório mensal', 'Um resumo do mês em PDF para você e sua família acompanharem o progresso.'],
]

const PASSOS = [
  ['Conversa inicial', 'Você me chama, eu entendo sua rotina, sua meta de curso e onde você está hoje.'],
  ['Plano sob medida', 'Monto o seu horário de estudos e as metas de cada área, do jeito que cabe no seu dia.'],
  ['Acompanhamento', 'Aulas, simulados e correções toda semana, com ajustes sempre que precisar.'],
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

  const wpp = linkWhatsApp(cfg.whatsapp, `Olá! Vi o site da ${NOME_SITE} e quero saber mais sobre a mentoria.`)
  const arroba = cfg.instagram ? cfg.instagram.replace('@', '') : ''
  const insta = arroba ? `https://ig.me/m/${arroba}` : null
  const perfilInsta = arroba ? `https://instagram.com/${arroba}` : null
  const [inicio, destaque] = partesTitulo(cfg.titulo)

  const ctas = (classe = '') => (
    <div className={`lp-ctas ${classe}`}>
      {wpp && <a className="lp-botao lp-botao-cheio" href={wpp} target="_blank" rel="noreferrer">💬 Chamar no WhatsApp</a>}
      {insta && <a className={wpp ? 'lp-botao lp-botao-contorno' : 'lp-botao lp-botao-cheio'} href={insta} target="_blank" rel="noreferrer">📸 Chamar no Instagram</a>}
    </div>
  )

  return (
    <div className="lp">
      <header className="lp-topo">
        <div className="lp-marca">
          <Avatar src={fotoMentor} nome={NOME_MENTOR} tamanho={36} />
          <strong>{NOME_SITE}</strong>
        </div>
        <div className="lp-topo-acoes">
          {mentores.length > 0 && <a className="lp-link lp-topo-link" href="#mentores">Mentores</a>}
          <button className="lp-botao lp-botao-pequeno" onClick={onEntrar}>Área do aluno</button>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-texto">
          <span className="lp-etiqueta">✦ Mentoria ENEM com {NOME_MENTOR}</span>
          <h1>
            {inicio} {destaque && <em>{destaque}</em>}
          </h1>
          <p className="lp-sub">{cfg.subtitulo}</p>
          {ctas()}
          <button className="lp-link" onClick={onEntrar}>Já sou aluno · entrar →</button>
          {cfg.numeros?.length > 0 && (
            <div className="lp-numeros">
              {cfg.numeros.map((n, i) => (
                <div key={i}><strong>{n.valor}</strong><span>{n.rotulo}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="lp-hero-foto">
          <div className="lp-arco">
            <img src={FOTO_PERFIL} alt={`${NOME_MENTOR}, mentor`} />
          </div>
          <span className="lp-adesivo lp-adesivo-1">📈 Simulados acompanhados</span>
          <span className="lp-adesivo lp-adesivo-2">🎯 Plano feito pra você</span>
          {arroba && <span className="lp-adesivo lp-adesivo-3">@{arroba}</span>}
        </div>
      </section>

      <div className="lp-faixa" aria-hidden="true">
        <div className="lp-faixa-trilho">
          {[...FAIXA, ...FAIXA, ...FAIXA, ...FAIXA].map((t, i) => <span key={i}>{t}<i>✦</i></span>)}
        </div>
      </div>

      <Feedbacks depoimentos={depoimentos} />

      {FOTOS_AULAS.length > 0 && (
        <section className="lp-secao">
          <div className="lp-cabeca">
            <span className="lp-kicker">Por dentro das aulas</span>
            <h2>Estudar junto <em>dá resultado</em></h2>
            <p>Aulas ao vivo, resolução de questões na tela e muita conversa sobre o que cai no ENEM.</p>
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

      {mentores.length > 0 && (
        <section className="lp-secao" id="mentores">
          <div className="lp-cabeca">
            <span className="lp-kicker">Quem vai te acompanhar</span>
            <h2>Conheça os <em>mentores</em></h2>
            <p>Gente que já passou pelo ENEM e sabe o caminho. Escolha com quem você quer estudar.</p>
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

      <section className="lp-secao">
        <div className="lp-cabeca">
          <span className="lp-kicker">O que você recebe</span>
          <h2>Tudo num lugar <em>só</em></h2>
        </div>
        <div className="lp-recursos">
          {RECURSOS.map(([ic, t, d], i) => (
            <div key={t} className="lp-recurso">
              <div className="lp-recurso-topo">
                <span className="lp-icone" aria-hidden="true">{ic}</span>
                <span className="lp-num">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <strong>{t}</strong>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-secao lp-passos-secao">
        <div className="lp-cabeca">
          <span className="lp-kicker">Como funciona</span>
          <h2>Três passos até <em>a sua vaga</em></h2>
        </div>
        <ol className="lp-passos">
          {PASSOS.map(([t, d], i) => (
            <li key={t}>
              <span className="lp-passo-num">{i + 1}</span>
              <strong>{t}</strong>
              <p>{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {cfg.planos?.length > 0 && (
        <section className="lp-secao">
          <div className="lp-cabeca">
            <span className="lp-kicker">Planos</span>
            <h2>Escolha o <em>seu ritmo</em></h2>
          </div>
          <div className="lp-planos">
            {cfg.planos.map((p, i) => (
              <div key={i} className={p.destaque ? 'lp-plano destaque' : 'lp-plano'}>
                {p.destaque && <span className="lp-plano-selo">Mais escolhido</span>}
                <h3>{p.nome}</h3>
                {p.preco && <div className="lp-preco">{p.preco}</div>}
                <ul>{(p.itens || []).map((it, k) => <li key={k}>{it}</li>)}</ul>
                {wpp && <a className="lp-botao lp-botao-cheio" href={wpp} target="_blank" rel="noreferrer">{p.preco ? 'Quero este plano' : 'Consultar valores'}</a>}
                {insta && <a className={wpp ? 'lp-botao lp-botao-contorno' : 'lp-botao lp-botao-cheio'} href={insta} target="_blank" rel="noreferrer">{wpp ? 'Chamar no Instagram' : p.preco ? 'Quero este plano' : 'Consultar valores'}</a>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="lp-final">
        <h2>Bora montar o <em>seu plano?</em></h2>
        <p>Me chama e eu te explico como funciona a mentoria.</p>
        {ctas('lp-ctas-centro')}
      </section>

      <footer className="lp-rodape">
        <span>{NOME_SITE} · {NOME_MENTOR}</span>
        <button className="lp-link" onClick={onEntrar}>Área do aluno</button>
      </footer>
    </div>
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
  const destaques = depoimentos.map((d) => ({ d, ev: evolucao(d.resultado) })).filter((x) => x.ev && x.ev.para > x.ev.de)
  const resultados = depoimentos.filter((d) => d.resultado && !evolucao(d.resultado) && /acert|quest|nota|pontos/i.test(d.resultado))

  return (
    <section className="lp-secao lp-feedbacks" id="feedbacks">
      <div className="lp-cabeca">
        <span className="lp-kicker">Feedbacks reais</span>
        <h2>O que os alunos <em>estão dizendo</em></h2>
        <p>Mensagens que chegaram no direct e no WhatsApp, com autorização de quem mandou.</p>
      </div>

      {destaques.length > 0 && (
        <div className="lp-subidas">
          {destaques.map(({ d, ev }) => (
            <div key={d.id} className="lp-subida">
              <span className="lp-subida-num">+{ev.para - ev.de}</span>
              <span className="lp-subida-de">{ev.de} → {ev.para}</span>
              <span className="lp-subida-legenda">{d.resultado.split(':')[0]} · {d.nome}</span>
            </div>
          ))}
        </div>
      )}

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
