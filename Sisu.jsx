import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

const CAMPOS = [
  { k: 'lc', nome: 'Linguagens', cor: '#1971c2' },
  { k: 'ch', nome: 'Humanas', cor: '#e67700' },
  { k: 'cn', nome: 'Natureza', cor: '#2f9e44' },
  { k: 'mt', nome: 'Matemática', cor: '#c2255c' },
  { k: 'red', nome: 'Redação', cor: '#7048e8' },
]
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')))
const fmt = (n) => (n === null || Number.isNaN(n) ? '—' : n.toFixed(2).replace('.', ','))

export function calcularMedia(c) {
  let soma = 0
  let pesos = 0
  for (const f of CAMPOS) {
    const nota = num(c[`nota_${f.k}`])
    const peso = num(c[`peso_${f.k}`]) ?? 1
    if (nota === null) return null
    soma += nota * peso
    pesos += peso
  }
  return pesos ? soma / pesos : null
}

const VAZIO = {
  curso: '', instituicao: '', nota_corte: '',
  peso_lc: 1, peso_ch: 1, peso_cn: 1, peso_mt: 1, peso_red: 1,
  nota_lc: '', nota_ch: '', nota_cn: '', nota_mt: '', nota_red: '',
}

export default function Sisu({ alunoId, ehMentor }) {
  const [cenarios, setCenarios] = useState([])
  const [form, setForm] = useState(null)
  const [editandoId, setEditandoId] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('sisu_cenarios').select('*').eq('aluno_id', alunoId).order('criado_em')
    if (error) setErro('Não foi possível carregar. O arquivo extras.sql já foi rodado no Supabase?')
    else setCenarios(data ?? [])
    setCarregando(false)
  }, [alunoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  function novo() {
    // começa com as notas do último cenário, para não digitar de novo
    const ult = cenarios[cenarios.length - 1]
    const base = { ...VAZIO }
    if (ult) CAMPOS.forEach((f) => (base[`nota_${f.k}`] = ult[`nota_${f.k}`] ?? ''))
    setForm(base)
    setEditandoId(null)
  }

  async function salvar(e) {
    e.preventDefault()
    if (!form.curso.trim()) return setErro('Coloque o nome do curso.')
    const reg = { aluno_id: alunoId, curso: form.curso.trim(), instituicao: form.instituicao.trim(), nota_corte: num(form.nota_corte) }
    for (const f of CAMPOS) {
      reg[`peso_${f.k}`] = num(form[`peso_${f.k}`]) ?? 1
      const n = num(form[`nota_${f.k}`])
      if (n !== null && (n < 0 || n > 1000)) return setErro('As notas vão de 0 a 1000.')
      reg[`nota_${f.k}`] = n
    }
    const { error } = editandoId
      ? await supabase.from('sisu_cenarios').update(reg).eq('id', editandoId)
      : await supabase.from('sisu_cenarios').insert(reg)
    if (error) return setErro('Não foi possível salvar: ' + error.message)
    setErro('')
    setForm(null)
    setEditandoId(null)
    carregar()
  }

  async function apagar(c) {
    if (!confirm(`Apagar o cenário de ${c.curso}?`)) return
    await supabase.from('sisu_cenarios').delete().eq('id', c.id)
    carregar()
  }

  if (carregando) return <p className="suave">Carregando…</p>
  const previa = form ? calcularMedia(form) : null

  return (
    <section className="secao">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>Calculadora SISU</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>
            Coloque os pesos do curso, a nota de corte e as notas estimadas do seu simulado para ver quanto falta.
          </p>
        </div>
        {!form && <button className="botao primario" onClick={novo}>+ Novo curso</button>}
      </div>

      <p className="aviso-info">
        ℹ️ A nota do ENEM é calculada pela TRI, então não dá para converter acertos em nota com exatidão. Use a nota estimada que o próprio simulado informa (SAS, Bernoulli, etc.) e a nota de corte da última edição do SISU para o curso.
      </p>

      {erro && <p className="erro">{erro}</p>}

      {form && (
        <form className="cartao" onSubmit={salvar}>
          <h2>{editandoId ? 'Editar cenário' : 'Novo cenário'}</h2>
          <div className="grade-form">
            <label className="largo-2">Curso<input value={form.curso} onChange={(e) => setForm({ ...form, curso: e.target.value })} placeholder="Ex.: Medicina" required /></label>
            <label>Instituição<input value={form.instituicao} onChange={(e) => setForm({ ...form, instituicao: e.target.value })} placeholder="Ex.: UFRN" /></label>
            <label>Nota de corte<input inputMode="decimal" value={form.nota_corte} onChange={(e) => setForm({ ...form, nota_corte: e.target.value })} placeholder="Ex.: 780,50" /></label>
          </div>
          <div className="sisu-tabela">
            <span></span>
            {CAMPOS.map((f) => <span key={f.k} className="sisu-cab" style={{ color: f.cor }}>{f.nome}</span>)}
            <span className="sisu-rot">Peso</span>
            {CAMPOS.map((f) => (
              <input key={f.k} inputMode="decimal" value={form[`peso_${f.k}`]} onChange={(e) => setForm({ ...form, [`peso_${f.k}`]: e.target.value })} aria-label={`Peso ${f.nome}`} />
            ))}
            <span className="sisu-rot">Sua nota</span>
            {CAMPOS.map((f) => (
              <input key={f.k} inputMode="decimal" value={form[`nota_${f.k}`] ?? ''} onChange={(e) => setForm({ ...form, [`nota_${f.k}`]: e.target.value })} placeholder="0–1000" aria-label={`Nota ${f.nome}`} />
            ))}
          </div>
          <p className="pequeno" style={{ marginTop: 10 }}>
            Média ponderada: <b>{fmt(previa)}</b>
            {previa !== null && num(form.nota_corte) && ` · ${previa >= num(form.nota_corte) ? 'acima da nota de corte ✓' : `faltam ${fmt(num(form.nota_corte) - previa)} pontos`}`}
          </p>
          <div className="linha-botoes">
            <button type="button" className="botao fantasma" onClick={() => { setForm(null); setEditandoId(null) }}>Cancelar</button>
            <button className="botao primario">Salvar</button>
          </div>
        </form>
      )}

      {cenarios.length === 0 && !form ? (
        <div className="cartao vazio">
          <p style={{ margin: 0 }}>{ehMentor ? 'Este aluno ainda não simulou nenhum curso.' : 'Adicione o curso dos seus sonhos e veja quanto falta para a nota de corte.'}</p>
        </div>
      ) : (
        <div className="sisu-grade">
          {cenarios.map((c) => {
            const media = calcularMedia(c)
            const corte = num(c.nota_corte)
            const diff = media !== null && corte ? media - corte : null
            const somaPesos = CAMPOS.reduce((t, f) => t + (num(c[`peso_${f.k}`]) ?? 1), 0)
            const melhor = [...CAMPOS].sort((a, b) => (num(c[`peso_${b.k}`]) ?? 1) - (num(c[`peso_${a.k}`]) ?? 1))[0]
            const ganho10 = (10 * (num(c[`peso_${melhor.k}`]) ?? 1)) / somaPesos
            return (
              <div key={c.id} className={`cartao sisu-cartao ${diff === null ? '' : diff >= 0 ? 'acima' : 'abaixo'}`}>
                <div className="lista-dia-topo">
                  <div>
                    <strong className="sisu-curso">{c.curso}</strong>
                    {c.instituicao && <span className="suave pequeno"> · {c.instituicao}</span>}
                  </div>
                  <span className="mentor-acoes">
                    <button className="link" onClick={() => { setForm({ ...VAZIO, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])) }); setEditandoId(c.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>editar</button>
                    <button className="link perigo" onClick={() => apagar(c)}>apagar</button>
                  </span>
                </div>
                <div className="sisu-numeros">
                  <div><span>Sua média</span><strong>{fmt(media)}</strong></div>
                  <div><span>Nota de corte</span><strong>{fmt(corte)}</strong></div>
                  <div className={diff === null ? '' : diff >= 0 ? 'positivo' : 'negativo'}>
                    <span>{diff === null ? 'Diferença' : diff >= 0 ? 'Acima do corte' : 'Faltam'}</span>
                    <strong>{diff === null ? '—' : fmt(Math.abs(diff))}</strong>
                  </div>
                </div>
                {corte && media !== null && (
                  <span className="meta-trilho" style={{ '--cor': diff >= 0 ? '#2f9e44' : '#e67700' }}>
                    <i style={{ width: `${Math.min(100, (media / corte) * 100)}%` }} />
                  </span>
                )}
                <div className="sisu-pesos">
                  {CAMPOS.map((f) => (
                    <span key={f.k} style={{ '--cor': f.cor }}>{f.nome.slice(0, 3)} <b>{c[`nota_${f.k}`] ?? '—'}</b> <small>×{String(c[`peso_${f.k}`]).replace('.', ',')}</small></span>
                  ))}
                </div>
                <p className="suave pequeno" style={{ margin: 0 }}>
                  💡 Neste curso, cada 10 pontos a mais em <b style={{ color: melhor.cor }}>{melhor.nome}</b> somam {fmt(ganho10)} na média.
                </p>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
