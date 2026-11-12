import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { AREAS } from './constants'
import { checarXp } from './xp'

/*
  Cartão-resposta de simulados externos (SAS, Bernoulli, etc.)
  A equipe cadastra só o gabarito; o aluno marca as respostas e o banco corrige.
  As questões não ficam no site (direitos autorais).
*/

const MODELOS = {
  dia1: { nome: '1º dia (questões 1 a 90)', inicio: 1, n: 90, areas: [{ area: 'linguagens', de: 1, ate: 45 }, { area: 'humanas', de: 46, ate: 90 }], lingua: true },
  dia2: { nome: '2º dia (questões 91 a 180)', inicio: 91, n: 90, areas: [{ area: 'natureza', de: 91, ate: 135 }, { area: 'matematica', de: 136, ate: 180 }] },
  linguagens: { nome: 'Só Linguagens (1 a 45)', inicio: 1, n: 45, areas: [{ area: 'linguagens', de: 1, ate: 45 }], lingua: true },
  humanas: { nome: 'Só Humanas (46 a 90)', inicio: 46, n: 45, areas: [{ area: 'humanas', de: 46, ate: 90 }] },
  natureza: { nome: 'Só Natureza (91 a 135)', inicio: 91, n: 45, areas: [{ area: 'natureza', de: 91, ate: 135 }] },
  matematica: { nome: 'Só Matemática (136 a 180)', inicio: 136, n: 45, areas: [{ area: 'matematica', de: 136, ate: 180 }] },
}
const area = (k) => AREAS.find((a) => a.chave === k) || { nome: 'Geral', cor: '#868e96', chave: 'geral' }
const LETRAS = ['A', 'B', 'C', 'D', 'E']
// Aceita "ABCDE…", "1-A 2-B", "01 A, 02 B" etc.: pega só as letras de resposta
export function lerGabarito(t) {
  const up = String(t || '').toUpperCase()
  if (/\d/.test(up)) return (up.match(/(?<![A-Z])[A-EX](?![A-Z])/g) || []).join('')
  return (up.match(/[A-EX]/g) || []).join('')
}

function areaDe(g, num) {
  const a = (g.areas || []).find((x) => num >= x.de && num <= x.ate)
  return a ? a.area : 'geral'
}

