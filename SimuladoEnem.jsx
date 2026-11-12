import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { checarXp } from './xp'
import CartaoResposta from './CartaoResposta'
import { supabase } from './supabase'
import { AREAS } from './constants'
import { TextoQuestao } from './QuestaoCartao'
import { LETRAS, nomeArea, corArea } from './questoes-util'

/*
  Simulado ENEM na plataforma
  - Agendado (CEO/mentor marca dia e hora; todos fazem juntos; resultado só quando for liberado)
  - Livre (o aluno escolhe a prova, a parte e o tempo; resultado na hora)
  O tempo é controlado pelo banco: depois do fim, nada mais é aceito.
*/

const COMPOSICOES = [
  { k: 'dia1', nome: '1º dia — Linguagens e Humanas', areas: ['linguagens', 'humanas'], min: 300 },
  { k: 'dia2', nome: '2º dia — Natureza e Matemática', areas: ['natureza', 'matematica'], min: 300 },
  { k: 'linguagens', nome: 'Só Linguagens', areas: ['linguagens'], min: 150 },
  { k: 'humanas', nome: 'Só Humanas', areas: ['humanas'], min: 150 },
  { k: 'natureza', nome: 'Só Natureza', areas: ['natureza'], min: 150 },
  { k: 'matematica', nome: 'Só Matemática', areas: ['matematica'], min: 150 },
]
const nomeComposicao = (k) => COMPOSICOES.find((c) => c.k === k)?.nome ?? k
const ORDEM_AREA = { linguagens: 0, humanas: 1, natureza: 2, matematica: 3 }

// "ENEM 2024 — 1º dia — Caderno Azul — Inglês" e "ENEM 2024 — 2º dia — Caderno Azul" viram a mesma prova
export function chaveProva(prova) {
  return (prova || '')
    .replace(/\s+—\s+(Inglês|Espanhol)\s*$/i, '')
    .replace(/\s+—\s+[12]º dia(?=\s|$)/, '')
    .replace(/\s+[12]º dia\s+/, ' ')
    .replace(/\s+—\s+\(/, ' (')
    .replace(/\s+/g, ' ')
    .trim()
}
const linguaDaProva = (prova) => (/—\s*Inglês\s*$/i.test(prova) ? 'ingles' : /—\s*Espanhol\s*$/i.test(prova) ? 'espanhol' : null)

const EN = new Set('the of and to is in that it you for with are was this be have not they their your from what which can will'.split(' '))
const ES = new Set('el los las una del es y más pero muy también sus este esta son hay qué cuando donde porque entre sobre fue'.split(' '))
function linguaDoTexto(t) {
  const p = (t || '').toLowerCase().normalize('NFC').match(/[a-záéíóúñü]+/g) || []
  let en = 0
  let es = 0
  for (const w of p) {
    if (EN.has(w)) en++
    if (ES.has(w)) es++
  }
  if (en >= 3 && en > es * 1.5) return 'ingles'
  if (es >= 3 && es > en * 1.5) return 'espanhol'
  return null
}

async function buscarTudo(fazer) {
  let tudo = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await fazer().range(de, de + 999)
    if (error) return { error }
    tudo = tudo.concat(data ?? [])
    if (!data || data.length < 1000) return { data: tudo }
  }
}

async function buscarPorIds(ids, campos) {
  const m = new Map()
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error } = await supabase.from('questoes').select(campos).in('id', ids.slice(i, i + 80))
    if (error) throw new Error(error.message)
    for (const q of data ?? []) m.set(q.id, q)
  }
  return ids.map((id) => m.get(id)).filter(Boolean)
}

// Provas do banco agrupadas (por ano/aplicação), com as questões leves de cada uma
function agruparProvas(indice) {
  const grupos = new Map()
  for (const q of indice) {
    const k = chaveProva(q.prova)
    if (!k) continue
    if (!grupos.has(k)) grupos.set(k, { chave: k, ano: q.ano, questoes: [], porArea: {} })
    const g = grupos.get(k)
    g.questoes.push(q)
    g.porArea[q.area] = (g.porArea[q.area] || 0) + 1
  }
  return [...grupos.values()].sort((a, b) => (b.ano || 0) - (a.ano || 0) || a.chave.localeCompare(b.chave))
}

