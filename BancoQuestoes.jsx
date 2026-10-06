import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { AREAS } from './constants'
import { hojeISO, somarDias } from './agenda'
import QuestaoCartao from './QuestaoCartao'
import QuestaoForm from './QuestaoForm'
import ImportarQuestoes from './ImportarQuestoes'
import DesempenhoQuestoes from './DesempenhoQuestoes'
import { embaralhar, minSeg, origemQuestao } from './questoes-util'

const POR_PAGINA = 10
const FILTRO_VAZIO = { area: '', materia: '', ano: '', prova: '', status: '', busca: '' }
const CAMPOS_INDICE = 'id, banca, prova, ano, numero, area, materia, assunto, dificuldade, gabarito, revisado'

// Busca mais de 1000 linhas (o Supabase devolve no máximo 1000 por vez)
async function buscarTudo(fazer) {
  let tudo = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await fazer().range(de, de + 999)
    if (error) return { error }
    tudo = tudo.concat(data ?? [])
    if (!data || data.length < 1000) return { data: tudo }
  }
}

async function buscarCompletas(ids) {
  if (!ids.length) return []
  const { data } = await supabase.from('questoes').select('*').in('id', ids)
  const m = new Map((data ?? []).map((q) => [q.id, q]))
  return ids.map((id) => m.get(id)).filter(Boolean)
}