function PorArea({ por }) {
  const itens = Object.entries(por || {})
  if (!itens.length) return null
  return (
    <div className="se-areas">
      {itens.map(([k, v]) => (
        <div key={k} className="se-area" style={{ '--cor': area(k).cor }}>
          <span>{area(k).nome}</span>
          <b>{v.acertos}/{v.total}</b>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------------
export default function CartaoResposta({ ehMentor, onFoco }) {
  const [lista, setLista] = useState(null)
  const [marcando, setMarcando] = useState(null)
  const [vendo, setVendo] = useState(null)
  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc('gabaritos_disponiveis')
    setLista(data ?? [])
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { onFoco?.(Boolean(marcando || vendo)) }, [marcando, vendo, onFoco])

  if (marcando) return <Marcar g={marcando} onSair={(id) => { setMarcando(null); carregar(); if (id) setVendo(id) }} />
  if (vendo) return <Correcao respostaId={vendo} onVoltar={() => setVendo(null)} />

  const ativos = (lista ?? []).filter((g) => g.ativo || g.minha_resposta)
  return (
    <>
      {ehMentor && <PainelGabaritos onMudou={carregar} />}
      <div className="cartao se-bloco">
        <h3>📝 Cartão-resposta de simulados (SAS e outros)</h3>
        <p className="suave pequeno" style={{ marginTop: 0 }}>Fez o simulado no papel ou na escola? Marque aqui as suas respostas e veja a correção na hora.</p>
        {lista === null ? <p className="suave">Carregando…</p> : !ativos.length ? <p className="suave">Nenhum gabarito cadastrado ainda.</p> : (
          <div className="se-lista">
            {ativos.map((g) => (
              <div key={g.id} className="se-item">
                <div>
                  <strong>{g.titulo}</strong>
                  <span className="suave pequeno">{g.n} questões · {g.numero_inicial} a {g.numero_inicial + g.n - 1}</span>
                </div>
                {g.minha_resposta
                  ? <button className="botao" onClick={() => setVendo(g.minha_resposta)}>Ver minha correção</button>
                  : <button className="botao primario" onClick={() => setMarcando(g)}>Marcar gabarito →</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------
function Marcar({ g, onSair }) {
  const chave = 'cartao:' + g.id
  const [resp, setResp] = useState(() => { try { return JSON.parse(localStorage.getItem(chave)) || {} } catch { return {} } })
  const [lingua, setLingua] = useState('ingles')
  const [tempo, setTempo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [res, setRes] = useState(null)
  const nums = useMemo(() => Array.from({ length: g.n }, (_, i) => g.numero_inicial + i), [g])
  const temLingua = g.tem_lingua && g.numero_inicial <= 5
  const marcadas = nums.filter((n) => resp[n]).length

  function marcar(n, L) {
    const novo = { ...resp }
    if (novo[n] === L) delete novo[n]
    else novo[n] = L
    setResp(novo)
    try { localStorage.setItem(chave, JSON.stringify(novo)) } catch { /* ok */ }
  }

  async function entregar() {
    const faltam = g.n - marcadas
    if (!confirm(faltam ? `Faltam ${faltam} questões sem marcar. Corrigir assim mesmo? (Depois de entregar não dá para mudar.)` : 'Corrigir agora? Depois de entregar não dá para mudar.')) return
    setEnviando(true)
    setErro('')
    const t = Math.round(Number(tempo))
    const { data, error } = await supabase.rpc('entregar_gabarito', { p_gabarito: g.id, p_respostas: resp, p_lingua: temLingua ? lingua : null, p_tempo_min: t >= 1 ? t : null })
    setEnviando(false)
    if (error) return setErro(error.message.replace(/^.*?:\s*(?=[A-ZÁÉ])/, ''))
    try { localStorage.removeItem(chave) } catch { /* ok */ }
    setRes(data)
    checarXp()
  }

  if (res) {
    return (
      <section className="secao se">
        <div className="cartao se-final">
          <span className="se-emoji">✅</span>
          <h2>{g.titulo}</h2>
          <p className="se-nota"><b>{res.acertos}</b> de {res.total} acertos</p>
          <PorArea por={res.por_area} />
          <button className="botao primario" onClick={() => onSair(res.id)}>Ver a correção questão por questão →</button>
        </div>
      </section>
    )
  }

  // agrupa por área
  const grupos = []
  for (const n of nums) {
    const a = areaDe(g, n)
    if (!grupos.length || grupos[grupos.length - 1].a !== a) grupos.push({ a, nums: [] })
    grupos[grupos.length - 1].nums.push(n)
  }

  return (
    <section className="secao se cr">
      <button className="botao fantasma" onClick={() => onSair(null)}>← Voltar</button>
      <div className="cartao se-barra cr-barra">
        <strong className="se-titulo">{g.titulo}</strong>
        <span className="suave pequeno">{marcadas}/{g.n} marcadas · fica salvo neste aparelho</span>
        <button className="botao primario" onClick={entregar} disabled={enviando}>{enviando ? 'Corrigindo…' : 'Terminei: corrigir'}</button>
      </div>
      {erro && <p className="erro">{erro}</p>}
      <div className="cartao se-bloco cr-opcoes">
        {temLingua && (
          <div className="se-chips">
            <span className="suave pequeno">Língua estrangeira (questões 1 a 5):</span>
            {[['ingles', 'Inglês'], ['espanhol', 'Espanhol']].map(([k, n]) => (
              <button key={k} type="button" className={lingua === k ? 'botao pequeno primario' : 'botao pequeno'} onClick={() => setLingua(k)}>{n}</button>
            ))}
          </div>
        )}
        <label className="cr-tempo">Quanto tempo você levou? (minutos, opcional)
          <input type="number" min="1" max="900" value={tempo} onChange={(e) => setTempo(e.target.value)} placeholder="Ex.: 280" />
        </label>
      </div>
      {grupos.map(({ a, nums: ns }) => (
        <div key={a + ns[0]} className="cartao cr-grupo" style={{ '--cor': area(a).cor }}>
          <h3>{area(a).nome} <span className="suave pequeno">({ns[0]} a {ns[ns.length - 1]})</span></h3>
          <div className="cr-grade">
            {ns.map((n) => (
              <div key={n} className={resp[n] ? 'cr-linha feita' : 'cr-linha'}>
                <span className="cr-num">{n}</span>
                {LETRAS.map((L) => (
                  <button key={L} type="button" className={resp[n] === L ? 'cr-bolha on' : 'cr-bolha'} onClick={() => marcar(n, L)} aria-label={`Questão ${n}, letra ${L}`} aria-pressed={resp[n] === L}>{L}</button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="linha-botoes" style={{ justifyContent: 'center' }}>
        <button className="botao primario grande" onClick={entregar} disabled={enviando}>{enviando ? 'Corrigindo…' : `Terminei: corrigir (${marcadas}/${g.n})`}</button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------
function Correcao({ respostaId, onVoltar }) {
  const [r, setR] = useState(null)
  useEffect(() => {
    supabase.from('gabarito_respostas').select('*').eq('id', respostaId).single().then(({ data }) => setR(data))
  }, [respostaId])
  if (!r) return <p className="suave">Carregando…</p>
  const nums = Object.keys(r.correcao || {}).map(Number).sort((a, b) => a - b)
  return (
    <section className="secao se">
      <button className="botao fantasma" onClick={onVoltar}>← Voltar</button>
      <div className="cartao se-final">
        <h2>{r.titulo}</h2>
        <p className="se-nota"><b>{r.acertos}</b> de {r.total} acertos</p>
        <span className="suave pequeno">{r.respondidas} respondidas{r.tempo_min ? ` · ${Math.floor(r.tempo_min / 60)}h${String(r.tempo_min % 60).padStart(2, '0')} de prova` : ''}</span>
        <PorArea por={r.por_area} />
      </div>
      <div className="cartao se-bloco">
        <h3>Correção</h3>
        <div className="cr-correcao">
          {nums.map((n) => {
            const c = r.correcao[n]
            const m = r.respostas?.[n]
            const cl = c === 'X' ? 'anulada' : m === c ? 'certa' : 'errada'
            return (
              <div key={n} className={'cr-corr ' + cl} title={c === 'X' ? 'Anulada' : `Você: ${m || '—'} · Resposta: ${c}`}>
                <b>{n}</b>
                <span>{m || '—'}</span>
                {cl === 'errada' && <small>{c}</small>}
              </div>
            )
          })}
        </div>
        <p className="suave pequeno">Verde: acertou · vermelho: errou ou deixou em branco (embaixo, a letra certa) · cinza: anulada.</p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------
function PainelGabaritos({ onMudou }) {
  const [lista, setLista] = useState([])
  const [novo, setNovo] = useState(false)
  const [vendo, setVendo] = useState(null)
  const carregar = useCallback(async () => {
    const { data } = await supabase.from('gabaritos_externos').select('id, titulo, numero_inicial, gabarito, ativo, criado_em, gabarito_respostas(count)').order('criado_em', { ascending: false })
    setLista(data ?? [])
  }, [])
  useEffect(() => { carregar() }, [carregar])
  async function alternar(g) { await supabase.from('gabaritos_externos').update({ ativo: !g.ativo }).eq('id', g.id); carregar(); onMudou() }
  async function apagar(g) {
    if (!confirm(`Apagar o gabarito “${g.titulo}”? As correções dos alunos também somem.`)) return
    await supabase.from('gabaritos_externos').delete().eq('id', g.id); carregar(); onMudou()
  }
  return (
    <div className="cartao se-bloco se-equipe">
      <div className="se-cabeca">
        <h3>🧾 Gabaritos de simulados externos</h3>
        {!novo && <button className="botao primario" onClick={() => setNovo(true)}>+ Cadastrar gabarito</button>}
      </div>
      {novo && <NovoGabarito onCancelar={() => setNovo(false)} onCriado={() => { setNovo(false); carregar(); onMudou() }} />}
      {lista.length > 0 && (
        <div className="se-lista">
          {lista.map((g) => (
            <div key={g.id} className="se-item">
              <div>
                <strong>{g.titulo}{!g.ativo && <span className="selo" style={{ marginLeft: 6 }}>escondido</span>}</strong>
                <span className="suave pequeno">{g.gabarito.length} questões · {g.gabarito_respostas?.[0]?.count ?? 0} alunos entregaram</span>
              </div>
              <div className="linha-botoes">
                <button className="botao" onClick={() => setVendo(vendo === g.id ? null : g.id)}>{vendo === g.id ? 'Fechar' : 'Resultados'}</button>
                <button className="botao" onClick={() => alternar(g)}>{g.ativo ? 'Esconder' : 'Mostrar'}</button>
                <button className="botao fantasma" onClick={() => apagar(g)}>Apagar</button>
              </div>
              {vendo === g.id && <ResultadosGabarito id={g.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NovoGabarito({ onCancelar, onCriado }) {
  const [titulo, setTitulo] = useState('SAS 6 2024 — 2º dia')
  const [modelo, setModelo] = useState('dia2')
  const [texto, setTexto] = useState('')
  const [espanhol, setEspanhol] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const m = MODELOS[modelo]
  const gab = lerGabarito(texto)
  const esp = lerGabarito(espanhol)

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    if (gab.length !== m.n) return setErro(`O gabarito tem ${gab.length} letras; precisa ter ${m.n}.`)
    if (m.lingua && esp && esp.length !== 5) return setErro('O gabarito de Espanhol precisa ter 5 letras (questões 1 a 5).')
    setSalvando(true)
    const { error } = await supabase.from('gabaritos_externos').insert({
      titulo: titulo.trim().slice(0, 120), numero_inicial: m.inicio, gabarito: gab, areas: m.areas,
      gabarito_ingles: m.lingua && esp ? gab.slice(0, 5) : null, gabarito_espanhol: m.lingua && esp ? esp : null,
    })
    setSalvando(false)
    if (error) return setErro(error.message)
    onCriado()
  }

  return (
    <form className="se-form se-novo" onSubmit={salvar}>
      <label>Nome do simulado<input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} required /></label>
      <span className="rotulo-campo">Qual prova</span>
      <div className="se-chips">
        {Object.entries(MODELOS).map(([k, v]) => (
          <button key={k} type="button" className={modelo === k ? 'botao pequeno primario' : 'botao pequeno'} onClick={() => setModelo(k)}>{v.nome}</button>
        ))}
      </div>
      <label>Gabarito ({m.n} letras, da questão {m.inicio} à {m.inicio + m.n - 1}{m.lingua ? '; nas 1 a 5, o de Inglês' : ''})
        <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole como quiser: ABCDEABCDE… ou 91-A 92-C 93-E… Use X para questão anulada." />
        <span className={gab.length === m.n ? 'pequeno cr-ok' : 'suave pequeno'}>{gab.length}/{m.n} letras{gab.length === m.n ? ' ✓' : ''}</span>
      </label>
      {m.lingua && (
        <label>Gabarito de Espanhol (questões 1 a 5, opcional)
          <input value={espanhol} onChange={(e) => setEspanhol(e.target.value)} placeholder="Ex.: BDACE" />
        </label>
      )}
      {gab.length > 0 && (
        <div className="cr-previa">
          {gab.split('').map((L, i) => <span key={i}><small>{m.inicio + i}</small>{L}</span>)}
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao fantasma" onClick={onCancelar}>Cancelar</button>
        <button className="botao primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar gabarito'}</button>
      </div>
    </form>
  )
}

function ResultadosGabarito({ id }) {
  const [linhas, setLinhas] = useState(null)
  useEffect(() => {
    supabase.from('gabarito_respostas').select('id, acertos, total, respondidas, por_area, tempo_min, enviado_em, aluno:perfis!gabarito_respostas_aluno_id_fkey(nome, email)').eq('gabarito_id', id)
      .then(({ data }) => setLinhas((data ?? []).sort((a, b) => b.acertos - a.acertos)))
  }, [id])
  if (!linhas) return <p className="suave">Carregando…</p>
  if (!linhas.length) return <p className="suave">Nenhum aluno entregou ainda.</p>
  return (
    <div className="se-tabela-envolve">
      <table className="se-tabela">
        <thead><tr><th>#</th><th>Aluno</th><th>Acertos</th>{AREAS.map((a) => <th key={a.chave}>{a.curto}</th>)}<th>Tempo</th><th>Entregou</th></tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td>
              <td>{l.aluno?.nome || l.aluno?.email}</td>
              <td><b>{l.acertos}/{l.total}</b></td>
              {AREAS.map((a) => <td key={a.chave}>{l.por_area?.[a.chave] ? `${l.por_area[a.chave].acertos}/${l.por_area[a.chave].total}` : ''}</td>)}
              <td>{l.tempo_min ? `${l.tempo_min} min` : '—'}</td>
              <td>{new Date(l.enviado_em).toLocaleDateString('pt-BR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
