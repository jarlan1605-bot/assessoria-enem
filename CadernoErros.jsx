import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { AREAS, MATERIAS } from './constants'
import { hojeISO, somarDias } from './agenda'

export const MOTIVOS = {
  conteudo: { nome: 'Não sabia o conteúdo', curto: 'Conteúdo', cor: '#c2255c' },
  interpretacao: { nome: 'Interpretei errado', curto: 'Interpretação', cor: '#7048e8' },
  atencao: { nome: 'Falta de atenção', curto: 'Atenção', cor: '#e67700' },
  tempo: { nome: 'Faltou tempo', curto: 'Tempo', cor: '#1971c2' },
  chute: { nome: 'Chutei', curto: 'Chute', cor: '#868e96' },
}
// Revisão espaçada: 1 dia depois de registrar, depois 7, depois 30 → dominado
const PROXIMO_INTERVALO = [7, 30]
const corArea = (k) => AREAS.find((a) => a.chave === k)?.cor ?? '#868e96'
const nomeArea = (k) => AREAS.find((a) => a.chave === k)?.nome ?? k
const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '')

const FORM_VAZIO = { area: 'natureza', materia: '', assunto: '', motivo: 'conteudo', origem: '', anotacao: '' }

export default function CadernoErros({ alunoId, ehMentor }) {
  const [erros, setErros] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(null) // null | objeto do formulário
  const [editandoId, setEditandoId] = useState(null)
  const [filtroArea, setFiltroArea] = useState('todas')
  const [busca, setBusca] = useState('')
  const hoje = hojeISO()

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('erros')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('criado_em', { ascending: false })
    if (error) setErro('Não foi possível carregar o caderno de erros. O arquivo extras.sql já foi rodado no Supabase?')
    else {
      setErro('')
      setErros(data ?? [])
    }
    setCarregando(false)
  }, [alunoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const paraRevisar = erros.filter((e) => !e.dominado && e.proxima_revisao && e.proxima_revisao <= hoje)
  const dominados = erros.filter((e) => e.dominado).length

  const topAssuntos = useMemo(() => {
    const m = {}
    for (const e of erros) {
      const chave = (e.assunto || e.materia || 'Sem assunto').trim()
      const k = chave.toLowerCase()
      m[k] ??= { nome: chave, area: e.area, n: 0, abertos: 0 }
      m[k].n++
      if (!e.dominado) m[k].abertos++
    }
    return Object.values(m).sort((a, b) => b.n - a.n).slice(0, 8)
  }, [erros])
  const maxAssunto = Math.max(1, ...topAssuntos.map((a) => a.n))

  const porMotivo = Object.keys(MOTIVOS).map((k) => ({ k, n: erros.filter((e) => e.motivo === k).length }))
  const motivoTop = [...porMotivo].sort((a, b) => b.n - a.n)[0]

  const visiveis = erros.filter((e) => {
    if (filtroArea !== 'todas' && e.area !== filtroArea) return false
    const t = busca.trim().toLowerCase()
    return !t || [e.assunto, e.materia, e.origem, e.anotacao].some((x) => (x || '').toLowerCase().includes(t))
  })

  async function salvar(ev) {
    ev.preventDefault()
    if (!form.assunto.trim() && !form.materia.trim()) return setErro('Coloque pelo menos a matéria ou o assunto.')
    const registro = {
      aluno_id: alunoId,
      area: form.area,
      materia: form.materia.trim(),
      assunto: form.assunto.trim(),
      motivo: form.motivo,
      origem: form.origem.trim(),
      anotacao: form.anotacao.trim(),
    }
    const { error } = editandoId
      ? await supabase.from('erros').update(registro).eq('id', editandoId)
      : await supabase.from('erros').insert({ ...registro, proxima_revisao: somarDias(hoje, 1) })
    if (error) return setErro('Não foi possível salvar: ' + error.message)
    setErro('')
    setForm(editandoId ? null : { ...FORM_VAZIO, area: form.area, materia: form.materia, origem: form.origem })
    setEditandoId(null)
    carregar()
  }

  async function revisei(e) {
    const n = e.revisoes + 1
    const dominado = n > PROXIMO_INTERVALO.length
    const { error } = await supabase
      .from('erros')
      .update({ revisoes: n, dominado, proxima_revisao: dominado ? null : somarDias(hoje, PROXIMO_INTERVALO[n - 1]) })
      .eq('id', e.id)
    if (error) setErro(error.message)
    else carregar()
  }

  async function aindaErro(e) {
    const { error } = await supabase
      .from('erros')
      .update({ revisoes: 0, dominado: false, proxima_revisao: somarDias(hoje, 1) })
      .eq('id', e.id)
    if (error) setErro(error.message)
    else carregar()
  }

  async function apagar(e) {
    if (!confirm(`Apagar o erro de “${e.assunto || e.materia}”?`)) return
    const { error } = await supabase.from('erros').delete().eq('id', e.id)
    if (error) setErro(error.message)
    else carregar()
  }

  function editar(e) {
    setEditandoId(e.id)
    setForm({ area: e.area, materia: e.materia, assunto: e.assunto, motivo: e.motivo, origem: e.origem, anotacao: e.anotacao })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (carregando) return <p className="suave">Carregando…</p>

  return (
    <section className="secao">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>Caderno de erros</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>
            Registre cada questão errada. O site lembra de revisar em 1, 7 e 30 dias, até virar ponto forte.
          </p>
        </div>
        {!form && (
          <button className="botao primario" onClick={() => { setForm(FORM_VAZIO); setEditandoId(null) }}>+ Registrar erro</button>
        )}
      </div>

      {erro && <p className="erro">{erro}</p>}

      {form && (
        <form className="cartao" onSubmit={salvar}>
          <h2>{editandoId ? 'Editar erro' : 'Registrar erro'}</h2>
          <div className="tipos-escolha">
            {AREAS.map((a) => (
              <button type="button" key={a.chave} className={form.area === a.chave ? 'tipo-op ativo' : 'tipo-op'} style={{ '--cor': a.cor }} onClick={() => setForm({ ...form, area: a.chave })}>
                {a.nome}
              </button>
            ))}
          </div>
          <div className="grade-form">
            <label>
              Matéria
              <input list="lista-materias" value={form.materia} onChange={(e) => setForm({ ...form, materia: e.target.value })} placeholder="Ex.: Biologia" />
              <datalist id="lista-materias">
                {MATERIAS.filter((m) => !['Revisão', 'Simulado', 'Descanso', 'Outro'].includes(m.nome)).map((m) => <option key={m.nome} value={m.nome} />)}
              </datalist>
            </label>
            <label className="largo-2">
              Assunto
              <input value={form.assunto} onChange={(e) => setForm({ ...form, assunto: e.target.value })} placeholder="Ex.: Genética — 2ª Lei de Mendel" />
            </label>
            <label>
              De onde veio
              <input value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} placeholder="Ex.: SAS 5 — Q112" />
            </label>
          </div>
          <p className="rotulo-campo">Por que errou?</p>
          <div className="tipos-escolha">
            {Object.entries(MOTIVOS).map(([k, m]) => (
              <button type="button" key={k} className={form.motivo === k ? 'tipo-op ativo' : 'tipo-op'} style={{ '--cor': m.cor }} onClick={() => setForm({ ...form, motivo: k })}>
                {m.nome}
              </button>
            ))}
          </div>
          <label>
            O que aprendi (para não errar de novo)
            <textarea rows="3" value={form.anotacao} onChange={(e) => setForm({ ...form, anotacao: e.target.value })} placeholder="Ex.: na 2ª lei, multiplicar as probabilidades de cada gene separadamente" />
          </label>
          <div className="linha-botoes">
            <button type="button" className="botao fantasma" onClick={() => { setForm(null); setEditandoId(null) }}>Fechar</button>
            <button className="botao primario">{editandoId ? 'Salvar' : 'Registrar e continuar'}</button>
          </div>
        </form>
      )}

      <div className="resumo-cartoes resumo-agenda">
        <div className="cartao mini" style={{ '--cor': '#e8590c' }}>
          <span className="mini-titulo">Revisar hoje</span>
          <strong className="mini-numero">{paraRevisar.length}</strong>
          <span className="suave pequeno">{paraRevisar.length ? 'questões esperando você' : 'tudo em dia 👏'}</span>
        </div>
        <div className="cartao mini" style={{ '--cor': 'var(--primaria)' }}>
          <span className="mini-titulo">Erros registrados</span>
          <strong className="mini-numero">{erros.length}</strong>
          <span className="suave pequeno">{erros.filter((e) => e.criado_em.slice(0, 7) === hoje.slice(0, 7)).length} este mês</span>
        </div>
        <div className="cartao mini" style={{ '--cor': '#2f9e44' }}>
          <span className="mini-titulo">Dominados</span>
          <strong className="mini-numero">{dominados}</strong>
          <span className="suave pequeno">revisados 3 vezes</span>
        </div>
        <div className="cartao mini" style={{ '--cor': motivoTop?.n ? MOTIVOS[motivoTop.k].cor : '#868e96' }}>
          <span className="mini-titulo">Motivo mais comum</span>
          <strong className="mini-numero" style={{ fontSize: 20, marginTop: 6 }}>{motivoTop?.n ? MOTIVOS[motivoTop.k].curto : '—'}</strong>
          <span className="suave pequeno">{motivoTop?.n ? `${Math.round((motivoTop.n / erros.length) * 100)}% dos erros` : 'registre seus erros'}</span>
        </div>
      </div>

      {paraRevisar.length > 0 && (
        <div className="cartao revisar">
          <h2>🔁 Revisar hoje</h2>
          <p className="suave pequeno">Releia a anotação, refaça a questão e diga como foi.</p>
          {paraRevisar.map((e) => (
            <div key={e.id} className="erro-item" style={{ '--cor': corArea(e.area) }}>
              <div className="erro-info">
                <strong>{e.assunto || e.materia}</strong>
                <span className="suave pequeno">
                  {nomeArea(e.area)}{e.materia && e.assunto && e.materia !== nomeArea(e.area) ? ` · ${e.materia}` : ''}{e.origem ? ` · ${e.origem}` : ''} · {e.revisoes + 1}ª revisão
                </span>
                {e.anotacao && <p className="erro-anotacao">💡 {e.anotacao}</p>}
              </div>
              <div className="erro-acoes">
                <button className="botao primario pequeno" onClick={() => revisei(e)}>Acertei ✓</button>
                <button className="botao fantasma pequeno" onClick={() => aindaErro(e)}>Ainda erro</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {erros.length > 0 && (
        <div className="graficos">
          <div className="cartao">
            <h2>Assuntos que você mais erra</h2>
            <div className="barras-h">
              {topAssuntos.map((a) => (
                <div key={a.nome} className="barra-h">
                  <span className="barra-h-nome" title={a.nome}>{a.nome}</span>
                  <span className="barra-h-trilho"><i style={{ width: `${(a.n / maxAssunto) * 100}%`, background: corArea(a.area) }} /></span>
                  <span className="barra-h-num">{a.n}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="cartao">
            <h2>Por que você erra</h2>
            <div className="barras-h">
              {porMotivo.map(({ k, n }) => (
                <div key={k} className="barra-h">
                  <span className="barra-h-nome">{MOTIVOS[k].curto}</span>
                  <span className="barra-h-trilho"><i style={{ width: `${erros.length ? (n / erros.length) * 100 : 0}%`, background: MOTIVOS[k].cor }} /></span>
                  <span className="barra-h-num">{n}</span>
                </div>
              ))}
            </div>
            {motivoTop?.n > 0 && (
              <p className="suave pequeno" style={{ marginTop: 10, marginBottom: 0 }}>
                {motivoTop.k === 'conteudo' && 'Dica: a maioria é falta de conteúdo. Volte à teoria desses assuntos antes de fazer mais questões.'}
                {motivoTop.k === 'atencao' && 'Dica: a maioria é falta de atenção. Sublinhe o comando da questão e confira as alternativas antes de marcar.'}
                {motivoTop.k === 'tempo' && 'Dica: o tempo está pesando. Treine com cronômetro e pule as questões longas na primeira passada.'}
                {motivoTop.k === 'interpretacao' && 'Dica: muitos erros de interpretação. Leia primeiro a pergunta, depois o texto-base.'}
                {motivoTop.k === 'chute' && 'Dica: muitos chutes. Marque essas questões e revise o assunto com calma.'}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="cartao">
        <div className="alunos-topo">
          <h2 style={{ margin: 0 }}>Todos os erros</h2>
          <div className="alunos-filtros">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar assunto, prova…" />
            <select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)}>
              <option value="todas">Todas as áreas</option>
              {AREAS.map((a) => <option key={a.chave} value={a.chave}>{a.nome}</option>)}
            </select>
          </div>
        </div>
        {visiveis.length === 0 ? (
          <p className="suave" style={{ margin: '12px 0 0' }}>
            {erros.length ? 'Nada encontrado.' : ehMentor ? 'Este aluno ainda não registrou erros.' : 'Nenhum erro registrado ainda. Depois de cada simulado ou lista, registre as questões que errou.'}
          </p>
        ) : (
          visiveis.map((e) => (
            <div key={e.id} className={e.dominado ? 'erro-item dominado' : 'erro-item'} style={{ '--cor': corArea(e.area) }}>
              <div className="erro-info">
                <strong>{e.assunto || e.materia}</strong>
                <span className="suave pequeno">
                  {nomeArea(e.area)}{e.materia && e.assunto && e.materia !== nomeArea(e.area) ? ` · ${e.materia}` : ''}{e.origem ? ` · ${e.origem}` : ''} · {MOTIVOS[e.motivo]?.curto}
                </span>
                {e.anotacao && <p className="erro-anotacao">💡 {e.anotacao}</p>}
              </div>
              <div className="erro-acoes">
                <span className={e.dominado ? 'selo selo-novo' : 'selo selo-fixado'}>
                  {e.dominado ? '✓ dominado' : e.proxima_revisao <= hoje ? 'revisar hoje' : `revisar ${dataBR(e.proxima_revisao)}`}
                </span>
                <button className="link" onClick={() => editar(e)}>editar</button>
                <button className="link perigo" onClick={() => apagar(e)}>apagar</button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
