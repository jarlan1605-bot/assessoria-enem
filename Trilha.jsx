import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { NOME_SITE } from './constants'
import { hojeISO, somarDias } from './agenda'
import { MATERIAS_TRILHA, CONTEUDOS, QUENTE, SENTIMENTOS, nivelDe } from './conteudos'

const MIN_QUESTOES = 5 // com menos questões que isso, o % de acerto ainda não entra no "pior rendimento"
const DIAS_PARA_REVISAR = 30
const VAZIO = { progresso: 0, visto_em: null, sentimento: null, questoes_feitas: 0, questoes_certas: 0, anotacao: '' }
const FILTROS = [
  ['todos', 'Todos'],
  ['afazer', 'A fazer'],
  ['andamento', 'Em andamento'],
  ['concluidos', 'Concluídos'],
  ['quentes', '👁️ Mais cobrados'],
  ['revisar', '⏰ Revisar'],
]

const acertoDe = (r) => (r?.questoes_feitas ? Math.round((100 * r.questoes_certas) / r.questoes_feitas) : null)
const corAcerto = (p) => (p == null ? 'var(--suave)' : p >= 70 ? '#2f9e44' : p >= 50 ? '#e67700' : '#c92a2a')
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '')
const materiaDe = (chave) => MATERIAS_TRILHA.find((m) => m.chave === chave)
const precisaRevisar = (r) =>
  !!r?.visto_em && r.visto_em <= somarDias(hojeISO(), -DIAS_PARA_REVISAR) && (r.progresso < 100 || (acertoDe(r) ?? 100) < 70)

function resumir(lista, regs) {
  let soma = 0
  let concluidos = 0
  let feitas = 0
  let certas = 0
  for (const c of lista) {
    const r = regs[c.id]
    soma += r?.progresso ?? 0
    if (r?.progresso === 100) concluidos++
    feitas += r?.questoes_feitas ?? 0
    certas += r?.questoes_certas ?? 0
  }
  return {
    pct: lista.length ? Math.round(soma / lista.length) : 0,
    concluidos,
    total: lista.length,
    feitas,
    certas,
    acerto: feitas ? Math.round((100 * certas) / feitas) : null,
  }
}

