import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'
import { AREAS, NOME_SITE, INSTAGRAM } from './constants'
import { LETRAS, DIFICULDADES, nomeArea, origemQuestao } from './questoes-util'
import { hojeISO, somarDias } from './agenda'
import QuestaoCartao, { TextoQuestao } from './QuestaoCartao'
import { conferirTudo, compartilharImagem, primeiroNome } from './estudo'
import { cartaoLista } from './cartoesStory'
import { checarXp } from './xp'

const CAMPOS = 'id, banca, prova, ano, numero, area, materia, assunto, dificuldade, enunciado, imagens, alternativas, gabarito, comentario, revisado'
const dataBR = (d) => (d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '')

async function questoesPorIds(ids) {
  if (!ids.length) return []
  const { data } = await supabase.from('questoes').select(CAMPOS).in('id', ids)
  const porId = new Map((data ?? []).map((q) => [q.id, q]))
  return ids.map((id) => porId.get(id)).filter(Boolean)
}

// Listas de questões: o mentor monta e envia; o aluno resolve, baixa em PDF e guarda questões na pasta
export default function Listas({ perfil, ehMentor, alunos = [] }) {
  return ehMentor ? <ListasMentor perfil={perfil} alunos={alunos} /> : <ListasAluno perfil={perfil} />
}