// Monta a lista de questões (na ordem do ENEM) para a parte escolhida
async function montarQuestoes(grupo, composicao, lingua) {
  const comp = COMPOSICOES.find((c) => c.k === composicao)
  let qs = grupo.questoes.filter((q) => comp.areas.includes(q.area))
  if (comp.areas.includes('linguagens')) {
    const le = qs.filter((q) => q.area === 'linguagens' && (q.materia === 'Língua estrangeira' || linguaDaProva(q.prova)))
    const semLingua = le.filter((q) => !linguaDaProva(q.prova))
    const detectada = new Map()
    if (semLingua.length) {
      const textos = await buscarPorIds(semLingua.map((q) => q.id), 'id, enunciado, alternativas')
      for (const t of textos) detectada.set(t.id, linguaDoTexto(`${t.enunciado} ${Object.values(t.alternativas || {}).join(' ')}`))
    }
    const fora = new Set(le.filter((q) => {
      const l = linguaDaProva(q.prova) || detectada.get(q.id)
      return l && l !== lingua
    }).map((q) => q.id))
    qs = qs.filter((q) => !fora.has(q.id))
  }
  const ehLE = (q) => (q.area === 'linguagens' && (q.materia === 'Língua estrangeira' || linguaDaProva(q.prova)) ? 0 : 1)
  qs.sort((a, b) => ORDEM_AREA[a.area] - ORDEM_AREA[b.area] || ehLE(a) - ehLE(b) || (a.numero ?? 9999) - (b.numero ?? 9999) || a.id.localeCompare(b.id))
  return qs.map((q) => q.id)
}

const relogio = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fimDe = (a) => new Date(new Date(a.inicio).getTime() + a.duracao_min * 60000)
const msgErro = (e) => (e?.message || String(e)).replace(/^.*?:\s*(?=[A-ZÁÉÍÓÚ])/, '')

function useAgora(passo = 1000) {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), passo)
    return () => clearInterval(t)
  }, [passo])
  return agora
}

// ---------------------------------------------------------------------------------
export default function SimuladoEnem({ perfil, ehMentor }) {
  const [emProva, setEmProva] = useState(null) // { id, offset }
  const [vendo, setVendo] = useState(null) // id da tentativa para ver o resultado
  const [indice, setIndice] = useState(null)
  const [agendados, setAgendados] = useState([])
  const [minhas, setMinhas] = useState([])
  const [erro, setErro] = useState('')
  const [versao, setVersao] = useState(0)
  const [foco, setFoco] = useState(false)

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [ind, ag, mt] = await Promise.all([
        buscarTudo(() => supabase.from('questoes').select('id, prova, ano, area, materia, numero').order('id')),
        supabase.rpc('simulados_agendados_lista'),
        supabase.from('simulado_tentativas').select('id, agendado_id, titulo, prova, composicao, inicio, fim, enviado_em, questao_ids, simulado_resultados(acertos, total, por_area)').eq('aluno_id', perfil.id).order('inicio', { ascending: false }),
      ])
      if (!vivo) return
      if (ag.error) setErro('A aba de simulados ainda não foi ativada no banco (arquivo simulado_enem.sql).')
      setIndice(ind.data ?? [])
      setAgendados(ag.data ?? [])
      const lista = mt.data ?? []
      setMinhas(lista)
      // provas que ficaram abertas e cujo tempo já acabou: entrega o que estava salvo
      const vencidas = lista.filter((t) => !t.enviado_em && new Date(t.fim).getTime() + 60000 < Date.now())
      if (vencidas.length) {
        await Promise.all(vencidas.map((t) => supabase.rpc('entregar_simulado', { p_tentativa: t.id, p_respostas: null })))
        if (vivo) recarregar()
      }
    })()
    return () => { vivo = false }
  }, [perfil.id, versao, recarregar])

  const provas = useMemo(() => (indice ? agruparProvas(indice) : []), [indice])

  async function comecar(fn) {
    setErro('')
    try {
      const { data, error } = await fn()
      if (error) throw error
      const r = Array.isArray(data) ? data[0] : data
      const offset = new Date(r.agora).getTime() - Date.now()
      try { localStorage.setItem('simuladoOffset:' + r.tentativa_id, String(offset)) } catch { /* ok */ }
      setEmProva({ id: r.tentativa_id, offset })
    } catch (e) {
      setErro(msgErro(e))
    }
  }

  if (emProva) {
    return <FazendoProva tentativaId={emProva.id} offset={emProva.offset} onSair={(id) => { setEmProva(null); setVendo(id || null); recarregar() }} />
  }
  if (vendo) {
    const t = minhas.find((x) => x.id === vendo)
    return <VerResultado tentativaId={vendo} resumo={t} onVoltar={() => setVendo(null)} />
  }

  const abertas = minhas.filter((t) => !t.enviado_em && new Date(t.fim).getTime() > Date.now())

  return (
    <section className="secao se">
      {erro && <p className="erro">{erro}</p>}

      {!foco && abertas.length > 0 && (
        <div className="cartao se-aviso">
          <strong>Você tem uma prova em andamento</strong>
          {abertas.map((t) => (
            <button key={t.id} className="botao primario" onClick={() => {
              let off = 0
              try { off = Number(localStorage.getItem('simuladoOffset:' + t.id)) || 0 } catch { /* ok */ }
              setEmProva({ id: t.id, offset: off })
            }}>Voltar para “{t.titulo}” →</button>
          ))}
        </div>
      )}

      {!foco && ehMentor && <PainelEquipe provas={provas} carregando={!indice} onMudou={recarregar} />}

      {!foco && <Agendados agendados={agendados} minhas={minhas} onComecar={(id) => comecar(() => supabase.rpc('iniciar_simulado_agendado', { p_agendado: id }))} onVer={setVendo} />}

      {!foco && <SimuladoLivre provas={provas} carregando={!indice} agendados={agendados}
        onComecar={(titulo, prova, composicao, ids, minutos) => comecar(() => supabase.rpc('iniciar_simulado_livre', { p_titulo: titulo, p_prova: prova, p_composicao: composicao, p_questao_ids: ids, p_minutos: minutos }))} />}

      <CartaoResposta ehMentor={ehMentor} onFoco={setFoco} />

      {!foco && <MeusSimulados minhas={minhas} agendados={agendados} onVer={setVendo} />}
    </section>
  )
}