export default function BancoQuestoes({ perfil, ehMentor, alunos }) {
  const [aba, setAba] = useState('resolver')
  const [indice, setIndice] = useState(null) // lista leve de todas as questões
  const [respostas, setRespostas] = useState([])
  const [noCaderno, setNoCaderno] = useState(new Set())
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState(null) // null | {} (nova) | questão
  const [importando, setImportando] = useState(false)

  const carregar = useCallback(async () => {
    const q = await buscarTudo(() =>
      supabase.from('questoes').select(CAMPOS_INDICE).order('ano', { ascending: false }).order('prova').order('numero')
    )
    if (q.error) {
      setErro('Não foi possível abrir o banco de questões. O arquivo questoes.sql já foi rodado no Supabase?')
      setIndice([])
      return
    }
    setErro('')
    setIndice(q.data)
    const r = await buscarTudo(() => {
      let b = supabase.from('respostas').select('id, aluno_id, questao_id, alternativa, correta, tempo_seg, criado_em')
      if (!ehMentor) b = b.eq('aluno_id', perfil.id)
      return b.order('criado_em')
    })
    setRespostas(r.data ?? [])
    if (!ehMentor) {
      const { data } = await supabase.from('erros').select('questao_id').eq('aluno_id', perfil.id).not('questao_id', 'is', null)
      setNoCaderno(new Set((data ?? []).map((e) => e.questao_id)))
    }
  }, [ehMentor, perfil.id])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Resposta do aluno (a correção é feita pelo banco)
  const responder = useCallback(async (q, alternativa, tempo_seg = null) => {
    const { data, error } = await supabase
      .from('respostas')
      .insert({ questao_id: q.id, alternativa, tempo_seg })
      .select('id, aluno_id, questao_id, alternativa, correta, tempo_seg, criado_em')
      .single()
    if (error) return { error: 'Não foi possível registrar: ' + error.message }
    setRespostas((r) => [...r, data])
    return data
  }, [])

  const mandarCaderno = useCallback(async (q, motivo) => {
    const { error } = await supabase.from('erros').insert({
      aluno_id: perfil.id,
      questao_id: q.id,
      area: q.area,
      materia: q.materia,
      assunto: q.assunto,
      motivo,
      origem: origemQuestao(q),
      numero_questao: q.numero,
      proxima_revisao: somarDias(hojeISO(), 1),
    })
    if (error) return { error: 'Não foi possível mandar para o caderno: ' + error.message }
    setNoCaderno((s) => new Set(s).add(q.id))
    return {}
  }, [perfil.id])

  // Última resposta do aluno em cada questão
  const ultimas = useMemo(() => {
    const m = new Map()
    if (ehMentor) return m
    for (const r of respostas) m.set(r.questao_id, r)
    return m
  }, [respostas, ehMentor])

  // Para o mentor: quantos alunos acertaram cada questão (1ª tentativa de cada aluno)
  const estatisticas = useMemo(() => {
    const m = new Map()
    if (!ehMentor) return m
    const meus = new Set(alunos.map((a) => a.id))
    const vistos = new Set()
    for (const r of respostas) {
      const k = r.aluno_id + r.questao_id
      if (!meus.has(r.aluno_id) || vistos.has(k)) continue
      vistos.add(k)
      const e = m.get(r.questao_id) ?? { n: 0, acertos: 0, marcadas: {} }
      e.n++
      if (r.correta) e.acertos++
      e.marcadas[r.alternativa] = (e.marcadas[r.alternativa] || 0) + 1
      m.set(r.questao_id, e)
    }
    for (const e of m.values()) e.pct = Math.round((e.acertos / e.n) * 100)
    return m
  }, [respostas, ehMentor, alunos])

  if (!indice) return <p className="suave">Carregando…</p>

  const abas = ehMentor
    ? [['resolver', '📚 Questões'], ['treino', '⏱️ Treino'], ['desempenho', '📊 Desempenho dos alunos']]
    : [['resolver', '📚 Resolver'], ['treino', '⏱️ Treino'], ['desempenho', '📊 Meu desempenho']]

  return (
    <section className="secao banco">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>Banco de questões</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>
            {indice.length} {indice.length === 1 ? 'questão' : 'questões'} · {ehMentor ? 'qualquer mentor pode cadastrar e corrigir' : 'errou? Um toque e ela vai pro caderno de erros'}
          </p>
        </div>
        {ehMentor && (
          <div className="linha-botoes" style={{ margin: 0 }}>
            <button className="botao fantasma" onClick={() => setImportando(true)}>⬆ Importar</button>
            <button className="botao primario" onClick={() => setEditando({})}>+ Cadastrar questão</button>
          </div>
        )}
      </div>

      <div className="filtros">
        {abas.map(([id, nome]) => (
          <button key={id} className={aba === id ? 'filtro ativo' : 'filtro'} onClick={() => setAba(id)}>{nome}</button>
        ))}
      </div>

      {erro && <p className="erro">{erro}</p>}

      {aba === 'resolver' && (
        <Resolver
          indice={indice} ultimas={ultimas} noCaderno={noCaderno} ehMentor={ehMentor} estatisticas={estatisticas}
          onResponder={responder} onCaderno={mandarCaderno} onEditar={setEditando}
        />
      )}
      {aba === 'treino' && (
        <Treino indice={indice} ultimas={ultimas} noCaderno={noCaderno} ehMentor={ehMentor} onResponder={responder} onCaderno={mandarCaderno} />
      )}
      {aba === 'desempenho' && <DesempenhoQuestoes indice={indice} respostas={respostas} ehMentor={ehMentor} alunos={alunos} perfil={perfil} />}

      {editando && (
        <QuestaoForm
          questao={editando}
          indice={indice}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }}
        />
      )}
      {importando && <ImportarQuestoes onFechar={() => setImportando(false)} onImportado={carregar} />}
    </section>
  )
}

// ---------- Filtros (usados no Resolver e no Treino) ----------
export function filtrar(indice, f, ultimas, ehMentor) {
  const t = f.busca.trim().toLowerCase()
  return indice.filter((q) => {
    if (f.area && q.area !== f.area) return false
    if (f.materia && q.materia !== f.materia) return false
    if (f.ano && String(q.ano) !== f.ano) return false
    if (f.prova && q.prova !== f.prova) return false
    if (t && ![q.assunto, q.materia, q.prova, q.banca].some((x) => (x || '').toLowerCase().includes(t))) return false
    if (f.status === 'revisar') return !q.revisado
    if (!ehMentor && f.status) {
      const u = ultimas.get(q.id)
      if (f.status === 'nao_feitas') return !u && q.gabarito
      if (f.status === 'erradas') return u && !u.correta
      if (f.status === 'acertadas') return u?.correta
    }
    return true
  })
}

