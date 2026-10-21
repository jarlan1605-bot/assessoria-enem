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

  useEffect(() => {
    supabase.from('site_config').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setCfg({ ...PADRAO, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== null)) })
    })
    supabase.from('depoimentos').select('*').eq('publicado', true).order('ordem').order('criado_em').then(({ data }) => setDepoimentos(data ?? []))
    supabase.rpc('foto_do_mentor').then(({ data }) => setFotoMentor(data || null))
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
        <button className="lp-botao lp-botao-pequeno" onClick={onEntrar}>Área do aluno</button>
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

      {depoimentos.length > 0 && (
        <section className="lp-secao">
          <div className="lp-cabeca">
            <span className="lp-kicker">Depoimentos</span>
            <h2>Quem já passou <em>por aqui</em></h2>
          </div>
          <div className="lp-depoimentos">
            {depoimentos.map((d) => (
              <figure key={d.id} className="lp-depoimento">
                <span className="lp-aspas" aria-hidden="true">“</span>
                <blockquote>{d.texto}</blockquote>
                <figcaption>
                  <Avatar src={d.foto_url} nome={d.nome} tamanho={42} />
                  <span><strong>{d.nome}</strong>{d.resultado && <small>{d.resultado}</small>}</span>
                </figcaption>
              </figure>
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