// ------------------------------------------------------------------ aluno
function ListasAluno({ perfil }) {
  const [aba, setAba] = useState('listas')
  const [minhas, setMinhas] = useState(null)
  const [aberta, setAberta] = useState(null) // { lista, questoes, pasta? }
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('lista_alunos')
      .select('lista_id, enviada_em, concluida_em, acertos, total, listas(id, titulo, descricao, prazo, lista_questoes(questao_id, ordem))')
      .eq('aluno_id', perfil.id).order('enviada_em', { ascending: false })
    if (error) { setErro('As listas ainda não foram ativadas no banco (arquivo gamificacao.sql).'); setMinhas([]); return }
    setMinhas((data ?? []).filter((x) => x.listas))
  }, [perfil.id])
  useEffect(() => { carregar() }, [carregar])

  const abrir = useCallback(async (item) => {
    const ids = [...(item.listas.lista_questoes ?? [])].sort((a, b) => a.ordem - b.ordem).map((x) => x.questao_id)
    const questoes = await questoesPorIds(ids)
    supabase.rpc('abrir_lista', { p_lista: item.lista_id }).then(() => {}, () => {})
    setAberta({ lista: item.listas, item, questoes })
  }, [])

  // veio do "Continuar de onde parou"
  useEffect(() => {
    if (!minhas) return
    let id = null
    try { id = sessionStorage.getItem('abrirLista'); sessionStorage.removeItem('abrirLista') } catch { /* ok */ }
    const item = id && minhas.find((m) => m.lista_id === id)
    if (item) abrir(item)
  }, [minhas, abrir])

  async function abrirPasta() {
    const { data } = await supabase.from('pasta_questoes').select('questao_id, criado_em').eq('aluno_id', perfil.id).order('criado_em', { ascending: false })
    const questoes = await questoesPorIds((data ?? []).map((x) => x.questao_id))
    setAberta({ lista: { id: null, titulo: 'Minha pasta' }, questoes, pasta: true })
  }

  if (aberta) {
    return <ResolverLista perfil={perfil} lista={aberta.lista} questoes={aberta.questoes} pasta={aberta.pasta} onVoltar={() => { setAberta(null); carregar() }} />
  }

  return (
    <section className="secao listas">
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'listas'} className={aba === 'listas' ? 'aba ativa' : 'aba'} onClick={() => setAba('listas')}>📋 Minhas listas</button>
        <button role="tab" aria-selected={aba === 'pasta'} className={aba === 'pasta' ? 'aba ativa' : 'aba'} onClick={() => { setAba('pasta'); abrirPasta() }}>📁 Minha pasta</button>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {minhas === null && <p className="suave">Carregando…</p>}
      {minhas?.length === 0 && !erro && (
        <div className="cartao vazio"><h2>Nenhuma lista ainda</h2><p>Quando seu mentor enviar uma lista de questões, ela aparece aqui.</p></div>
      )}
      <div className="listas-grade">
        {minhas?.map((m) => {
          const n = m.listas.lista_questoes?.length ?? 0
          const feita = !!m.concluida_em
          const atrasada = !feita && m.listas.prazo && m.listas.prazo < hojeISO()
          return (
            <button key={m.lista_id} className={feita ? 'cartao lista-cartao feita' : 'cartao lista-cartao'} onClick={() => abrir(m)}>
              <span className="hoje-kicker">{n} questões{m.listas.prazo ? ` · até ${dataBR(m.listas.prazo)}` : ''}</span>
              <strong>{m.listas.titulo}</strong>
              {m.listas.descricao && <span className="suave pequeno">{m.listas.descricao}</span>}
              <span className={feita ? 'selo-lista ok' : atrasada ? 'selo-lista atraso' : 'selo-lista'}>
                {feita ? `✓ ${m.acertos}/${m.total} acertos` : atrasada ? 'Prazo passou' : 'Resolver →'}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function ResolverLista({ perfil, lista, questoes, pasta, onVoltar, demo }) {
  const [i, setI] = useState(0)
  const [respostas, setRespostas] = useState({}) // questao_id -> { alternativa, correta }
  const [naPasta, setNaPasta] = useState(new Set())
  const [noCaderno, setNoCaderno] = useState(new Set())
  const [resultado, setResultado] = useState(null)
  const [imprimir, setImprimir] = useState(null) // { gabarito: bool }
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (demo) return
    ;(async () => {
      const ids = questoes.map((q) => q.id)
      if (!ids.length) return
      const [p, c, r] = await Promise.all([
        supabase.from('pasta_questoes').select('questao_id').eq('aluno_id', perfil.id).in('questao_id', ids),
        supabase.from('erros').select('questao_id').eq('aluno_id', perfil.id).in('questao_id', ids),
        lista.id ? supabase.from('respostas').select('questao_id, alternativa, correta, criado_em').eq('aluno_id', perfil.id).eq('lista_id', lista.id).order('criado_em') : Promise.resolve({ data: [] }),
      ])
      setNaPasta(new Set((p.data ?? []).map((x) => x.questao_id)))
      setNoCaderno(new Set((c.data ?? []).map((x) => x.questao_id)))
      const feitas = Object.fromEntries((r.data ?? []).map((x) => [x.questao_id, x]))
      setRespostas(feitas)
      const prox = questoes.findIndex((q) => !feitas[q.id])
      if (prox > 0) setI(prox)
    })()
  }, [questoes, lista.id, perfil.id, demo])

  const responder = useCallback(async (q, alternativa) => {
    if (demo) { const r = { alternativa, correta: alternativa === q.gabarito, criado_em: new Date().toISOString() }; setRespostas((x) => ({ ...x, [q.id]: r })); return r }
    const { data, error } = await supabase.from('respostas')
      .insert({ questao_id: q.id, alternativa, lista_id: lista.id || null })
      .select('questao_id, alternativa, correta, criado_em').single()
    if (error) return { error: 'Não foi possível registrar: ' + error.message }
    setRespostas((x) => ({ ...x, [q.id]: data }))
    checarXp()
    return data
  }, [lista.id, demo])

  const mandarCaderno = useCallback(async (q, motivo = 'conteudo') => {
    if (demo) { setNoCaderno((s) => new Set(s).add(q.id)); return {} }
    const { error } = await supabase.from('erros').insert({
      aluno_id: perfil.id, questao_id: q.id, area: q.area, materia: q.materia, assunto: q.assunto, motivo,
      origem: lista.titulo ? `Lista: ${lista.titulo}`.slice(0, 120) : origemQuestao(q), numero_questao: q.numero, proxima_revisao: somarDias(hojeISO(), 1),
    })
    if (error) return { error: 'Não foi possível mandar para o caderno: ' + error.message }
    setNoCaderno((s) => new Set(s).add(q.id))
    return {}
  }, [perfil.id, lista.titulo, demo])

  async function alternarPasta(q) {
    const tem = naPasta.has(q.id)
    setNaPasta((s) => { const n = new Set(s); tem ? n.delete(q.id) : n.add(q.id); return n })
    if (demo) return
    const { error } = tem
      ? await supabase.from('pasta_questoes').delete().eq('aluno_id', perfil.id).eq('questao_id', q.id)
      : await supabase.from('pasta_questoes').insert({ aluno_id: perfil.id, questao_id: q.id })
    if (error) setMsg('Não foi possível atualizar a pasta: ' + error.message)
  }

  async function terminar() {
    // erros vão para o caderno
    const erradas = questoes.filter((q) => respostas[q.id] && !respostas[q.id].correta && !noCaderno.has(q.id))
    for (const q of erradas) await mandarCaderno(q, 'conteudo')
    let r = { acertos: questoes.filter((q) => respostas[q.id]?.correta).length, respondidas: Object.keys(respostas).length, total: questoes.length }
    if (!demo && lista.id) {
      const { data } = await supabase.rpc('concluir_lista', { p_lista: lista.id })
      if (data) r = data
      conferirTudo(perfil.id)
    }
    setResultado({ ...r, paraCaderno: erradas.length })
  }

  const q = questoes[i]
  const respondidas = questoes.filter((x) => respostas[x.id]).length

  if (!questoes.length) {
    return (
      <section className="secao">
        <button className="botao fantasma" onClick={onVoltar}>← Voltar</button>
        <div className="cartao vazio"><h2>{pasta ? 'Sua pasta está vazia' : 'Lista sem questões'}</h2><p>{pasta ? 'Toque em “Salvar na minha pasta” numa questão para guardar e refazer depois.' : 'Peça ao seu mentor para revisar esta lista.'}</p></div>
      </section>
    )
  }

  if (resultado) {
    return <ResultadoLista perfil={perfil} lista={lista} r={resultado} onRever={() => { setResultado(null); setI(0) }} onVoltar={onVoltar} onPdf={() => setImprimir({ gabarito: true })} imprimir={imprimir} questoes={questoes} onFimImpressao={() => setImprimir(null)} />
  }

  return (
    <section className="secao resolver">
      <div className="resolver-topo">
        <button className="botao fantasma pequeno" onClick={onVoltar}>← Listas</button>
        <div className="resolver-titulo">
          <strong>{lista.titulo}</strong>
          <span>Questão <b>{i + 1}</b> de {questoes.length} · {respondidas} respondidas</span>
        </div>
        <button className="botao pequeno" onClick={() => setImprimir({ gabarito: true })}>⬇ Baixar PDF</button>
      </div>
      <div className="hoje-barra" role="progressbar" aria-valuemin={0} aria-valuemax={questoes.length} aria-valuenow={respondidas}><i style={{ width: `${(respondidas / questoes.length) * 100}%` }} /></div>
      {msg && <p className="erro">{msg}</p>}

      <QuestaoCartao
        key={q.id}
        q={q}
        indice={i + 1}
        ultima={respostas[q.id] ? { ...respostas[q.id] } : null}
        noCaderno={noCaderno.has(q.id)}
        onResponder={responder}
        onCaderno={mandarCaderno}
        acoes={(
          <button className={naPasta.has(q.id) ? 'botao-pasta salva' : 'botao-pasta'} onClick={() => alternarPasta(q)} aria-pressed={naPasta.has(q.id)}>
            {naPasta.has(q.id) ? '📁 Na pasta' : '📁 Salvar na minha pasta'}
          </button>
        )}
      />

      <div className="resolver-nav">
        <button className="botao" disabled={i === 0} onClick={() => setI(i - 1)}>← Anterior</button>
        {i < questoes.length - 1
          ? <button className="botao primario" onClick={() => setI(i + 1)}>Próxima →</button>
          : !pasta && <button className="botao lima" onClick={terminar} disabled={!respondidas}>Terminar lista ✓</button>}
      </div>
      <div className="resolver-pontos" aria-label="Ir para a questão">
        {questoes.map((x, k) => (
          <button key={x.id} className={[k === i ? 'atual' : '', respostas[x.id] ? (respostas[x.id].correta ? 'certa' : 'errada') : ''].join(' ')} onClick={() => setI(k)} aria-label={`Questão ${k + 1}`}>{k + 1}</button>
        ))}
      </div>
      {imprimir && <ImpressaoLista lista={lista} aluno={perfil} questoes={questoes} gabarito={imprimir.gabarito} onFim={() => setImprimir(null)} />}
    </section>
  )
}

function ResultadoLista({ perfil, lista, r, onRever, onVoltar, onPdf, imprimir, questoes, onFimImpressao }) {
  const pct = r.total ? Math.round((r.acertos / r.total) * 100) : 0
  const [gerando, setGerando] = useState(false)
  async function story() {
    setGerando(true)
    try { await compartilharImagem(await cartaoLista({ nome: perfil.nome, titulo: lista.titulo, acertos: r.acertos, total: r.total }), 'minha-lista-jc.png', '#AssessoriaJC') } finally { setGerando(false) }
  }
  return (
    <section className="secao">
      <div className="hoje-destaque centro">
        <span className="hoje-kicker">Lista concluída</span>
        <h2 className="resultado-numero">{r.acertos}<small>/{r.total}</small></h2>
        <p><em>{pct >= 80 ? 'mandou muito bem!' : pct >= 60 ? 'bom caminho!' : 'cada erro é um ponto a menos no ENEM'}</em> · {pct}% de acerto em {lista.titulo}</p>
        {r.paraCaderno > 0 && <p className="pequeno">📕 {r.paraCaderno} {r.paraCaderno === 1 ? 'erro foi' : 'erros foram'} para o caderno de erros.</p>}
        <div className="linha-botoes centro">
          <button className="botao lima" onClick={story} disabled={gerando}>{gerando ? 'Gerando…' : '📲 Postar no story'}</button>
          <button className="botao" onClick={onPdf}>⬇ Baixar PDF</button>
          <button className="botao fantasma claro" onClick={onRever}>Rever questões</button>
        </div>
      </div>
      <button className="botao fantasma" onClick={onVoltar}>← Voltar às listas</button>
      {imprimir && <ImpressaoLista lista={lista} aluno={perfil} questoes={questoes} gabarito={imprimir.gabarito} onFim={onFimImpressao} />}
    </section>
  )
}

// PDF: folha pronta para "Salvar como PDF" (capa, questões com imagens e gabarito no fim)
export function ImpressaoLista({ lista, aluno, questoes, gabarito = true, onFim, semImprimir }) {
  useEffect(() => {
    if (semImprimir) return
    document.body.classList.add('imprimindo-lista')
    const titulo = document.title
    document.title = `${lista.titulo} — ${NOME_SITE}`
    const fim = () => { document.body.classList.remove('imprimindo-lista'); document.title = titulo; onFim?.() }
    window.addEventListener('afterprint', fim, { once: true })
    const t = setTimeout(() => window.print(), 400) // espera as imagens
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fim); document.body.classList.remove('imprimindo-lista'); document.title = titulo }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className="lista-pdf">
      <section className="pdf-capa">
        <div className="pdf-marca"><img src="/favicon.svg?v=2" alt="" /> <b>{NOME_SITE}</b></div>
        <span className="pdf-kicker">Lista de questões</span>
        <h1>{lista.titulo}</h1>
        <p className="pdf-aluno">Aluno(a): <b>{aluno?.nome || '____________________________'}</b></p>
        <p className="pdf-info">{questoes.length} questões{lista.prazo ? ` · entregar até ${dataBR(lista.prazo)}` : ''} · {new Date().toLocaleDateString('pt-BR')}</p>
        <p className="pdf-rodape">{NOME_SITE}{INSTAGRAM ? ` · @${INSTAGRAM}` : ''}</p>
      </section>
      {questoes.map((q, k) => (
        <article key={q.id} className="pdf-questao">
          <header><b>Questão {k + 1}</b><span>{q.prova || q.banca}{q.ano ? ` ${q.ano}` : ''} · {nomeArea(q.area)}{q.materia ? ` · ${q.materia}` : ''}</span></header>
          <TextoQuestao texto={q.enunciado} imagens={q.imagens} />
          <ol className="pdf-alts">
            {LETRAS.filter((L) => q.alternativas?.[L] && q.alternativas[L] !== '{{alt}}').map((L) => (
              <li key={L}><b>{L})</b> <TextoQuestao texto={q.alternativas[L]} imagens={q.imagens} className="pdf-alt-texto" /></li>
            ))}
          </ol>
        </article>
      ))}
      {gabarito && (
        <section className="pdf-gabarito">
          <h2>Gabarito</h2>
          <ol>{questoes.map((q, k) => <li key={q.id}><span>{k + 1}</span><b>{q.gabarito || '—'}</b></li>)}</ol>
          <p className="pdf-rodape">{NOME_SITE}{INSTAGRAM ? ` · @${INSTAGRAM}` : ''}</p>
        </section>
      )}
    </div>,
    document.body,
  )
}

