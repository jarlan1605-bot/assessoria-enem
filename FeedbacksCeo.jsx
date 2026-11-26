import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const ROTULO = { sim: 'Continuaria', talvez: 'Talvez', nao: 'Não continuaria' }

// CEO: respostas do formulário público /feedback
export default function FeedbacksCeo() {
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const link = `${window.location.origin}/feedback`

  useEffect(() => {
    supabase.from('feedbacks').select('*').order('criado_em', { ascending: false }).limit(1000).then(({ data, error }) => {
      if (error) setErro('Não foi possível carregar os feedbacks.')
      setLista(data ?? [])
    })
  }, [])

  const contagem = useMemo(() => {
    const c = { sim: 0, talvez: 0, nao: 0 }
    for (const f of lista ?? []) if (f.continuaria) c[f.continuaria]++
    return c
  }, [lista])
  const comResposta = contagem.sim + contagem.talvez + contagem.nao

  async function copiar() {
    try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { window.prompt('Copie o link:', link) }
  }
  async function apagar(id) {
    if (!window.confirm('Apagar este feedback?')) return
    const { error } = await supabase.from('feedbacks').delete().eq('id', id)
    if (!error) setLista((l) => l.filter((x) => x.id !== id))
  }

  return (
    <section className="secao fbc">
      <div className="hoje-destaque">
        <span className="hoje-kicker">Link para enviar aos alunos</span>
        <h2>{link.replace(/^https?:\/\//, '')}</h2>
        <p>Funciona sem login, no celular, e leva menos de 2 minutos. A pessoa escolhe se fica anônima.</p>
        <div className="linha-botoes" style={{ justifyContent: 'flex-start' }}>
          <button className="botao lima" onClick={copiar}>{copiado ? '✓ Link copiado' : '📋 Copiar link'}</button>
          <a className="botao fantasma claro" href={`https://wa.me/?text=${encodeURIComponent(`Oi! Conta pra gente como está sendo a Assessoria J&C? Leva menos de 2 minutos e pode ser anônimo 💚 ${link}`)}`} target="_blank" rel="noreferrer">Mandar no WhatsApp</a>
        </div>
      </div>

      {lista && lista.length > 0 && (
        <div className="cartao fbc-resumo">
          <div><b>{lista.length}</b><span>respostas</span></div>
          <div><b>{lista.filter((f) => !f.anonimo).length}</b><span>se identificaram</span></div>
          <div className="ok"><b>{comResposta ? Math.round((contagem.sim / comResposta) * 100) : 0}%</b><span>continuariam ({contagem.sim})</span></div>
          <div><b>{contagem.talvez}</b><span>talvez</span></div>
          <div className="nao"><b>{contagem.nao}</b><span>não continuariam</span></div>
        </div>
      )}

      {erro && <p className="erro">{erro}</p>}
      {lista === null && <p className="suave">Carregando…</p>}
      {lista?.length === 0 && !erro && <div className="cartao vazio"><h2>Nenhum feedback ainda</h2><p>Copie o link acima e mande para os alunos.</p></div>}

      {lista?.map((f) => (
        <article key={f.id} className="cartao fbc-item">
          <header>
            <strong>{f.anonimo ? '🙈 Anônimo' : `👤 ${f.nome}`}</strong>
            <span className="suave pequeno">{new Date(f.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            {f.continuaria && <span className={`fbc-selo ${f.continuaria}`}>{ROTULO[f.continuaria]}</span>}
          </header>
          {f.mais_gostou && <p><b>💚 Mais gostou:</b> {f.mais_gostou}</p>}
          {f.menos_gostou && <p><b>🛠️ Pode melhorar:</b> {f.menos_gostou}</p>}
          <button className="link pequeno" onClick={() => apagar(f.id)}>apagar</button>
        </article>
      ))}
    </section>
  )
}
