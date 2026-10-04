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

export function linkWhatsApp(numero, texto) {
  const n = (numero || '').replace(/\D/g, '')
  if (!n) return null
  return `https://wa.me/${n.length <= 11 ? '55' + n : n}?text=${encodeURIComponent(texto)}`
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
  const insta = cfg.instagram ? `https://ig.me/m/${cfg.instagram.replace('@', '')}` : null

  return (
    <div className="landing">
      <header className="land-topo">
        <div className="topo-marca">
          <Avatar src={fotoMentor} nome={NOME_MENTOR} tamanho={38} />
          <strong>{NOME_SITE}</strong>
        </div>
        <button className="botao" onClick={onEntrar}>Área do aluno</button>
      </header>

      <section className="land-hero">
        <div className="land-hero-texto">
          <span className="selo-mentor">Mentoria ENEM</span>
          <h1>{cfg.titulo}</h1>
          <p>{cfg.subtitulo}</p>
          <div className="land-ctas">
            {wpp && <a className="botao primario grande-cta" href={wpp} target="_blank" rel="noreferrer">💬 Chamar no WhatsApp</a>}
            {insta && <a className={wpp ? 'botao grande-cta' : 'botao primario grande-cta'} href={insta} target="_blank" rel="noreferrer">📸 Chamar no Instagram</a>}
            <button className="botao fantasma grande-cta" onClick={onEntrar}>Já sou aluno · Entrar</button>
          </div>
          {cfg.numeros?.length > 0 && (
            <div className="land-numeros">
              {cfg.numeros.map((n, i) => (
                <div key={i}><strong>{n.valor}</strong><span>{n.rotulo}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="land-hero-foto">
          <img src={FOTO_PERFIL} alt={`${NOME_MENTOR}, mentor`} />
        </div>
      </section>

      <section className="land-secao">
        <h2>Tudo o que você precisa num lugar só</h2>
        <div className="land-recursos">
          {RECURSOS.map(([ic, t, d]) => (
            <div key={t} className="land-recurso">
              <span className="land-icone" aria-hidden="true">{ic}</span>
              <strong>{t}</strong>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {cfg.planos?.length > 0 && (
        <section className="land-secao">
          <h2>Planos</h2>
          <div className="land-planos">
            {cfg.planos.map((p, i) => (
              <div key={i} className={p.destaque ? 'land-plano destaque' : 'land-plano'}>
                {p.destaque && <span className="selo selo-novo">Mais escolhido</span>}
                <h3>{p.nome}</h3>
                {p.preco && <div className="land-preco">{p.preco}</div>}
                <ul>{(p.itens || []).map((it, k) => <li key={k}>✓ {it}</li>)}</ul>
                {wpp && <a className="botao primario" href={wpp} target="_blank" rel="noreferrer">{p.preco ? 'Quero este plano' : 'Consultar valores'} no WhatsApp</a>}
                {insta && <a className={wpp ? 'botao' : 'botao primario'} href={insta} target="_blank" rel="noreferrer">{wpp ? 'Ou chamar no Instagram' : p.preco ? 'Quero este plano' : 'Consultar valores no Instagram'}</a>}
              </div>
            ))}
          </div>
        </section>
      )}

      {depoimentos.length > 0 && (
        <section className="land-secao">
          <h2>Quem já passou por aqui</h2>
          <div className="land-depoimentos">
            {depoimentos.map((d) => (
              <figure key={d.id} className="land-depoimento">
                <blockquote>“{d.texto}”</blockquote>
                <figcaption>
                  <Avatar src={d.foto_url} nome={d.nome} tamanho={40} />
                  <span><strong>{d.nome}</strong>{d.resultado && <small>{d.resultado}</small>}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {FOTOS_AULAS.length > 0 && (
        <section className="faixa-aulas land-faixa" aria-label="Fotos das aulas">
          <p className="faixa-titulo">Nas aulas da mentoria</p>
          <div className="faixa-trilho">
            {[...FOTOS_AULAS, ...FOTOS_AULAS].map((src, i) => (
              <img key={i} src={src} alt={i < FOTOS_AULAS.length ? 'Aula da mentoria' : ''} aria-hidden={i >= FOTOS_AULAS.length} loading="lazy" />
            ))}
          </div>
        </section>
      )}

      <section className="land-final">
        <h2>Bora montar o seu plano?</h2>
        <p>Me chama e eu te explico como funciona a mentoria.</p>
        <div className="land-ctas">
          {wpp && <a className="botao primario grande-cta" href={wpp} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
          {insta && <a className="botao grande-cta" href={insta} target="_blank" rel="noreferrer">📸 Instagram @{cfg.instagram.replace('@', '')}</a>}
        </div>
      </section>

      <footer className="land-rodape">
        <span>{NOME_SITE} · {NOME_MENTOR}</span>
        <button className="link" onClick={onEntrar}>Área do aluno</button>
      </footer>
    </div>
  )
}
