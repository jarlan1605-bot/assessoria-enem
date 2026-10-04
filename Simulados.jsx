import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { AREAS } from './constants'

const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const FORM_VAZIO = () => ({
  data: hojeISO(),
  nome: '',
  linguagens: '',
  humanas: '',
  natureza: '',
  matematica: '',
  redacao: '',
  observacoes: '',
})
const dataBR = (iso) => iso.split('-').reverse().join('/')
const numeroOuNulo = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const totalAcertos = (s) => AREAS.reduce((soma, a) => soma + (s[a.chave] ?? 0), 0)
const temAlgumaArea = (s) => AREAS.some((a) => s[a.chave] !== null)

function media(lista, chave) {
  const valores = lista.map((s) => s[chave]).filter((v) => v !== null)
  if (!valores.length) return null
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

export default function Simulados({ alunoId, onVerEvolucao }) {
  const [simulados, setSimulados] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(FORM_VAZIO)
  const [editandoId, setEditandoId] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [abrirForm, setAbrirForm] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('simulados')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false })
    if (error) setErro('Não foi possível carregar os simulados.')
    else {
      setErro('')
      setSimulados(data ?? [])
    }
    setCarregando(false)
  }, [alunoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  async function salvar(e) {
    e.preventDefault()
    const registro = {
      aluno_id: alunoId,
      data: form.data,
      nome: form.nome.trim(),
      observacoes: form.observacoes.trim(),
      redacao: numeroOuNulo(form.redacao),
    }
    AREAS.forEach((a) => (registro[a.chave] = numeroOuNulo(form[a.chave])))

    if (!temAlgumaArea(registro) && registro.redacao === null) {
      setErro('Preencha pelo menos uma área ou a nota da redação.')
      return
    }
    setSalvando(true)
    const { error } = editandoId
      ? await supabase.from('simulados').update(registro).eq('id', editandoId)
      : await supabase.from('simulados').insert(registro)
    setSalvando(false)
    if (error) {
      setErro('Não foi possível salvar: ' + error.message)
      return
    }
    setErro('')
    setForm(FORM_VAZIO())
    setEditandoId(null)
    setAbrirForm(false)
    carregar()
  }

  function editar(s) {
    setEditandoId(s.id)
    const f = { data: s.data, nome: s.nome, observacoes: s.observacoes, redacao: s.redacao ?? '' }
    AREAS.forEach((a) => (f[a.chave] = s[a.chave] ?? ''))
    setForm(f)
    setAbrirForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function remover(s) {
    if (!confirm(`Apagar o simulado de ${dataBR(s.data)}${s.nome ? ` (${s.nome})` : ''}?`)) return
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

  return (
    <section className="secao">
      {!abrirForm ? (
        <button className="botao primario grande" onClick={() => setAbrirForm(true)}>
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
              <input value={form.nome} onChange={mudar('nome')} placeholder="Ex.: Simulado SAS 2º dia" />
            </label>
          </div>

          <p className="suave pequeno">Acertos de 0 a 45 em cada área. Deixe em branco o que não fez.</p>
          <div className="grade-areas">
            {AREAS.map((a) => (
              <label key={a.chave} style={{ '--cor': a.cor }} className="campo-area">
                <span>{a.nome}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="45"
                  value={form[a.chave]}
                  onChange={mudar(a.chave)}
                  placeholder="—"
                />
              </label>
            ))}
            <label className="campo-area" style={{ '--cor': '#7048e8' }}>
              <span>Redação</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="1000"
                step="20"
                value={form.redacao}
                onChange={mudar('redacao')}
                placeholder="0–1000"
              />
            </label>
          </div>

          <label>
            Observações
            <textarea
              rows="2"
              value={form.observacoes}
              onChange={mudar('observacoes')}
              placeholder="Ex.: errei muito em genética; faltou tempo em matemática"
            />
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
                  <span className="suave pequeno">
                    último · média {m === null ? '—' : m.toFixed(1)}
                  </span>
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

          <div className="cartao">
            <h2>Todos os simulados</h2>
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Simulado</th>
                    {AREAS.map((a) => (
                      <th key={a.chave} className="num" title={a.nome}>{a.curto}</th>
                    ))}
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
                      {AREAS.map((a) => (
                        <td key={a.chave} className="num">{s[a.chave] ?? '—'}</td>
                      ))}
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
        </>
      )}
    </section>
  )
}