function Filtros({ indice, f, setF, ehMentor }) {
  const unicos = (lista) => [...new Set(lista.filter(Boolean))]
  const daArea = f.area ? indice.filter((q) => q.area === f.area) : indice
  const materias = unicos(daArea.map((q) => q.materia)).sort()
  const anos = unicos(indice.map((q) => q.ano)).sort((a, b) => b - a)
  const provas = unicos(indice.filter((q) => !f.ano || String(q.ano) === f.ano).map((q) => q.prova))
  const mudar = (campo, valor) => setF({ ...f, [campo]: valor, ...(campo === 'area' ? { materia: '' } : {}), ...(campo === 'ano' ? { prova: '' } : {}) })

  return (
    <div className="cartao q-filtros">
      <div className="tipos-escolha">
        <button type="button" className={!f.area ? 'tipo-op ativo' : 'tipo-op'} onClick={() => mudar('area', '')}>Todas</button>
        {AREAS.map((a) => (
          <button type="button" key={a.chave} className={f.area === a.chave ? 'tipo-op ativo' : 'tipo-op'} style={{ '--cor': a.cor }} onClick={() => mudar('area', a.chave)}>
            {a.nome}
          </button>
        ))}
      </div>
      <div className="q-filtros-linha">
        <select value={f.materia} onChange={(e) => mudar('materia', e.target.value)} aria-label="Matéria">
          <option value="">Todas as matérias</option>
          {materias.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select value={f.ano} onChange={(e) => mudar('ano', e.target.value)} aria-label="Ano">
          <option value="">Todos os anos</option>
          {anos.map((a) => <option key={a} value={String(a)}>{a}</option>)}
        </select>
        <select value={f.prova} onChange={(e) => mudar('prova', e.target.value)} aria-label="Prova">
          <option value="">Todas as provas</option>
          {provas.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={f.status} onChange={(e) => mudar('status', e.target.value)} aria-label="Situação">
          {ehMentor ? (
            <>
              <option value="">Todas</option>
              <option value="revisar">Só comentários a revisar</option>
            </>
          ) : (
            <>
              <option value="">Feitas e não feitas</option>
              <option value="nao_feitas">Só as que não fiz</option>
              <option value="erradas">Só as que errei</option>
              <option value="acertadas">Só as que acertei</option>
            </>
          )}
        </select>
        <input value={f.busca} onChange={(e) => mudar('busca', e.target.value)} placeholder="Buscar assunto…" aria-label="Buscar assunto" />
      </div>
    </div>
  )
}

// ---------- Resolver: lista com filtros e páginas ----------
function Resolver({ indice, ultimas, noCaderno, ehMentor, estatisticas, onResponder, onCaderno, onEditar }) {
  const [f, setF] = useState(() => {
    try { return { ...FILTRO_VAZIO, ...JSON.parse(localStorage.getItem('filtroQuestoes') || '{}') } } catch { return FILTRO_VAZIO }
  })
  const [pagina, setPagina] = useState(0)
  const [questoes, setQuestoes] = useState(null)
  const topo = useRef(null)

  const lista = useMemo(() => filtrar(indice, f, ultimas, ehMentor), [indice, f, ehMentor]) // eslint-disable-line react-hooks/exhaustive-deps
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const pag = Math.min(pagina, paginas - 1)
  const ids = lista.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA).map((q) => q.id)
  const chave = ids.join(',')

  useEffect(() => {
    try { localStorage.setItem('filtroQuestoes', JSON.stringify(f)) } catch { /* sem armazenamento */ }
    setPagina(0)
  }, [f])

  useEffect(() => {
    let ativo = true
    setQuestoes(null)
    buscarCompletas(chave ? chave.split(',') : []).then((qs) => ativo && setQuestoes(qs))
    return () => { ativo = false }
  }, [chave, indice])

  function irPara(p) {
    setPagina(p)
    topo.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const feitas = ehMentor ? 0 : lista.filter((q) => ultimas.has(q.id)).length

  return (
    <>
      <Filtros indice={indice} f={f} setF={setF} ehMentor={ehMentor} />
      <p className="suave pequeno" ref={topo} style={{ scrollMarginTop: 80 }}>
        {lista.length} {lista.length === 1 ? 'questão encontrada' : 'questões encontradas'}
        {!ehMentor && lista.length > 0 && ` · você já fez ${feitas}`}
        {Object.values(f).some(Boolean) && <> · <button className="link" onClick={() => setF(FILTRO_VAZIO)}>limpar filtros</button></>}
      </p>

      {indice.length === 0 && (
        <div className="cartao vazio">
          <h2>O banco ainda está vazio</h2>
          <p>{ehMentor ? 'Cadastre a primeira questão ou importe uma prova inteira pelo botão Importar.' : 'Assim que os mentores cadastrarem questões, elas aparecem aqui.'}</p>
        </div>
      )}

      {questoes === null && ids.length > 0 && <p className="suave">Carregando questões…</p>}
      {questoes?.map((q, i) => (
        <QuestaoCartao
          key={q.id + (q.atualizado_em || '')}
          q={q}
          indice={pag * POR_PAGINA + i + 1}
          ultima={ultimas.get(q.id)}
          noCaderno={noCaderno.has(q.id)}
          ehMentor={ehMentor}
          estat={estatisticas.get(q.id)}
          onResponder={(qq, L) => onResponder(qq, L)}
          onCaderno={onCaderno}
          onEditar={onEditar}
        />
      ))}

      {paginas > 1 && (
        <div className="q-paginas">
          <button className="botao fantasma pequeno" disabled={pag === 0} onClick={() => irPara(pag - 1)}>← Anteriores</button>
          <span className="suave pequeno">Página {pag + 1} de {paginas}</span>
          <button className="botao fantasma pequeno" disabled={pag >= paginas - 1} onClick={() => irPara(pag + 1)}>Próximas →</button>
        </div>
      )}
    </>
  )
}

// ---------- Treino: lista sorteada, com cronômetro ----------
const QTDS = [5, 10, 15, 20, 30, 45]

function Treino({ indice, ultimas, noCaderno, ehMentor, onResponder, onCaderno }) {
  const [f, setF] = useState({ ...FILTRO_VAZIO, status: ehMentor ? '' : 'nao_feitas' })
  const [qtd, setQtd] = useState(10)
  const [tempo, setTempo] = useState('livre') // livre | enem (3 min por questão)
  const [correcao, setCorrecao] = useState('final') // final | hora
  const [rodada, setRodada] = useState(null)

  const disponiveis = useMemo(() => filtrar(indice, f, ultimas, ehMentor).filter((q) => q.gabarito), [indice, f, ultimas, ehMentor])

  async function comecar() {
    const ids = embaralhar(disponiveis).slice(0, qtd).map((q) => q.id)
    const qs = await buscarCompletas(ids)
    setRodada({ questoes: qs, inicio: Date.now(), limite: tempo === 'enem' ? qs.length * 180 : null, correcao, chave: Date.now() })
  }

  if (rodada) {
    return (
      <Rodada
        key={rodada.chave} rodada={rodada} ehMentor={ehMentor} noCaderno={noCaderno}
        onResponder={onResponder} onCaderno={onCaderno} onSair={() => setRodada(null)}
      />
    )
  }

  return (
    <>
      <Filtros indice={indice} f={f} setF={setF} ehMentor={ehMentor} />
      <div className="cartao">
        <h2>Montar treino</h2>
        <p className="rotulo-campo">Quantas questões?</p>
        <div className="tipos-escolha">
          {QTDS.map((n) => (
            <button type="button" key={n} className={qtd === n ? 'tipo-op ativo' : 'tipo-op'} onClick={() => setQtd(n)}>{n}</button>
          ))}
        </div>
        <p className="rotulo-campo">Tempo</p>
        <div className="tipos-escolha">
          <button type="button" className={tempo === 'livre' ? 'tipo-op ativo' : 'tipo-op'} onClick={() => setTempo('livre')}>
            Livre <span className="tipo-desc">· só cronometra</span>
          </button>
          <button type="button" className={tempo === 'enem' ? 'tipo-op ativo' : 'tipo-op'} onClick={() => setTempo('enem')}>
            Ritmo ENEM <span className="tipo-desc">· 3 min por questão ({minSeg(qtd * 180)})</span>
          </button>
        </div>
        <p className="rotulo-campo">Correção</p>
        <div className="tipos-escolha">
          <button type="button" className={correcao === 'final' ? 'tipo-op ativo' : 'tipo-op'} onClick={() => setCorrecao('final')}>
            No final <span className="tipo-desc">· como na prova</span>
          </button>
          <button type="button" className={correcao === 'hora' ? 'tipo-op ativo' : 'tipo-op'} onClick={() => setCorrecao('hora')}>
            Na hora <span className="tipo-desc">· a cada questão</span>
          </button>
        </div>
        <div className="linha-botoes">
          <span className="suave pequeno" style={{ marginRight: 'auto' }}>
            {disponiveis.length} {disponiveis.length === 1 ? 'questão disponível' : 'questões disponíveis'} com esses filtros
          </span>
          <button className="botao primario" onClick={comecar} disabled={!disponiveis.length}>
            Começar {Math.min(qtd, disponiveis.length) || ''} {Math.min(qtd, disponiveis.length) === 1 ? 'questão' : 'questões'}
          </button>
        </div>
        {ehMentor && <p className="suave pequeno">Você está vendo como mentor: dá para testar o treino, mas as respostas só são registradas para alunos.</p>}
      </div>
    </>
  )
}

function Rodada({ rodada, ehMentor, noCaderno, onResponder, onCaderno, onSair }) {
  const { questoes, limite } = rodada
  const [atual, setAtual] = useState(0)
  const [respostas, setRespostas] = useState({}) // id -> resposta
  const [agora, setAgora] = useState(Date.now())
  const [fim, setFim] = useState(null)
  const vistoEm = useRef({ [questoes[0]?.id]: Date.now() })

  const decorrido = Math.round(((fim ?? agora) - rodada.inicio) / 1000)
  const restante = limite ? limite - decorrido : null

  useEffect(() => {
    if (fim) return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [fim])

  useEffect(() => {
    if (restante !== null && restante <= 0 && !fim) setFim(Date.now())
  }, [restante, fim])

  function ir(i) {
    setAtual(i)
    vistoEm.current[questoes[i].id] ??= Date.now()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function responder(q, L) {
    const seg = Math.round((Date.now() - (vistoEm.current[q.id] ?? Date.now())) / 1000)
    const r = ehMentor
      ? { alternativa: L, correta: L === q.gabarito, criado_em: new Date().toISOString(), tempo_seg: seg }
      : await onResponder(q, L, seg)
    if (!r.error) setRespostas((x) => ({ ...x, [q.id]: r }))
    return r
  }

  if (fim) {
    const feitas = questoes.filter((q) => respostas[q.id])
    const acertos = feitas.filter((q) => respostas[q.id].correta).length
    const erradas = questoes.filter((q) => respostas[q.id] && !respostas[q.id].correta)
    return (
      <>
        <div className="cartao q-placar">
          <h2>{restante !== null && restante <= 0 ? '⏰ Tempo esgotado!' : 'Treino finalizado'}</h2>
          <div className="resumo-cartoes">
            <div className="cartao mini" style={{ '--cor': '#2f9e44' }}>
              <span className="mini-titulo">Acertos</span>
              <strong className="mini-numero">{acertos}/{questoes.length}</strong>
              <span className="suave pequeno">{questoes.length ? Math.round((acertos / questoes.length) * 100) : 0}% de aproveitamento</span>
            </div>
            <div className="cartao mini" style={{ '--cor': 'var(--primaria)' }}>
              <span className="mini-titulo">Tempo</span>
              <strong className="mini-numero">{minSeg(decorrido)}</strong>
              <span className="suave pequeno">{feitas.length ? `${minSeg(decorrido / feitas.length)} por questão` : '—'}</span>
            </div>
            <div className="cartao mini" style={{ '--cor': '#e8590c' }}>
              <span className="mini-titulo">Em branco</span>
              <strong className="mini-numero">{questoes.length - feitas.length}</strong>
              <span className="suave pequeno">{questoes.length - feitas.length ? 'ficam como não feitas' : 'respondeu todas 👏'}</span>
            </div>
          </div>
          <div className="q-bolinhas">
            {questoes.map((q, i) => {
              const r = respostas[q.id]
              return <span key={q.id} className={r ? (r.correta ? 'q-bolinha certa' : 'q-bolinha errada') : 'q-bolinha'} title={`Questão ${i + 1}`}>{i + 1}</span>
            })}
          </div>
          <div className="linha-botoes">
            <button className="botao primario" onClick={onSair}>Novo treino</button>
          </div>
        </div>
        {erradas.length > 0 && <h3 className="q-subtitulo">Corrija as que errou{ehMentor ? '' : ' e mande para o caderno'}</h3>}
        {erradas.map((q) => (
          <QuestaoCartao
            key={q.id} q={q} indice={questoes.indexOf(q) + 1} ultima={respostas[q.id]} noCaderno={noCaderno.has(q.id)}
            onResponder={(qq, L) => onResponder(qq, L)} onCaderno={ehMentor ? null : onCaderno}
          />
        ))}
      </>
    )
  }

  const q = questoes[atual]
  return (
    <>
      <div className="cartao q-barra">
        <div className="q-barra-topo">
          <strong>Questão {atual + 1} de {questoes.length}</strong>
          <span className={restante !== null && restante < 300 ? 'q-relogio alerta' : 'q-relogio'}>
            ⏱ {restante !== null ? `${minSeg(restante)} restantes` : minSeg(decorrido)}
          </span>
          <button className="botao fantasma pequeno" onClick={() => { if (confirm('Finalizar o treino agora?')) setFim(Date.now()) }}>Finalizar</button>
        </div>
        <div className="q-bolinhas">
          {questoes.map((x, i) => {
            const r = respostas[x.id]
            const cls = ['q-bolinha']
            if (r) cls.push(rodada.correcao === 'hora' ? (r.correta ? 'certa' : 'errada') : 'feita')
            if (i === atual) cls.push('atual')
            return <button key={x.id} className={cls.join(' ')} onClick={() => ir(i)} aria-label={`Ir para a questão ${i + 1}`}>{i + 1}</button>
          })}
        </div>
      </div>

      <QuestaoCartao
        key={q.id}
        q={q}
        ultima={respostas[q.id]}
        noCaderno={noCaderno.has(q.id)}
        mostrarCorrecao={rodada.correcao === 'hora'}
        onResponder={responder}
        onCaderno={ehMentor ? null : onCaderno}
      />

      <div className="q-paginas">
        <button className="botao fantasma" disabled={atual === 0} onClick={() => ir(atual - 1)}>← Anterior</button>
        {atual < questoes.length - 1 ? (
          <button className="botao primario" onClick={() => ir(atual + 1)}>Próxima →</button>
        ) : (
          <button className="botao primario" onClick={() => setFim(Date.now())}>Finalizar e ver resultado</button>
        )}
      </div>
    </>
  )
}