// ------------------------------------------------------------------ mentor / CEO
function ListasMentor({ perfil, alunos }) {
  const [listas, setListas] = useState(null)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [imprimir, setImprimir] = useState(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('listas')
      .select('id, titulo, descricao, prazo, criado_por, criado_em, lista_questoes(questao_id, ordem), lista_alunos(aluno_id, concluida_em, acertos, total)')
      .order('criado_em', { ascending: false })
    if (error) { setErro('As listas ainda não foram ativadas no banco (arquivo gamificacao.sql).'); setListas([]); return }
    setListas(data ?? [])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const nomeAluno = (id) => alunos.find((a) => a.id === id)?.nome || 'Aluno'

  async function apagar(l) {
    if (!window.confirm(`Apagar a lista "${l.titulo}"? As respostas dos alunos continuam no banco de questões.`)) return
    const { error } = await supabase.from('listas').delete().eq('id', l.id)
    if (error) return setErro('Não foi possível apagar: ' + error.message)
    carregar()
  }
  async function enviarPara(l, ids) {
    if (!ids.length) return
    const { error } = await supabase.from('lista_alunos').upsert(ids.map((aluno_id) => ({ lista_id: l.id, aluno_id })), { onConflict: 'lista_id,aluno_id', ignoreDuplicates: true })
    if (error) return setErro('Não foi possível enviar: ' + error.message)
    carregar()
  }
  async function pdf(l) {
    const ids = [...(l.lista_questoes ?? [])].sort((a, b) => a.ordem - b.ordem).map((x) => x.questao_id)
    setImprimir({ lista: l, questoes: await questoesPorIds(ids) })
  }

  if (criando) return <MontarLista perfil={perfil} alunos={alunos} onFechar={() => { setCriando(false); carregar() }} />

  return (
    <section className="secao listas">
      <div className="linha-botoes" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
        <button className="botao primario" onClick={() => setCriando(true)}>＋ Montar nova lista</button>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {listas === null && <p className="suave">Carregando…</p>}
      {listas?.length === 0 && !erro && <div className="cartao vazio"><h2>Nenhuma lista ainda</h2><p>Monte uma lista a partir do banco de questões e envie para os seus alunos.</p></div>}
      {listas?.map((l) => (
        <ListaMentorCartao key={l.id} l={l} alunos={alunos} nomeAluno={nomeAluno} podeApagar={perfil.papel === 'ceo' || l.criado_por === perfil.id}
          onApagar={() => apagar(l)} onEnviar={(ids) => enviarPara(l, ids)} onPdf={() => pdf(l)} />
      ))}
      {imprimir && <ImpressaoLista lista={imprimir.lista} questoes={imprimir.questoes} gabarito onFim={() => setImprimir(null)} />}
    </section>
  )
}

function ListaMentorCartao({ l, alunos, nomeAluno, podeApagar, onApagar, onEnviar, onPdf }) {
  const [enviando, setEnviando] = useState(false)
  const [sel, setSel] = useState([])
  const ja = new Set((l.lista_alunos ?? []).map((x) => x.aluno_id))
  return (
    <div className="cartao lista-mentor">
      <div className="hoje-missoes-topo">
        <div>
          <span className="hoje-kicker">{l.lista_questoes?.length ?? 0} questões{l.prazo ? ` · prazo ${dataBR(l.prazo)}` : ''}</span>
          <h2>{l.titulo}</h2>
        </div>
        <div className="linha-botoes" style={{ marginTop: 0 }}>
          <button className="botao pequeno" onClick={onPdf}>⬇ PDF</button>
          <button className="botao pequeno" onClick={() => setEnviando((v) => !v)}>Enviar</button>
          {podeApagar && <button className="botao fantasma pequeno" onClick={onApagar}>Apagar</button>}
        </div>
      </div>
      {(l.lista_alunos ?? []).length > 0 && (
        <ul className="lista-alunos">
          {l.lista_alunos.map((a) => (
            <li key={a.aluno_id}><span>{nomeAluno(a.aluno_id)}</span>{a.concluida_em ? <b className="certo">{a.acertos}/{a.total}</b> : <span className="suave pequeno">pendente</span>}</li>
          ))}
        </ul>
      )}
      {enviando && (
        <div className="lista-enviar">
          {alunos.filter((a) => !ja.has(a.id)).map((a) => (
            <label key={a.id} className="caixa-marcar"><input type="checkbox" checked={sel.includes(a.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))} /> {a.nome}</label>
          ))}
          <button className="botao primario pequeno" disabled={!sel.length} onClick={() => { onEnviar(sel); setSel([]); setEnviando(false) }}>Enviar para {sel.length || ''} aluno(s)</button>
        </div>
      )}
    </div>
  )
}