export default function Trilha({ alunoId, aluno, ehMentor }) {
  const [regs, setRegs] = useState({}) // conteudo -> registro salvo
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [materia, setMateriaEstado] = useState(() => {
    try { return localStorage.getItem('trilhaMateria') || 'biologia' } catch { return 'biologia' }
  })
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(null) // conteúdo com os detalhes abertos
  const [salvamento, setSalvamento] = useState('') // '' | salvando | salvo | erro
  const [festa, setFesta] = useState(null)
  const [compartilhando, setCompartilhando] = useState(false)
  const pendentes = useRef({})
  const timers = useRef({})
  const secaoMateria = useRef(null)
  const primeiroNome = (aluno?.nome || '').split(' ')[0]

  function setMateria(chave) {
    setMateriaEstado(chave)
    setAberto(null)
    try { localStorage.setItem('trilhaMateria', chave) } catch { /* sem armazenamento */ }
  }

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('trilha_conteudos').select('*').eq('aluno_id', alunoId)
    if (error) setErro(ehMentor ? 'Não foi possível carregar a trilha. Já rodou o arquivo trilha.sql no Supabase?' : 'Não foi possível carregar sua trilha.')
    else {
      setErro('')
      setRegs(Object.fromEntries((data ?? []).map((r) => [r.conteudo, r])))
    }
    setCarregando(false)
  }, [alunoId, ehMentor])

  useEffect(() => {
    carregar()
  }, [carregar])

  const salvar = useCallback(async (id) => {
    const r = pendentes.current[id]
    delete pendentes.current[id]
    if (!r) return
    const { error } = await supabase.from('trilha_conteudos').upsert({
      aluno_id: alunoId,
      conteudo: id,
      progresso: r.progresso,
      visto_em: r.visto_em || null,
      sentimento: r.sentimento ?? null,
      questoes_feitas: r.questoes_feitas,
      questoes_certas: r.questoes_certas,
      anotacao: (r.anotacao || '').slice(0, 2000),
      atualizado_em: new Date().toISOString(),
    })
    if (error) {
      setSalvamento('erro')
      setErro('Não foi possível salvar: ' + error.message)
    } else setSalvamento(Object.keys(pendentes.current).length ? 'salvando' : 'salvo')
  }, [alunoId])

  // Ao sair da aba, salva o que ainda estava esperando
  useEffect(() => () => {
    for (const id of Object.keys(pendentes.current)) {
      clearTimeout(timers.current[id])
      salvar(id)
    }
  }, [salvar])

  // Atualiza na hora na tela e salva logo em seguida (o aluno vê o gráfico mudar enquanto mexe)
  function atualizar(c, mudancas) {
    const antes = regs[c.id] ?? VAZIO
    const novo = { ...antes, ...mudancas }
    novo.progresso = Math.max(0, Math.min(100, Math.round(Number(novo.progresso) || 0)))
    novo.questoes_feitas = Math.max(0, Math.min(100000, Math.round(Number(novo.questoes_feitas) || 0)))
    novo.questoes_certas = Math.max(0, Math.round(Number(novo.questoes_certas) || 0))
    if ('questoes_certas' in mudancas && novo.questoes_certas > novo.questoes_feitas) novo.questoes_feitas = novo.questoes_certas
    novo.questoes_certas = Math.min(novo.questoes_certas, novo.questoes_feitas)
    // Começou o conteúdo e ainda não tinha data: marca hoje
    if (!novo.visto_em && novo.progresso > 0 && !('visto_em' in mudancas)) novo.visto_em = hojeISO()

    const novos = { ...regs, [c.id]: novo }
    setRegs(novos)
    pendentes.current[c.id] = novo
    clearTimeout(timers.current[c.id])
    timers.current[c.id] = setTimeout(() => salvar(c.id), 500)
    setSalvamento('salvando')

    if (novo.progresso === 100 && (antes.progresso ?? 0) < 100) {
      const m = materiaDe(c.materia)
      const daMateria = resumir(CONTEUDOS.filter((x) => x.materia === c.materia), novos)
      setFesta(
        daMateria.pct === 100
          ? { grande: true, texto: `🏆 ${m.nome} 100% concluída! Que orgulho!` }
          : { texto: `🎉 ${c.nome} concluído! ${m.nome} está em ${daMateria.pct}%` }
      )
    }
  }

  useEffect(() => {
    if (!festa) return
    const t = setTimeout(() => setFesta(null), festa.grande ? 4500 : 2600)
    return () => clearTimeout(t)
  }, [festa])

  const geral = useMemo(() => resumir(CONTEUDOS, regs), [regs])
  const porMateria = useMemo(
    () => Object.fromEntries(MATERIAS_TRILHA.map((m) => [m.chave, resumir(CONTEUDOS.filter((c) => c.materia === m.chave), regs)])),
    [regs]
  )
  const quentes = useMemo(() => resumir(CONTEUDOS.filter((c) => QUENTE.has(c.id)), regs), [regs])

  // Pior rendimento: menor % de acerto entre os conteúdos com questões suficientes
  const piores = useMemo(
    () =>
      CONTEUDOS.filter((c) => (regs[c.id]?.questoes_feitas ?? 0) >= MIN_QUESTOES)
        .map((c) => ({ ...c, acerto: acertoDe(regs[c.id]), r: regs[c.id] }))
        .filter((c) => c.acerto < 70)
        .sort((a, b) => a.acerto - b.acerto || b.r.questoes_feitas - a.r.questoes_feitas),
    [regs]
  )

  function abrirConteudo(c) {
    setMateria(c.materia)
    setFiltro('todos')
    setBusca('')
    setAberto(c.id)
    setTimeout(() => document.getElementById(`conteudo-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  const m = materiaDe(materia) ?? MATERIAS_TRILHA[0]
  const rm = porMateria[m.chave]
  const [, emojiNivel, nomeNivel] = nivelDe(geral.pct)
  const [, emojiNivelM, nomeNivelM] = nivelDe(rm.pct)
  const termo = busca.trim().toLowerCase()
  const passaFiltro = (c) => {
    const r = regs[c.id]
    const p = r?.progresso ?? 0
    if (termo && !c.nome.toLowerCase().includes(termo)) return false
    if (filtro === 'afazer') return p === 0
    if (filtro === 'andamento') return p > 0 && p < 100
    if (filtro === 'concluidos') return p === 100
    if (filtro === 'quentes') return QUENTE.has(c.id)
    if (filtro === 'revisar') return precisaRevisar(r)
    return true
  }
  const revisarNaMateria = CONTEUDOS.filter((c) => c.materia === m.chave && precisaRevisar(regs[c.id])).length
  const pioresNaMateria = piores.filter((c) => c.materia === m.chave).slice(0, 3)

  if (carregando) return <p className="suave">Carregando…</p>

  return (
    <section className="secao trilha">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>🧭 {ehMentor ? `Trilha de ${primeiroNome || 'aluno'}` : 'Minha Trilha'}</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>
            {ehMentor
              ? 'O checklist de conteúdos do aluno, atualizado por ele em tempo real. Você também pode ajustar.'
              : 'Marque o quanto já estudou de cada conteúdo e as questões que fez. O gráfico se atualiza na hora.'}
          </p>
        </div>
        <div className="trilha-acoes">
          <span className={`trilha-salvo ${salvamento}`} aria-live="polite">
            {salvamento === 'salvando' ? 'salvando…' : salvamento === 'salvo' ? '✓ salvo' : salvamento === 'erro' ? 'não salvou' : ''}
          </span>
          <button className="botao primario" onClick={() => setCompartilhando(true)}>📸 Compartilhar progresso</button>
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <div className="cartao trilha-hero">
        <Anel pct={geral.pct} cor="var(--primaria)" tamanho={148} espessura={14}>
          <strong className="anel-numero">{geral.pct}%</strong>
          <span className="anel-legenda">da trilha</span>
        </Anel>
        <div className="trilha-hero-texto">
          <span className="trilha-nivel">{emojiNivel} {nomeNivel}</span>
          <div className="trilha-numeros">
            <div><strong>{geral.concluidos}</strong><span>de {geral.total} conteúdos concluídos</span></div>
            <div><strong>{geral.feitas}</strong><span>questões registradas</span></div>
            <div><strong style={{ color: corAcerto(geral.acerto) }}>{geral.acerto == null ? '—' : `${geral.acerto}%`}</strong><span>de acerto</span></div>
            <div><strong>{quentes.concluidos}/{quentes.total}</strong><span>👁️ mais cobrados concluídos</span></div>
          </div>
        </div>
      </div>

      <div className="trilha-materias">
        {MATERIAS_TRILHA.map((x) => {
          const r = porMateria[x.chave]
          const [, em] = nivelDe(r.pct)
          return (
            <button
              key={x.chave}
              className={x.chave === m.chave ? 'materia-card ativo' : 'materia-card'}
              style={{ '--cor': x.cor }}
              onClick={() => { setMateria(x.chave); setTimeout(() => secaoMateria.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30) }}
              aria-pressed={x.chave === m.chave}
            >
              <Anel pct={r.pct} cor={x.cor} tamanho={72} espessura={8}>
                <span className="anel-emoji">{x.emoji}</span>
              </Anel>
              <strong>{x.nome}</strong>
              <span className="materia-card-pct">{r.pct}% {em}</span>
              <span className="suave pequeno">{r.concluidos}/{r.total} concluídos</span>
            </button>
          )
        })}
      </div>

      <div className="cartao trilha-piores">
        <h2>📉 Onde o rendimento está mais baixo</h2>
        {piores.length === 0 ? (
          <p className="suave pequeno" style={{ margin: 0 }}>
            Registre as questões que {ehMentor ? 'o aluno faz' : 'você faz'} em cada conteúdo (toque no conteúdo e use “acertei / errei”). Os conteúdos com menos de 70% de acerto, a partir de {MIN_QUESTOES} questões, aparecem aqui sozinhos, do pior para o melhor.
          </p>
        ) : (
          <ul className="lista-piores">
            {piores.slice(0, 6).map((c) => {
              const mm = materiaDe(c.materia)
              return (
                <li key={c.id}>
                  <button className="pior-item" onClick={() => abrirConteudo(c)} style={{ '--cor': mm.cor }}>
                    <span className="pior-materia">{mm.emoji} {mm.nome}</span>
                    <strong>{c.nome}</strong>
                    <span className="barra"><i style={{ width: `${c.acerto}%`, background: corAcerto(c.acerto) }} /></span>
                    <span className="pior-num" style={{ color: corAcerto(c.acerto) }}>{c.acerto}% <span className="suave">({c.r.questoes_certas}/{c.r.questoes_feitas})</span></span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div ref={secaoMateria} className="cartao trilha-materia" style={{ '--cor': m.cor }}>
        <div className="trilha-materia-topo">
          <Anel pct={rm.pct} cor={m.cor} tamanho={104} espessura={11}>
            <strong className="anel-numero pequeno-anel">{rm.pct}%</strong>
          </Anel>
          <div>
            <h2 style={{ margin: 0 }}>{m.emoji} {m.nome}</h2>
            <span className="trilha-nivel" style={{ color: m.cor }}>{emojiNivelM} {nomeNivelM}</span>
            <div className="trilha-chips">
              <span className="chip">✅ {rm.concluidos}/{rm.total} concluídos</span>
              <span className="chip">✍️ {rm.feitas} questões</span>
              <span className="chip" style={{ color: corAcerto(rm.acerto) }}>🎯 {rm.acerto == null ? '—' : `${rm.acerto}% de acerto`}</span>
              {revisarNaMateria > 0 && <button className="chip chip-botao" onClick={() => setFiltro('revisar')}>⏰ {revisarNaMateria} para revisar</button>}
            </div>
          </div>
        </div>
        {pioresNaMateria.length > 0 && (
          <p className="pequeno trilha-alerta">
            📉 Pior rendimento em {m.nome}: {pioresNaMateria.map((c, i) => (
              <span key={c.id}>{i > 0 && ', '}<button className="link" onClick={() => abrirConteudo(c)}>{c.nome} ({c.acerto}%)</button></span>
            ))}
          </p>
        )}

        <div className="trilha-filtros">
          <div className="filtros">
            {FILTROS.map(([k, nome]) => (
              <button key={k} className={filtro === k ? 'filtro ativo' : 'filtro'} onClick={() => setFiltro(k)}>{nome}</button>
            ))}
          </div>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conteúdo…" aria-label="Buscar conteúdo" />
        </div>

        {m.frentes.map(([frente]) => {
          const lista = CONTEUDOS.filter((c) => c.materia === m.chave && c.frente === frente)
          const visiveis = lista.filter(passaFiltro)
          if (!visiveis.length) return null
          const rf = resumir(lista, regs)
          return (
            <div key={frente} className="trilha-frente">
              <div className="frente-topo">
                <h3>{frente}</h3>
                <span className="suave pequeno">{rf.concluidos}/{rf.total} · {rf.pct}%</span>
              </div>
              <span className="barra frente-barra"><i style={{ width: `${rf.pct}%`, background: m.cor }} /></span>
              <ul className="lista-conteudos">
                {visiveis.map((c) => (
                  <ConteudoItem
                    key={c.id}
                    c={c}
                    r={regs[c.id]}
                    cor={m.cor}
                    aberto={aberto === c.id}
                    onAbrir={() => setAberto((a) => (a === c.id ? null : c.id))}
                    onMudar={(mud) => atualizar(c, mud)}
                  />
                ))}
              </ul>
            </div>
          )
        })}
        {m.frentes.every(([frente]) => !CONTEUDOS.some((c) => c.materia === m.chave && c.frente === frente && passaFiltro(c))) && (
          <p className="suave" style={{ marginBottom: 0 }}>Nenhum conteúdo com esse filtro.</p>
        )}
      </div>

      {festa && <div className={festa.grande ? 'trilha-festa grande' : 'trilha-festa'} role="status">{festa.texto}</div>}
      {compartilhando && (
        <Compartilhar nome={aluno?.nome || ''} geral={geral} porMateria={porMateria} onFechar={() => setCompartilhando(false)} />
      )}
    </section>
  )
}

function Anel({ pct, cor, tamanho = 120, espessura = 12, children }) {
  const raio = (tamanho - espessura) / 2
  const volta = 2 * Math.PI * raio
  return (
    <div className="anel" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} aria-hidden="true">
        <circle className="anel-fundo" cx={tamanho / 2} cy={tamanho / 2} r={raio} strokeWidth={espessura} fill="none" />
        <circle
          className="anel-valor"
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          strokeWidth={espessura}
          fill="none"
          style={{ stroke: cor, strokeDasharray: volta, strokeDashoffset: volta * (1 - Math.min(100, pct) / 100) }}
          strokeLinecap="round"
          transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
        />
      </svg>
      <div className="anel-meio">{children}</div>
    </div>
  )
}

function ConteudoItem({ c, r, cor, aberto, onAbrir, onMudar }) {
  const p = r?.progresso ?? 0
  const acerto = acertoDe(r)
  const sentimento = SENTIMENTOS.find(([v]) => v === r?.sentimento)
  return (
    <li id={`conteudo-${c.id}`} className={`conteudo ${p === 100 ? 'feito' : ''} ${aberto ? 'aberto' : ''} ${QUENTE.has(c.id) ? 'quente' : ''}`} style={{ '--cor': cor }}>
      <div className="conteudo-linha">
        <button
          className="conteudo-check"
          onClick={() => onMudar({ progresso: p === 100 ? 0 : 100 })}
          aria-pressed={p === 100}
          aria-label={p === 100 ? `Desmarcar ${c.nome}` : `Marcar ${c.nome} como concluído`}
        >
          {p === 100 ? '✓' : ''}
        </button>
        <button className="conteudo-nome" onClick={onAbrir} aria-expanded={aberto}>
          <span className="conteudo-titulo">{c.nome}</span>
          <span className="conteudo-selos">
            {QUENTE.has(c.id) && <span className="selo-mini quente" title="Um dos conteúdos que mais caem no ENEM">👁️ Cai muito</span>}
            {sentimento && <span className="selo-mini" title={sentimento[2]}>{sentimento[1]}</span>}
            {acerto != null && (
              <span className="selo-mini acerto" style={{ color: corAcerto(acerto) }} title="Questões certas / feitas">
                {r.questoes_certas}/{r.questoes_feitas} · {acerto}%
              </span>
            )}
            {precisaRevisar(r) && <span className="selo-mini revisar" title={`Visto há mais de ${DIAS_PARA_REVISAR} dias`}>⏰ revisar</span>}
          </span>
        </button>
        <span className="conteudo-pct">{p}%</span>
        <button className="conteudo-seta" onClick={onAbrir} aria-label={aberto ? 'Fechar detalhes' : 'Abrir detalhes'}>{aberto ? '▴' : '▾'}</button>
      </div>
      <input
        className="conteudo-range"
        type="range"
        min="0"
        max="100"
        step="5"
        value={p}
        onChange={(e) => onMudar({ progresso: Number(e.target.value) })}
        style={{ '--p': `${p}%` }}
        aria-label={`Andamento de ${c.nome}`}
      />
      {aberto && <Detalhes r={r ?? VAZIO} onMudar={onMudar} />}
    </li>
  )
}

function Detalhes({ r, onMudar }) {
  const acerto = acertoDe(r)
  const erradas = r.questoes_feitas - r.questoes_certas
  return (
    <div className="conteudo-detalhes">
      <div className="detalhe-bloco">
        <span className="detalhe-titulo">📅 Quando vi</span>
        <input type="date" value={r.visto_em || ''} max={hojeISO()} onChange={(e) => onMudar({ visto_em: e.target.value || null })} />
      </div>

      <div className="detalhe-bloco">
        <span className="detalhe-titulo">💭 Como me senti</span>
        <div className="sentimentos" role="radiogroup" aria-label="Como me senti">
          {SENTIMENTOS.map(([v, emoji, nome]) => (
            <button
              key={v}
              role="radio"
              aria-checked={r.sentimento === v}
              className={r.sentimento === v ? 'sentimento ativo' : 'sentimento'}
              onClick={() => onMudar({ sentimento: r.sentimento === v ? null : v })}
            >
              <span>{emoji}</span>
              <small>{nome}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="detalhe-bloco">
        <span className="detalhe-titulo">✍️ Questões</span>
        <div className="questoes-linha">
          <button className="botao pequeno questao-mais certa" onClick={() => onMudar({ questoes_feitas: r.questoes_feitas + 1, questoes_certas: r.questoes_certas + 1 })}>+1 ✅ acertei</button>
          <button className="botao pequeno questao-mais errada" onClick={() => onMudar({ questoes_feitas: r.questoes_feitas + 1 })}>+1 ❌ errei</button>
        </div>
        <div className="questoes-linha">
          <label className="questoes-campo">
            Certas
            <input type="number" min="0" inputMode="numeric" value={r.questoes_certas} onChange={(e) => onMudar({ questoes_certas: e.target.value })} />
          </label>
          <span className="questoes-barra">/</span>
          <label className="questoes-campo">
            Total
            <input type="number" min="0" inputMode="numeric" value={r.questoes_feitas} onChange={(e) => onMudar({ questoes_feitas: e.target.value })} />
          </label>
          <div className="questoes-resultado" style={{ color: corAcerto(acerto) }}>
            <strong>{acerto == null ? '—' : `${acerto}%`}</strong>
            <span className="suave pequeno">{r.questoes_feitas ? `${erradas} ${erradas === 1 ? 'erro' : 'erros'}` : 'sem questões ainda'}</span>
          </div>
        </div>
      </div>

      <div className="detalhe-bloco largo">
        <span className="detalhe-titulo">📝 Anotações</span>
        <textarea rows="2" maxLength={2000} value={r.anotacao || ''} onChange={(e) => onMudar({ anotacao: e.target.value })} placeholder="Ex.: confundo espelho côncavo com convexo; revisar fórmulas antes do simulado." />
        {r.visto_em && <span className="suave pequeno">Visto em {dataBR(r.visto_em)}</span>}
      </div>
    </div>
  )
}

// ---------- Imagem para compartilhar (formato do feed do Instagram, 1080×1350) ----------
const FONTE = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Arial, sans-serif'

async function desenharProgresso({ nome, geral, porMateria }) {
  await document.fonts?.ready
  const L = 1080
  const A = 1350
  const cv = document.createElement('canvas')
  cv.width = L
  cv.height = A
  const ctx = cv.getContext('2d')

  const fundo = ctx.createLinearGradient(0, 0, L, A)
  fundo.addColorStop(0, '#1f5f4a')
  fundo.addColorStop(1, '#0d2a20')
  ctx.fillStyle = fundo
  ctx.fillRect(0, 0, L, A)
  // bolhas decorativas
  for (const [x, y, r, a] of [[980, 120, 220, 0.07], [90, 1250, 260, 0.06], [940, 980, 120, 0.05]]) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.fill()
  }

  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `700 30px ${FONTE}`
  ctx.fillText('MINHA TRILHA ENEM 🧭', 80, 120)
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 64px ${FONTE}`
  ctx.fillText((nome || 'Estudante').split(' ').slice(0, 2).join(' '), 80, 200)

  // anel geral
  const cx = 250
  const cy = 420
  const raio = 150
  ctx.lineCap = 'round'
  ctx.lineWidth = 30
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.beginPath()
  ctx.arc(cx, cy, raio, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = '#f2b134'
  ctx.beginPath()
  ctx.arc(cx, cy, raio, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * geral.pct) / 100)
  if (geral.pct > 0) ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = `800 88px ${FONTE}`
  ctx.fillText(`${geral.pct}%`, cx, cy + 22)
  ctx.font = `600 26px ${FONTE}`
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText('da trilha', cx, cy + 66)
  ctx.textAlign = 'left'

  const [, emoji, nivel] = nivelDe(geral.pct)
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 44px ${FONTE}`
  ctx.fillText(`${emoji} ${nivel}`, 470, 360)
  ctx.font = `600 30px ${FONTE}`
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText(`✅ ${geral.concluidos} conteúdos concluídos`, 470, 430)
  ctx.fillText(`✍️ ${geral.feitas} questões resolvidas`, 470, 480)
  if (geral.acerto != null) ctx.fillText(`🎯 ${geral.acerto}% de acerto`, 470, 530)

  // matérias
  let y = 680
  for (const m of MATERIAS_TRILHA) {
    const r = porMateria[m.chave]
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 34px ${FONTE}`
    ctx.fillText(`${m.emoji}  ${m.nome}`, 80, y)
    ctx.textAlign = 'right'
    ctx.fillText(`${r.pct}%`, L - 80, y)
    ctx.textAlign = 'left'
    const bx = 80
    const by = y + 22
    const bw = L - 160
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.beginPath()
    ctx.roundRect(bx, by, bw, 18, 9)
    ctx.fill()
    if (r.pct > 0) {
      ctx.fillStyle = m.cor
      ctx.beginPath()
      ctx.roundRect(bx, by, Math.max(18, (bw * r.pct) / 100), 18, 9)
      ctx.fill()
    }
    y += 88
  }

  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `600 26px ${FONTE}`
  ctx.fillText(NOME_SITE, 80, A - 60)
  ctx.textAlign = 'right'
  ctx.fillText('rumo à aprovação 🚀', L - 80, A - 60)

  return new Promise((ok) => cv.toBlob(ok, 'image/png'))
}

function Compartilhar({ nome, geral, porMateria, onFechar }) {
  const [imagem, setImagem] = useState(null)

  useEffect(() => {
    let url
    desenharProgresso({ nome, geral, porMateria }).then((blob) => {
      url = URL.createObjectURL(blob)
      setImagem({ blob, url })
    })
    return () => url && URL.revokeObjectURL(url)
  }, [nome, geral, porMateria])

  const arquivo = imagem && new File([imagem.blob], 'minha-trilha-enem.png', { type: 'image/png' })
  const podeCompartilhar = arquivo && navigator.canShare?.({ files: [arquivo] })

  async function compartilhar() {
    try {
      await navigator.share({ files: [arquivo], title: 'Minha Trilha ENEM', text: `Já estou com ${geral.pct}% da minha trilha do ENEM! 🧭` })
    } catch { /* cancelou */ }
  }

  return (
    <div className="fundo-modal" onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="cartao modal modal-trilha" role="dialog" aria-modal="true" aria-label="Compartilhar progresso">
        <div className="modal-topo">
          <h2>📸 Compartilhar progresso</h2>
          <button className="botao fantasma pequeno" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <p className="suave pequeno">Imagem no formato do feed do Instagram. Poste nos stories e marque a mentoria!</p>
        <div className="trilha-previa">
          {imagem ? <img src={imagem.url} alt="Imagem do progresso na trilha" /> : <span className="suave pequeno">Gerando imagem…</span>}
        </div>
        <div className="linha-botoes">
          {imagem && <a className="botao fantasma" href={imagem.url} download="minha-trilha-enem.png">Baixar imagem</a>}
          {podeCompartilhar && <button className="botao primario" onClick={compartilhar}>Compartilhar</button>}
        </div>
      </div>
    </div>
  )
}
