import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { AREAS, TIPOS_ERRO, MATERIAS_POR_AREA } from './constants'
import SimuladosArea from './SimuladosArea'
import ErrosRapidos from './ErrosRapidos'

const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const detalheVazio = () => ({ aberto: false, questoes: 45, descuido: 0, conteudo: 0, lacuna: 0, materias: {} })
const FORM_VAZIO = () => ({
  data: hojeISO(),
  nome: '',
  linguagens: '',
  humanas: '',
  natureza: '',
  matematica: '',
  redacao: '',
  observacoes: '',
  det: Object.fromEntries(AREAS.map((a) => [a.chave, detalheVazio()])),
})
export const dataBR = (iso) => iso.split('-').reverse().join('/')
const numeroOuNulo = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const totalAcertos = (s) => AREAS.reduce((soma, a) => soma + (s[a.chave] ?? 0), 0)
const temAlgumaArea = (s) => AREAS.some((a) => s[a.chave] !== null)
export const questoesDe = (s, area) => Number(s.detalhes?.[area]?.questoes) || 45

function media(lista, chave) {
  const valores = lista.map((s) => s[chave]).filter((v) => v !== null)
  if (!valores.length) return null
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

// Campo numérico com − e + (mais rápido no celular)
function Contador({ valor, onMudar, max = 45, rotulo, cor }) {
  return (
    <span className="contador" style={{ '--cor': cor }}>
      <span className="contador-rotulo">{rotulo}</span>
      <span className="contador-controles">
        <button type="button" onClick={() => onMudar(Math.max(0, valor - 1))} aria-label={`Menos ${rotulo}`}>−</button>
        <input type="number" inputMode="numeric" min="0" max={max} value={valor} onChange={(e) => onMudar(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} aria-label={rotulo} />
        <button type="button" onClick={() => onMudar(Math.min(max, valor + 1))} aria-label={`Mais ${rotulo}`}>+</button>
      </span>
    </span>
  )
}

export default function Simulados({ alunoId, onVerEvolucao }) {
  const [simulados, setSimulados] = useState([])
  const [errosLigados, setErrosLigados] = useState([]) // erros do caderno ligados a simulados
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(FORM_VAZIO)
  const [editandoId, setEditandoId] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [abrirForm, setAbrirForm] = useState(false)
  const [aba, setAba] = useState('geral')
  const [registrando, setRegistrando] = useState(null) // { simulado, area }
  const [recemSalvo, setRecemSalvo] = useState(null)

  const carregar = useCallback(async () => {
    const [s, e] = await Promise.all([
      supabase.from('simulados').select('*').eq('aluno_id', alunoId).order('data', { ascending: false }).order('criado_em', { ascending: false }),
      supabase.from('erros').select('simulado_id, area').eq('aluno_id', alunoId).not('simulado_id', 'is', null),
    ])
    if (s.error) setErro('Não foi possível carregar os simulados.')
    else {
      setErro('')
      setSimulados(s.data ?? [])
    }
    setErrosLigados(e.data ?? [])
    setCarregando(false)
  }, [alunoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const noCaderno = useMemo(() => {
    const m = {}
    for (const e of errosLigados) {
      const k = `${e.simulado_id}|${e.area}`
      m[k] = (m[k] || 0) + 1
    }
    return m
  }, [errosLigados])

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))
  const mudarDet = (area, campo, valor) =>
    setForm((f) => ({ ...f, det: { ...f.det, [area]: { ...f.det[area], [campo]: valor } } }))
  const mudarMateria = (area, materia, valor) =>
    setForm((f) => ({ ...f, det: { ...f.det, [area]: { ...f.det[area], materias: { ...f.det[area].materias, [materia]: valor } } } }))

  async function salvar(e) {
    e.preventDefault()
    const registro = {
      aluno_id: alunoId,
      data: form.data,
      nome: form.nome.trim(),
      observacoes: form.observacoes.trim(),
      redacao: numeroOuNulo(form.redacao),
    }
    const detalhes = {}
    for (const a of AREAS) {
      const d = form.det[a.chave]
      const questoes = Math.max(1, Math.min(45, Number(d.questoes) || 45))
      const acertos = numeroOuNulo(form[a.chave])
      if (acertos !== null && acertos > questoes) return setErro(`${a.nome}: os acertos (${acertos}) passam do número de questões válidas (${questoes}).`)
      registro[a.chave] = acertos
      const materias = Object.fromEntries(Object.entries(d.materias).filter(([, v]) => Number(v) > 0))
      const temDetalhe = questoes !== 45 || d.descuido || d.conteudo || d.lacuna || Object.keys(materias).length
      if (temDetalhe && acertos !== null) {
        detalhes[a.chave] = { questoes, descuido: d.descuido, conteudo: d.conteudo, lacuna: d.lacuna, materias }
      }
    }
    if (!temAlgumaArea(registro) && registro.redacao === null) {
      setErro('Preencha pelo menos uma área ou a nota da redação.')
      return
    }
    if (Object.keys(detalhes).length || editandoId) registro.detalhes = detalhes

    setSalvando(true)
    const resp = editandoId
      ? await supabase.from('simulados').update(registro).eq('id', editandoId).select().single()
      : await supabase.from('simulados').insert(registro).select().single()
    setSalvando(false)
    if (resp.error) {
      setErro(/detalhes/.test(resp.error.message) ? 'Para salvar os detalhes dos erros, rode o arquivo detalhes.sql no Supabase.' : 'Não foi possível salvar: ' + resp.error.message)
      return
    }
    setErro('')
    setForm(FORM_VAZIO())
    setEditandoId(null)
    setAbrirForm(false)
    setRecemSalvo(resp.data)
    carregar()
  }

  function editar(s) {
    setEditandoId(s.id)
    const f = { data: s.data, nome: s.nome, observacoes: s.observacoes, redacao: s.redacao ?? '', det: {} }
    AREAS.forEach((a) => {
      f[a.chave] = s[a.chave] ?? ''
      const d = s.detalhes?.[a.chave]
      f.det[a.chave] = d
        ? { aberto: true, questoes: d.questoes ?? 45, descuido: d.descuido ?? 0, conteudo: d.conteudo ?? 0, lacuna: d.lacuna ?? 0, materias: d.materias ?? {} }
        : detalheVazio()
    })
    setForm(f)
    setAbrirForm(true)
    setRecemSalvo(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function remover(s) {
    if (!confirm(`Apagar o simulado de ${dataBR(s.data)}${s.nome ? ` (${s.nome})` : ''}? Os erros que estiverem no caderno continuam lá.`)) return
    const { error } = await supabase.from('simulados').delete().eq('id', s.id)
    if (error) setErro('Não foi possível apagar: ' + error.message)
    else carregar()
  }

  function fecharForm() {
    setAbrirForm(false)
    setEditandoId(null)
    setForm(FORM_VAZIO())
    setErro('')
  }

  const ultimo = simulados[0]
  const errosDe = (s, area) => (s[area] === null ? null : questoesDe(s, area) - s[area])

  return (
    <section className="secao">
      {!abrirForm ? (
        <button className="botao primario grande" onClick={() => { setAbrirForm(true); setRecemSalvo(null) }}>
          + Lançar simulado
        </button>
      ) : (
        <form className="cartao" onSubmit={salvar}>
          <h2>{editandoId ? 'Editar simulado' : 'Lançar simulado'}</h2>
          <div className="grade-form">
            <label>
              Data
              <input type="date" value={form.data} onChange={mudar('data')} required />
            </label>
            <label className="largo">
              Nome do simulado
              <input value={form.nome} onChange={mudar('nome')} placeholder="Ex.: ENEM 2019 PPL, 3º SAS 2026" />
            </label>
          </div>

          <p className="suave pequeno">
            Coloque os acertos de cada área. Se quiser, abra “detalhar erros” para dizer o tipo e a matéria de cada erro. Leva 1 minuto e deixa sua análise muito melhor.
          </p>
          <div className="areas-lancar">
            {AREAS.map((a) => {
              const d = form.det[a.chave]
              const acertos = numeroOuNulo(form[a.chave])
              const erros = acertos === null ? null : Math.max(0, (Number(d.questoes) || 45) - acertos)
              const porTipo = d.descuido + d.conteudo + d.lacuna
              const porMateria = Object.values(d.materias).reduce((t, v) => t + (Number(v) || 0), 0)
              return (
                <div key={a.chave} className="area-lancar" style={{ '--cor': a.cor }}>
                  <div className="area-lancar-topo">
                    <label className="campo-area">
                      <span>{a.nome}</span>
                      <input type="number" inputMode="numeric" min="0" max="45" value={form[a.chave]} onChange={mudar(a.chave)} placeholder="acertos" />
                    </label>
                    {erros !== null && <span className="area-lancar-erros">{erros} {erros === 1 ? 'erro' : 'erros'}</span>}
                  </div>
                  <button type="button" className="link detalhar" onClick={() => mudarDet(a.chave, 'aberto', !d.aberto)} aria-expanded={d.aberto}>
                    {d.aberto ? '▴ fechar detalhes' : '▾ detalhar erros'}
                  </button>
                  {d.aberto && (
                    <div className="area-detalhe">
                      <label className="questoes-validas">
                        Questões válidas
                        <input type="number" min="1" max="45" value={d.questoes} onChange={(e) => mudarDet(a.chave, 'questoes', e.target.value)} />
                        <span className="suave pequeno">(diminua se houve anulada)</span>
                      </label>
                      <p className="rotulo-campo">Tipo de erro {erros !== null && <span className={porTipo === erros ? 'confere ok' : 'confere'}>{porTipo}/{erros}</span>}</p>
                      <div className="contadores">
                        {Object.entries(TIPOS_ERRO).map(([k, t]) => (
                          <Contador key={k} rotulo={t.nome} cor={t.cor} valor={d[k]} onMudar={(v) => mudarDet(a.chave, k, v)} />
                        ))}
                      </div>
                      <p className="rotulo-campo">Erros por {a.chave === 'matematica' ? 'tema' : 'matéria'} {erros !== null && <span className={porMateria === erros ? 'confere ok' : 'confere'}>{porMateria}/{erros}</span>}</p>
                      <div className="contadores">
                        {MATERIAS_POR_AREA[a.chave].map((m) => (
                          <Contador key={m} rotulo={m} cor={a.cor} valor={Number(d.materias[m]) || 0} onMudar={(v) => mudarMateria(a.chave, m, v)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            <div className="area-lancar" style={{ '--cor': '#7048e8' }}>
              <label className="campo-area">
                <span>Redação</span>
                <input type="number" inputMode="numeric" min="0" max="1000" step="20" value={form.redacao} onChange={mudar('redacao')} placeholder="0–1000" />
              </label>
            </div>
          </div>

          <label>
            Observações
            <textarea rows="2" value={form.observacoes} onChange={mudar('observacoes')} placeholder="Ex.: 1 anulada; faltou tempo em matemática" />
          </label>

          {erro && <p className="erro">{erro}</p>}
          <div className="linha-botoes">
            <button type="button" className="botao fantasma" onClick={fecharForm}>Cancelar</button>
            <button className="botao primario" disabled={salvando}>
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Salvar simulado'}
            </button>
          </div>
        </form>
      )}

      {!abrirForm && erro && <p className="erro">{erro}</p>}

      {recemSalvo && !abrirForm && AREAS.some((a) => errosDe(recemSalvo, a.chave) > 0) && (
        <div className="cartao chamada-caderno">
          <span aria-hidden="true">📕</span>
          <div>
            <strong>Simulado salvo! Quer mandar as questões erradas para o caderno de erros?</strong>
            <span className="suave pequeno">Assim elas voltam para revisão em 1, 7 e 30 dias. Pode fazer agora ou depois, pela tabela.</span>
          </div>
          <div className="linha-botoes" style={{ marginTop: 0 }}>
            <button className="botao fantasma pequeno" onClick={() => setRecemSalvo(null)}>Depois</button>
            <button className="botao primario pequeno" onClick={() => { setRegistrando({ simulado: recemSalvo, area: AREAS.find((a) => errosDe(recemSalvo, a.chave) > 0).chave }); setRecemSalvo(null) }}>Registrar agora</button>
          </div>
        </div>
      )}

      {registrando && (
        <ErrosRapidos
          alunoId={alunoId}
          simulado={registrando.simulado}
          areaInicial={registrando.area}
          jaNoCaderno={(area) => noCaderno[`${registrando.simulado.id}|${area}`] || 0}
          onFechar={() => setRegistrando(null)}
          onSalvo={() => { setRegistrando(null); carregar() }}
        />
      )}

      {carregando ? (
        <p className="suave">Carregando…</p>
      ) : simulados.length === 0 ? (
        <div className="cartao vazio">
          <p>Nenhum simulado lançado ainda. Clique em “Lançar simulado” para registrar o primeiro.</p>
        </div>
      ) : (
        <>
          <div className="resumo-cartoes">
            {AREAS.map((a) => {
              const m = media(simulados, a.chave)
              return (
                <div key={a.chave} className="cartao mini" style={{ '--cor': a.cor }}>
                  <span className="mini-titulo">{a.nome}</span>
                  <strong className="mini-numero">{ultimo[a.chave] ?? '—'}</strong>
                  <span className="suave pequeno">último · média {m === null ? '—' : m.toFixed(1).replace('.', ',')}</span>
                </div>
              )
            })}
            <div className="cartao mini" style={{ '--cor': '#7048e8' }}>
              <span className="mini-titulo">Redação</span>
              <strong className="mini-numero">{ultimo.redacao ?? '—'}</strong>
              <span className="suave pequeno">
                último · média {media(simulados, 'redacao') === null ? '—' : Math.round(media(simulados, 'redacao'))}
              </span>
            </div>
          </div>

          {onVerEvolucao && (
            <button className="cartao chamada-evolucao" onClick={onVerEvolucao}>
              <span aria-hidden="true">📈</span>
              <span>
                <strong>Ver gráficos e métricas de evolução</strong>
                <span className="suave pequeno">Subida em cada área, total no ano, redação e área para focar</span>
              </span>
              <span className="seta" aria-hidden="true">→</span>
            </button>
          )}

          <nav className="filtros abas-area" aria-label="Ver simulados por área">
            <button className={aba === 'geral' ? 'filtro ativo' : 'filtro'} onClick={() => setAba('geral')}>Todos</button>
            {AREAS.map((a) => (
              <button key={a.chave} className={aba === a.chave ? 'filtro ativo' : 'filtro'} onClick={() => setAba(a.chave)} style={{ '--cor': a.cor }}>
                {a.nome}
              </button>
            ))}
          </nav>

          {aba === 'geral' ? (
            <div className="cartao">
              <h2>Todos os simulados</h2>
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Simulado</th>
                      {AREAS.map((a) => <th key={a.chave} className="num" title={a.nome}>{a.curto}</th>)}
                      <th className="num">Total</th>
                      <th className="num">Redação</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulados.map((s) => (
                      <tr key={s.id}>
                        <td>{dataBR(s.data)}</td>
                        <td>
                          {s.nome || <span className="suave">—</span>}
                          {s.observacoes && <div className="suave pequeno">{s.observacoes}</div>}
                        </td>
                        {AREAS.map((a) => <td key={a.chave} className="num">{s[a.chave] ?? '—'}</td>)}
                        <td className="num"><b>{temAlgumaArea(s) ? totalAcertos(s) : '—'}</b></td>
                        <td className="num">{s.redacao ?? '—'}</td>
                        <td className="acoes-tabela">
                          <button className="link" onClick={() => editar(s)}>editar</button>
                          <button className="link perigo" onClick={() => remover(s)}>apagar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <SimuladosArea
              area={AREAS.find((a) => a.chave === aba)}
              simulados={simulados}
              noCaderno={noCaderno}
              onEditar={editar}
              onRegistrar={(s) => setRegistrando({ simulado: s, area: aba })}
            />
          )}
        </>
      )}
    </section>
  )
}