function MontarLista({ perfil, alunos, onFechar }) {
  const [f, setF] = useState({ area: '', materia: '', assunto: '', ano: '', dificuldade: '' })
  const [resultado, setResultado] = useState(null)
  const [escolhidas, setEscolhidas] = useState([]) // questões (na ordem)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo] = useState('')
  const [paraQuem, setParaQuem] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [materias, setMaterias] = useState([])

  useEffect(() => {
    supabase.from('questoes').select('materia').not('materia', 'is', null).limit(5000).then(({ data }) => {
      setMaterias([...new Set((data ?? []).map((x) => x.materia).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')))
    })
  }, [])

  async function buscar(e) {
    e?.preventDefault()
    let b = supabase.from('questoes').select(CAMPOS).not('gabarito', 'is', null)
    if (f.area) b = b.eq('area', f.area)
    if (f.materia) b = b.eq('materia', f.materia)
    if (f.assunto.trim()) b = b.or(`assunto.ilike.%${f.assunto.trim().replace(/[%,()]/g, '')}%,enunciado.ilike.%${f.assunto.trim().replace(/[%,()]/g, '')}%`)
    if (f.ano) b = b.eq('ano', Number(f.ano))
    if (f.dificuldade) b = b.eq('dificuldade', f.dificuldade)
    const { data, error } = await b.order('ano', { ascending: false }).order('numero').limit(60)
    if (error) return setErro('Não foi possível buscar: ' + error.message)
    setResultado(data ?? [])
  }

  const escolhidasIds = useMemo(() => new Set(escolhidas.map((q) => q.id)), [escolhidas])
  const alternar = (q) => setEscolhidas((l) => (escolhidasIds.has(q.id) ? l.filter((x) => x.id !== q.id) : [...l, q]))

  async function salvar() {
    if (!titulo.trim()) return setErro('Dê um nome para a lista.')
    if (!escolhidas.length) return setErro('Escolha pelo menos uma questão.')
    setSalvando(true)
    setErro('')
    const { data: l, error } = await supabase.from('listas').insert({ titulo: titulo.trim(), descricao: descricao.trim(), prazo: prazo || null, criado_por: perfil.id }).select('id').single()
    if (error) { setSalvando(false); return setErro('Não foi possível criar a lista: ' + error.message) }
    const r1 = await supabase.from('lista_questoes').insert(escolhidas.map((q, k) => ({ lista_id: l.id, questao_id: q.id, ordem: k })))
    const r2 = paraQuem.length ? await supabase.from('lista_alunos').insert(paraQuem.map((aluno_id) => ({ lista_id: l.id, aluno_id }))) : { error: null }
    setSalvando(false)
    if (r1.error || r2.error) return setErro('A lista foi criada, mas algo falhou: ' + (r1.error || r2.error).message)
    onFechar()
  }

  const anos = Array.from({ length: 2025 - 2009 + 1 }, (_, k) => 2025 - k)

  return (
    <section className="secao montar-lista">
      <button className="botao fantasma" onClick={onFechar} style={{ alignSelf: 'flex-start' }}>← Voltar</button>
      <form className="cartao filtros-lista" onSubmit={buscar}>
        <span className="hoje-kicker">1. Filtre o banco</span>
        <div className="filtros-grade">
          <label>Área<select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">Todas</option>{AREAS.map((a) => <option key={a.chave} value={a.chave}>{a.nome}</option>)}</select></label>
          <label>Matéria<select value={f.materia} onChange={(e) => setF({ ...f, materia: e.target.value })}><option value="">Todas</option>{materias.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label>Assunto ou palavra<input value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} placeholder="ex.: célula, estequiometria" /></label>
          <label>Ano<select value={f.ano} onChange={(e) => setF({ ...f, ano: e.target.value })}><option value="">Todos</option>{anos.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label>Dificuldade<select value={f.dificuldade} onChange={(e) => setF({ ...f, dificuldade: e.target.value })}><option value="">Todas</option>{Object.entries(DIFICULDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <button className="botao primario">Buscar questões</button>
      </form>

      {resultado && (
        <div className="cartao">
          <span className="hoje-kicker">2. Escolha as questões ({resultado.length} encontradas{resultado.length === 60 ? ', mostrando as 60 primeiras' : ''})</span>
          <ul className="escolher-questoes">
            {resultado.map((q) => (
              <li key={q.id} className={escolhidasIds.has(q.id) ? 'escolhida' : ''}>
                <label>
                  <input type="checkbox" checked={escolhidasIds.has(q.id)} onChange={() => alternar(q)} />
                  <span><b>{q.prova || q.banca} {q.ano} · Q{q.numero}</b> · {q.materia || nomeArea(q.area)}{q.assunto ? ` · ${q.assunto}` : ''}<br /><span className="suave pequeno">{(q.enunciado || '').replace(/\{\{img:\d+\}\}/g, '[figura]').replace(/[‹›]\/?[bi]?/g, '').slice(0, 140)}…</span></span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cartao montar-salvar">
        <span className="hoje-kicker">3. Nome, prazo e alunos · {escolhidas.length} questões escolhidas</span>
        <label>Nome da lista<input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Lista — Introdução à Célula" maxLength={120} /></label>
        <label>Recado (opcional)<input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Faça sem consultar e anote as dúvidas" /></label>
        <label>Prazo (opcional)<input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>
        <fieldset className="lista-enviar">
          <legend>Enviar para</legend>
          {alunos.map((a) => (
            <label key={a.id} className="caixa-marcar"><input type="checkbox" checked={paraQuem.includes(a.id)} onChange={(e) => setParaQuem((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))} /> {primeiroNome(a.nome)} {a.nome?.split(' ').slice(1).join(' ')}</label>
          ))}
        </fieldset>
        {erro && <p className="erro">{erro}</p>}
        <button className="botao primario grande" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar e enviar lista'}</button>
      </div>
    </section>
  )
}