// ---------------------------------------------------------------------------------
function Agendados({ agendados, minhas, onComecar, onVer }) {
  const agora = useAgora(1000)
  const visiveis = agendados.filter((a) => fimDe(a).getTime() > agora || a.minha_tentativa)
  if (!visiveis.length) return null
  return (
    <div className="cartao se-bloco">
      <h3>📅 Simulados agendados</h3>
      <div className="se-lista">
        {visiveis.map((a) => {
          const ini = new Date(a.inicio).getTime()
          const fim = fimDe(a).getTime()
          const minha = minhas.find((t) => t.id === a.minha_tentativa)
          const aoVivo = agora >= ini && agora < fim
          let acao
          if (minha?.enviado_em || (minha && agora >= fim)) {
            acao = a.resultado_liberado
              ? <button className="botao primario" onClick={() => onVer(minha.id)}>Ver meu resultado</button>
              : <span className="selo">Entregue · resultado em breve</span>
          } else if (aoVivo) {
            acao = <button className="botao primario se-pulsa" onClick={() => onComecar(a.id)}>{minha ? 'Continuar a prova →' : 'Começar agora →'}</button>
          } else if (agora < ini) {
            acao = <span className="se-contagem">Começa em <b>{relogio(ini - agora)}</b></span>
          } else {
            acao = <span className="selo">Encerrado{minha ? '' : ' · você não fez'}</span>
          }
          return (
            <div key={a.id} className={aoVivo ? 'se-item ao-vivo' : 'se-item'}>
              <div>
                <strong>{a.titulo}</strong>
                <span className="suave pequeno">{dataHora(a.inicio)} · {Math.round(a.duracao_min / 60 * 10) / 10}h de prova · {a.n_questoes} questões · {nomeComposicao(a.composicao)}</span>
                {aoVivo && !minha && agora > ini + 60000 && <span className="pequeno se-atraso">Começou há {Math.floor((agora - ini) / 60000)} min: o tempo que passou não volta.</span>}
              </div>
              {acao}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------
function EscolhaProva({ provas, valor, onChange }) {
  const [busca, setBusca] = useState('')
  const filtradas = provas.filter((p) => p.chave.toLowerCase().includes(busca.toLowerCase()))
  return (
    <div className="se-escolha">
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar prova (ex.: 2023, PPL)…" />
      <select value={valor} onChange={(e) => onChange(e.target.value)} size={Math.min(8, Math.max(3, filtradas.length))}>
        {filtradas.map((p) => (
          <option key={p.chave} value={p.chave}>{p.chave} — {AREAS.filter((a) => p.porArea[a.chave]).map((a) => a.curto).join(' · ')}</option>
        ))}
      </select>
    </div>
  )
}

function OpcoesParte({ grupo, composicao, setComposicao, lingua, setLingua }) {
  const disponiveis = COMPOSICOES.filter((c) => c.areas.every((a) => grupo?.porArea[a]))
  const comp = COMPOSICOES.find((c) => c.k === composicao)
  return (
    <>
      <div className="se-chips">
        {disponiveis.map((c) => (
          <button type="button" key={c.k} className={composicao === c.k ? 'botao pequeno primario' : 'botao pequeno'} onClick={() => setComposicao(c.k)}>{c.nome}</button>
        ))}
      </div>
      {comp?.areas.includes('linguagens') && (
        <div className="se-chips">
          <span className="suave pequeno">Língua estrangeira:</span>
          {[['ingles', 'Inglês'], ['espanhol', 'Espanhol']].map(([k, n]) => (
            <button type="button" key={k} className={lingua === k ? 'botao pequeno primario' : 'botao pequeno'} onClick={() => setLingua(k)}>{n}</button>
          ))}
        </div>
      )}
    </>
  )
}

function SimuladoLivre({ provas, carregando, agendados, onComecar }) {
  const agora = useAgora(5000)
  const [prova, setProva] = useState('')
  const [composicao, setComposicao] = useState('dia1')
  const [lingua, setLingua] = useState('ingles')
  const [minutos, setMinutos] = useState(300)
  const [montando, setMontando] = useState(false)
  const [erro, setErro] = useState('')
  const grupo = provas.find((p) => p.chave === prova)
  const aoVivo = agendados.some((a) => agora >= new Date(a.inicio).getTime() && agora < fimDe(a).getTime())

  useEffect(() => {
    if (!grupo) return
    const ok = COMPOSICOES.filter((c) => c.areas.every((a) => grupo.porArea[a]))
    if (!ok.some((c) => c.k === composicao) && ok[0]) setComposicao(ok[0].k)
  }, [grupo, composicao])
  useEffect(() => { setMinutos(COMPOSICOES.find((c) => c.k === composicao)?.min ?? 150) }, [composicao])

  async function iniciar() {
    setErro('')
    if (!grupo) return setErro('Escolha a prova.')
    const m = Math.round(Number(minutos))
    if (!(m >= 5 && m <= 600)) return setErro('Coloque um tempo entre 5 e 600 minutos.')
    setMontando(true)
    try {
      const ids = await montarQuestoes(grupo, composicao, lingua)
      if (!ids.length) throw new Error('Essa parte não tem questões nessa prova.')
      if (!confirm(`Começar agora: ${grupo.chave} · ${nomeComposicao(composicao)} · ${ids.length} questões · ${m} minutos?\n\nQuando o tempo acabar, a prova é entregue sozinha e não dá mais para mudar nada.`)) return
      await onComecar(`${grupo.chave} · ${nomeComposicao(composicao)}`, grupo.chave, composicao, ids, m)
    } catch (e) {
      setErro(msgErro(e))
    } finally {
      setMontando(false)
    }
  }

  return (
    <div className="cartao se-bloco">
      <h3>🧠 Fazer um simulado agora</h3>
      <p className="suave pequeno" style={{ marginTop: 0 }}>Escolha uma prova do banco, a parte e o tempo. O resultado sai assim que você entregar.</p>
      {aoVivo ? (
        <p className="aviso-info">Agora está acontecendo um simulado agendado. O simulado livre volta quando ele terminar.</p>
      ) : carregando ? <p className="suave">Carregando provas…</p> : (
        <div className="se-form">
          <EscolhaProva provas={provas} valor={prova} onChange={setProva} />
          {grupo && (
            <>
              <OpcoesParte grupo={grupo} composicao={composicao} setComposicao={setComposicao} lingua={lingua} setLingua={setLingua} />
              <label className="se-tempo">Tempo de prova (minutos)
                <input type="number" min="5" max="600" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
                <span className="suave pequeno">≈ {Math.floor(minutos / 60)}h{String(Math.round(minutos % 60)).padStart(2, '0')}</span>
              </label>
              {erro && <p className="erro">{erro}</p>}
              <button className="botao primario grande" onClick={iniciar} disabled={montando}>{montando ? 'Montando a prova…' : 'Começar simulado →'}</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MeusSimulados({ minhas, agendados, onVer }) {
  const feitas = minhas.filter((t) => t.enviado_em)
  if (!feitas.length) return null
  return (
    <div className="cartao se-bloco">
      <h3>📊 Meus simulados</h3>
      <div className="se-lista">
        {feitas.map((t) => {
          const r = t.simulado_resultados
          const res = Array.isArray(r) ? r[0] : r
          const ag = t.agendado_id ? agendados.find((a) => a.id === t.agendado_id) : null
          return (
            <div key={t.id} className="se-item">
              <div>
                <strong>{t.titulo}</strong>
                <span className="suave pequeno">{dataHora(t.inicio)}{ag ? ' · agendado' : ''}</span>
              </div>
              {res ? (
                <button className="botao" onClick={() => onVer(t.id)}><b>{res.acertos}/{res.total}</b>&nbsp;acertos · ver correção</button>
              ) : <span className="selo">Resultado ainda não liberado</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------
function FazendoProva({ tentativaId, offset, onSair }) {
  const [t, setT] = useState(null)
  const [questoes, setQuestoes] = useState([])
  const [resp, setResp] = useState({})
  const [atual, setAtual] = useState(0)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState('')
  const [entregando, setEntregando] = useState(false)
  const [final, setFinal] = useState(null)
  const agora = useAgora(500) + offset
  const timer = useRef(null)
  const respRef = useRef({})
  const entregueRef = useRef(false)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.from('simulado_tentativas').select('id, titulo, questao_ids, respostas, fim, enviado_em, agendado_id').eq('id', tentativaId).single()
      if (error) return setErro(error.message)
      setT(data)
      setResp(data.respostas || {})
      respRef.current = data.respostas || {}
      try {
        setQuestoes(await buscarPorIds(data.questao_ids, 'id, area, materia, prova, enunciado, imagens, alternativas'))
      } catch (e) { setErro(msgErro(e)) }
    })()
  }, [tentativaId])

  const fim = t ? new Date(t.fim).getTime() : 0
  const restante = fim - agora

  const entregar = useCallback(async (automatico) => {
    if (entregueRef.current) return
    entregueRef.current = true
    setEntregando(true)
    clearTimeout(timer.current)
    const { data, error } = await supabase.rpc('entregar_simulado', { p_tentativa: tentativaId, p_respostas: respRef.current })
    setEntregando(false)
    if (error) { entregueRef.current = false; return setErro(msgErro(error)) }
    setFinal({ ...data, automatico })
    checarXp()
  }, [tentativaId])

  useEffect(() => {
    if (t && !t.enviado_em && restante <= 0 && !entregueRef.current) entregar(true)
  }, [t, restante, entregar])

  function marcar(qid, L) {
    if (restante <= 0 || entregueRef.current) return
    const novo = { ...respRef.current }
    if (novo[qid] === L) delete novo[qid]
    else novo[qid] = L
    respRef.current = novo
    setResp(novo)
    setSalvo('salvando')
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const { error } = await supabase.rpc('salvar_respostas_simulado', { p_tentativa: tentativaId, p_respostas: respRef.current })
      setSalvo(error ? 'erro' : 'ok')
    }, 1200)
  }

  if (final) {
    return (
      <section className="secao se">
        <div className="cartao se-final">
          <span className="se-emoji">{final.automatico ? '⏰' : '✅'}</span>
          <h2>{final.automatico ? 'Tempo esgotado: prova entregue' : 'Prova entregue!'}</h2>
          {final.liberado ? (
            <>
              <p className="se-nota"><b>{final.acertos}</b> de {final.total} acertos</p>
              <PorArea por={final.por_area} />
            </>
          ) : <p>O resultado sai quando a equipe liberar. Fique de olho aqui na aba.</p>}
          <button className="botao primario" onClick={() => onSair(final.liberado ? tentativaId : null)}>{final.liberado ? 'Ver a correção →' : 'Voltar'}</button>
        </div>
      </section>
    )
  }
  if (erro && !t) return <p className="erro">{erro}</p>
  if (!t || !questoes.length) return <p className="suave">Abrindo a prova…</p>
  if (t.enviado_em) return <div className="cartao"><p>Essa prova já foi entregue.</p><button className="botao" onClick={() => onSair(null)}>Voltar</button></div>

  const q = questoes[atual]
  const respondidas = questoes.filter((x) => resp[x.id]).length
  const soLetras = LETRAS.every((L) => q.alternativas?.[L] === undefined || q.alternativas?.[L] === '' || q.alternativas?.[L] === '{{alt}}')
  const urgente = restante < 5 * 60000

  return (
    <section className="secao se se-prova">
      <div className={urgente ? 'se-barra urgente' : 'se-barra'}>
        <strong className="se-titulo">{t.titulo}</strong>
        <span className="se-relogio" aria-live="polite">⏱ {relogio(restante)}</span>
        <span className="suave pequeno">{respondidas}/{questoes.length} marcadas{salvo === 'ok' ? ' · salvo' : salvo === 'salvando' ? ' · salvando…' : salvo === 'erro' ? ' · erro ao salvar' : ''}</span>
        <button className="botao primario" disabled={entregando} onClick={() => {
          const faltam = questoes.length - respondidas
          if (confirm(faltam ? `Ainda faltam ${faltam} questões sem marcar. Entregar mesmo assim?` : 'Entregar a prova agora?')) entregar(false)
        }}>{entregando ? 'Entregando…' : 'Entregar prova'}</button>
      </div>
      {erro && <p className="erro">{erro}</p>}

      <div className="se-grade" aria-label="Questões">
        {questoes.map((x, i) => (
          <button key={x.id} className={['se-num', i === atual ? 'atual' : '', resp[x.id] ? 'feita' : ''].join(' ')} style={{ '--cor': corArea(x.area) }} onClick={() => setAtual(i)} title={nomeArea(x.area)}>{i + 1}</button>
        ))}
      </div>

      <article className="cartao questao se-questao" style={{ '--cor': corArea(q.area) }}>
        <header className="q-topo">
          <div className="q-selos">
            <span className="q-indice">{atual + 1}</span>
            <span className="selo" style={{ background: corArea(q.area), color: '#fff' }}>{nomeArea(q.area)}</span>
          </div>
        </header>
        <TextoQuestao texto={q.enunciado} imagens={q.imagens} />
        <div className={soLetras ? 'q-alts q-alts-letras' : 'q-alts'}>
          {LETRAS.filter((L) => q.alternativas?.[L] !== undefined && q.alternativas?.[L] !== '').map((L) => (
            <button key={L} type="button" className={resp[q.id] === L ? 'q-alt escolhida' : 'q-alt'} onClick={() => marcar(q.id, L)} disabled={restante <= 0}>
              <span className="q-letra">{L}</span>
              {q.alternativas[L] === '{{alt}}' ? null : <TextoQuestao texto={q.alternativas[L]} imagens={q.imagens} className="q-alt-texto" />}
            </button>
          ))}
        </div>
        <div className="linha-botoes">
          <button className="botao" disabled={atual === 0} onClick={() => { setAtual(atual - 1); window.scrollTo({ top: 0 }) }}>← Anterior</button>
          <button className="botao primario" disabled={atual === questoes.length - 1} onClick={() => { setAtual(atual + 1); window.scrollTo({ top: 0 }) }}>Próxima →</button>
        </div>
      </article>
    </section>
  )
}

function PorArea({ por }) {
  const itens = AREAS.filter((a) => por?.[a.chave])
  if (!itens.length) return null
  return (
    <div className="se-areas">
      {itens.map((a) => (
        <div key={a.chave} className="se-area" style={{ '--cor': a.cor }}>
          <span>{a.nome}</span>
          <b>{por[a.chave].acertos}/{por[a.chave].total}</b>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------------
function VerResultado({ tentativaId, resumo, onVoltar }) {
  const [t, setT] = useState(null)
  const [qs, setQs] = useState([])
  const [aberta, setAberta] = useState(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.from('simulado_tentativas').select('id, titulo, questao_ids, respostas, simulado_resultados(acertos, total, por_area)').eq('id', tentativaId).single()
      if (error) return setErro(error.message)
      const r = Array.isArray(data.simulado_resultados) ? data.simulado_resultados[0] : data.simulado_resultados
      if (!r) return setErro('O resultado ainda não foi liberado.')
      setT({ ...data, r })
      try { setQs(await buscarPorIds(data.questao_ids, 'id, area, materia, assunto, prova, enunciado, imagens, alternativas, gabarito, comentario')) } catch (e) { setErro(msgErro(e)) }
    })()
  }, [tentativaId])

  if (erro) return <div className="cartao"><p className="erro">{erro}</p><button className="botao" onClick={onVoltar}>Voltar</button></div>
  if (!t) return <p className="suave">Carregando…</p>
  return (
    <section className="secao se">
      <button className="botao fantasma" onClick={onVoltar}>← Voltar</button>
      <div className="cartao se-final">
        <h2>{t.titulo || resumo?.titulo}</h2>
        <p className="se-nota"><b>{t.r.acertos}</b> de {t.r.total} acertos</p>
        <PorArea por={t.r.por_area} />
      </div>
      <div className="cartao se-bloco">
        <h3>Correção questão por questão</h3>
        <div className="se-grade">
          {qs.map((q, i) => {
            const m = t.respostas?.[q.id]
            const cl = !q.gabarito ? 'anulada' : m === q.gabarito ? 'certa' : 'errada'
            return <button key={q.id} className={`se-num ${cl} ${aberta === i ? 'atual' : ''}`} onClick={() => setAberta(aberta === i ? null : i)}>{i + 1}</button>
          })}
        </div>
        <p className="suave pequeno">Verde: acertou · vermelho: errou ou deixou em branco · cinza: anulada. Toque no número para ver a questão.</p>
        {aberta !== null && qs[aberta] && <Revisao q={qs[aberta]} n={aberta + 1} marcada={t.respostas?.[qs[aberta].id]} />}
      </div>
    </section>
  )
}

function Revisao({ q, n, marcada }) {
  const soLetras = LETRAS.every((L) => q.alternativas?.[L] === undefined || q.alternativas?.[L] === '' || q.alternativas?.[L] === '{{alt}}')
  return (
    <article className="cartao questao se-questao" style={{ '--cor': corArea(q.area) }}>
      <header className="q-topo">
        <div className="q-selos">
          <span className="q-indice">{n}</span>
          <span className="selo" style={{ background: corArea(q.area), color: '#fff' }}>{nomeArea(q.area)}</span>
          <span className="suave pequeno">{[q.prova, q.materia, q.assunto].filter(Boolean).join(' · ')}</span>
        </div>
      </header>
      <TextoQuestao texto={q.enunciado} imagens={q.imagens} />
      <div className={soLetras ? 'q-alts q-alts-letras' : 'q-alts'}>
        {LETRAS.filter((L) => q.alternativas?.[L] !== undefined && q.alternativas?.[L] !== '').map((L) => (
          <div key={L} className={['q-alt', L === q.gabarito ? 'certa' : '', L === marcada && L !== q.gabarito ? 'errada' : ''].join(' ')}>
            <span className="q-letra">{L}</span>
            {q.alternativas[L] === '{{alt}}' ? null : <TextoQuestao texto={q.alternativas[L]} imagens={q.imagens} className="q-alt-texto" />}
          </div>
        ))}
      </div>
      <p className="pequeno">{!q.gabarito ? 'Questão anulada.' : marcada ? `Você marcou ${marcada}. Resposta: ${q.gabarito}.` : `Você deixou em branco. Resposta: ${q.gabarito}.`}</p>
      {q.comentario && <TextoQuestao texto={q.comentario} imagens={q.imagens} className="q-comentario" />}
    </article>
  )
}

// ---------------------------------------------------------------------------------
function PainelEquipe({ provas, carregando, onMudou }) {
  const [lista, setLista] = useState([])
  const [vendo, setVendo] = useState(null)
  const [novo, setNovo] = useState(false)
  const carregar = useCallback(async () => {
    const { data } = await supabase.from('simulados_agendados').select('id, titulo, prova, composicao, inicio, duracao_min, resultado_liberado, questao_ids').order('inicio', { ascending: false })
    setLista(data ?? [])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function liberar(a, v) {
    await supabase.from('simulados_agendados').update({ resultado_liberado: v }).eq('id', a.id)
    carregar(); onMudou()
  }
  async function apagar(a) {
    if (!confirm(`Apagar o simulado “${a.titulo}”? As provas feitas pelos alunos também serão apagadas.`)) return
    await supabase.from('simulados_agendados').delete().eq('id', a.id)
    carregar(); onMudou()
  }

  return (
    <div className="cartao se-bloco se-equipe">
      <div className="se-cabeca">
        <h3>🗓️ Agendar simulado para os alunos</h3>
        {!novo && <button className="botao primario" onClick={() => setNovo(true)}>+ Novo simulado</button>}
      </div>
      {novo && <NovoAgendado provas={provas} carregando={carregando} onCancelar={() => setNovo(false)} onCriado={() => { setNovo(false); carregar(); onMudou() }} />}
      {lista.length > 0 && (
        <div className="se-lista">
          {lista.map((a) => (
            <div key={a.id} className="se-item">
              <div>
                <strong>{a.titulo}</strong>
                <span className="suave pequeno">{dataHora(a.inicio)} · {a.duracao_min} min · {a.questao_ids?.length} questões · {nomeComposicao(a.composicao)}</span>
              </div>
              <div className="linha-botoes">
                <button className="botao" onClick={() => setVendo(vendo === a.id ? null : a.id)}>{vendo === a.id ? 'Fechar' : 'Resultados'}</button>
                <button className={a.resultado_liberado ? 'botao' : 'botao primario'} onClick={() => liberar(a, !a.resultado_liberado)}>{a.resultado_liberado ? 'Esconder resultado' : 'Liberar resultado'}</button>
                <button className="botao fantasma" onClick={() => apagar(a)}>Apagar</button>
              </div>
              {vendo === a.id && <ResultadosTurma agendado={a} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NovoAgendado({ provas, carregando, onCancelar, onCriado }) {
  const [titulo, setTitulo] = useState('1º Simulado da Assessoria J&C')
  const [prova, setProva] = useState('')
  const [composicao, setComposicao] = useState('dia1')
  const [lingua, setLingua] = useState('ingles')
  const [inicio, setInicio] = useState('')
  const [minutos, setMinutos] = useState(300)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const grupo = provas.find((p) => p.chave === prova)
  useEffect(() => { setMinutos(COMPOSICOES.find((c) => c.k === composicao)?.min ?? 150) }, [composicao])

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    if (!grupo) return setErro('Escolha a prova.')
    if (!inicio) return setErro('Escolha o dia e a hora de início.')
    const m = Math.round(Number(minutos))
    if (!(m >= 10 && m <= 600)) return setErro('Duração entre 10 e 600 minutos.')
    setSalvando(true)
    try {
      const ids = await montarQuestoes(grupo, composicao, lingua)
      if (!ids.length) throw new Error('Essa parte não tem questões nessa prova.')
      const { error } = await supabase.from('simulados_agendados').insert({
        titulo: titulo.trim().slice(0, 120), prova: grupo.chave, composicao, questao_ids: ids,
        inicio: new Date(inicio).toISOString(), duracao_min: m,
      })
      if (error) throw error
      onCriado()
    } catch (err) {
      setErro(msgErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="se-form se-novo" onSubmit={salvar}>
      <label>Nome do simulado<input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} required /></label>
      <span className="rotulo-campo">Prova</span>
      {carregando ? <p className="suave">Carregando provas…</p> : <EscolhaProva provas={provas} valor={prova} onChange={setProva} />}
      {grupo && <OpcoesParte grupo={grupo} composicao={composicao} setComposicao={setComposicao} lingua={lingua} setLingua={setLingua} />}
      <div className="se-duas">
        <label>Começa em<input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} required /></label>
        <label>Duração (minutos)<input type="number" min="10" max="600" value={minutos} onChange={(e) => setMinutos(e.target.value)} /></label>
      </div>
      <p className="suave pequeno">A prova termina para todos no mesmo horário: quem começar atrasado tem menos tempo. O resultado só aparece para os alunos quando você clicar em “Liberar resultado”.</p>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao fantasma" onClick={onCancelar}>Cancelar</button>
        <button className="botao primario" disabled={salvando}>{salvando ? 'Agendando…' : 'Agendar simulado'}</button>
      </div>
    </form>
  )
}

function ResultadosTurma({ agendado }) {
  const [linhas, setLinhas] = useState(null)
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('simulado_tentativas')
        .select('id, inicio, enviado_em, aluno:perfis!simulado_tentativas_aluno_id_fkey(nome, email), simulado_resultados(acertos, total, por_area)')
        .eq('agendado_id', agendado.id)
      const l = (data ?? []).map((t) => ({ ...t, r: Array.isArray(t.simulado_resultados) ? t.simulado_resultados[0] : t.simulado_resultados }))
      l.sort((a, b) => (b.r?.acertos ?? -1) - (a.r?.acertos ?? -1))
      setLinhas(l)
    })()
  }, [agendado.id])
  if (!linhas) return <p className="suave">Carregando…</p>
  if (!linhas.length) return <p className="suave">Nenhum aluno fez ainda.</p>
  const ini = new Date(agendado.inicio).getTime()
  return (
    <div className="se-tabela-envolve">
      <table className="se-tabela">
        <thead>
          <tr><th>#</th><th>Aluno</th><th>Acertos</th>{AREAS.map((a) => <th key={a.chave}>{a.curto}</th>)}<th>Começou</th><th>Entregou</th></tr>
        </thead>
        <tbody>
          {linhas.map((t, i) => {
            const atraso = Math.max(0, Math.round((new Date(t.inicio).getTime() - ini) / 60000))
            return (
              <tr key={t.id}>
                <td>{t.r ? i + 1 : '–'}</td>
                <td>{t.aluno?.nome || t.aluno?.email}</td>
                <td><b>{t.r ? `${t.r.acertos}/${t.r.total}` : '—'}</b></td>
                {AREAS.map((a) => <td key={a.chave}>{t.r?.por_area?.[a.chave] ? `${t.r.por_area[a.chave].acertos}/${t.r.por_area[a.chave].total}` : ''}</td>)}
                <td>{atraso ? `+${atraso} min` : 'no horário'}</td>
                <td>{t.enviado_em ? new Date(t.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'fazendo…'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
