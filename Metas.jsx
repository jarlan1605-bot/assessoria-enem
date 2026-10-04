import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { AREAS } from './constants'
import { hojeISO } from './agenda'

const OPCOES = [
  ...AREAS.map((a) => ({ chave: a.chave, nome: a.nome, cor: a.cor, max: 45, unidade: 'acertos' })),
  { chave: 'total', nome: 'Total (4 áreas)', cor: '#2b8a6e', max: 180, unidade: 'acertos' },
  { chave: 'redacao', nome: 'Redação', cor: '#7048e8', max: 1000, unidade: 'pontos' },
]
const opcao = (k) => OPCOES.find((o) => o.chave === k) ?? OPCOES[0]

// Valor atual = média dos 3 últimos resultados daquela área
function valorAtual(chave, simulados, redacoes = []) {
  const fonte = chave === 'redacao' ? [...simulados, ...redacoes].sort((a, b) => a.data.localeCompare(b.data)) : simulados
  const vals = fonte
    .map((s) => (chave === 'total' ? s.total : s[chave]))
    .filter((v) => v !== null && v !== undefined)
  if (!vals.length) return null
  const ult = vals.slice(-3)
  return ult.reduce((a, b) => a + b, 0) / ult.length
}

export default function Metas({ alunoId, simulados, redacoes = [], ehMentor }) {
  const [metas, setMetas] = useState([])
  const [form, setForm] = useState(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('metas').select('*').eq('aluno_id', alunoId).order('criado_em')
    if (!error) setMetas(data ?? [])
  }, [alunoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar(e) {
    e.preventDefault()
    const o = opcao(form.area)
    const alvo = Number(form.alvo)
    if (!alvo || alvo <= 0 || alvo > o.max) return setErro(`A meta precisa ser entre 1 e ${o.max}.`)
    const { error } = await supabase.from('metas').insert({ aluno_id: alunoId, area: form.area, alvo, prazo: form.prazo || null })
    if (error) return setErro('Não foi possível salvar: ' + error.message)
    setErro('')
    setForm(null)
    carregar()
  }

  async function apagar(m) {
    if (!confirm('Apagar esta meta?')) return
    await supabase.from('metas').delete().eq('id', m.id)
    carregar()
  }

  const hoje = hojeISO()

  return (
    <div className="cartao">
      <div className="lista-dia-topo">
        <h2 style={{ margin: 0 }}>🎯 Metas</h2>
        {!form && <button className="botao fantasma pequeno" onClick={() => setForm({ area: 'natureza', alvo: '', prazo: '' })}>+ Nova meta</button>}
      </div>

      {form && (
        <form className="meta-form" onSubmit={salvar}>
          <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
            {OPCOES.map((o) => <option key={o.chave} value={o.chave}>{o.nome}</option>)}
          </select>
          <input type="number" min="1" max={opcao(form.area).max} value={form.alvo} onChange={(e) => setForm({ ...form, alvo: e.target.value })} placeholder={`Meta (até ${opcao(form.area).max})`} required />
          <input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} title="Prazo (opcional)" />
          <button className="botao primario pequeno">Salvar</button>
          <button type="button" className="botao fantasma pequeno" onClick={() => setForm(null)}>Cancelar</button>
        </form>
      )}
      {erro && <p className="erro">{erro}</p>}

      {metas.length === 0 && !form ? (
        <p className="suave pequeno" style={{ margin: '8px 0 0' }}>
          {ehMentor ? 'Nenhuma meta para este aluno. Crie uma, por exemplo: chegar a 35 em Natureza até novembro.' : 'Defina uma meta, por exemplo: chegar a 35 em Natureza até novembro. O progresso usa a média dos seus 3 últimos simulados.'}
        </p>
      ) : (
        <div className="metas-lista">
          {metas.map((m) => {
            const o = opcao(m.area)
            const atual = valorAtual(m.area, simulados, redacoes)
            const pct = atual === null ? 0 : Math.min(100, (atual / Number(m.alvo)) * 100)
            const batida = atual !== null && atual >= Number(m.alvo)
            const dias = m.prazo ? Math.ceil((new Date(m.prazo + 'T12:00') - new Date(hoje + 'T12:00')) / 86400000) : null
            return (
              <div key={m.id} className="meta-item" style={{ '--cor': o.cor }}>
                <div className="meta-topo">
                  <strong>{o.nome}: {Number(m.alvo).toLocaleString('pt-BR')} {o.unidade}</strong>
                  <button className="link perigo" onClick={() => apagar(m)} aria-label="Apagar meta">✕</button>
                </div>
                <span className="meta-trilho"><i style={{ width: `${pct}%` }} /></span>
                <span className="suave pequeno">
                  {batida ? '🏆 Meta batida! ' : ''}
                  Atual: {atual === null ? 'sem simulados ainda' : atual.toFixed(1).replace('.', ',')}
                  {!batida && atual !== null && ` · faltam ${(Number(m.alvo) - atual).toFixed(1).replace('.', ',')}`}
                  {dias !== null && (dias >= 0 ? ` · prazo em ${dias} dias` : ' · prazo encerrado')}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
