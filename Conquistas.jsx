import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { CONQUISTAS, progressoConquista, avisarConquistas, compartilharImagem } from './estudo'
import { cartaoConquista } from './cartoesStory'
import { AnelQuestoes, OfensivaCartao } from './Hoje'

// Minhas conquistas: medalhas ganhas (com data) e as que faltam, em cinza, com o que falta
export default function Conquistas({ alunoId, aluno, ehMentor }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [c, d, o] = await Promise.all([
        supabase.rpc('atualizar_conquistas', { p_aluno: alunoId }),
        supabase.rpc('desempenho_materias', { p_aluno: alunoId }),
        supabase.rpc('ofensiva', { p_aluno: alunoId }),
      ])
      if (!vivo) return
      if (c.error || !c.data) { setErro('As conquistas ainda não foram ativadas no banco (arquivo gamificacao.sql).'); return }
      if (!ehMentor && c.data.novas?.length) avisarConquistas(c.data.novas)
      setDados({ conq: c.data, desempenho: d.data ?? [], ofensiva: o.data })
    })()
    return () => { vivo = false }
  }, [alunoId, ehMentor])

  if (erro) return <div className="cartao vazio"><p>{erro}</p></div>
  if (!dados) return <div className="hoje-esqueleto" aria-label="Carregando"><div /><div /></div>
  return <ConquistasVisao dados={dados} aluno={aluno} ehMentor={ehMentor} />
}

export function ConquistasVisao({ dados, aluno, ehMentor }) {
  const ganhas = dados.conq.ganhas || {}
  const stats = dados.conq.stats || {}
  const lista = [...CONQUISTAS].sort((a, b) => Number(!!ganhas[b.codigo]) - Number(!!ganhas[a.codigo]))
  const n = CONQUISTAS.filter((c) => ganhas[c.codigo]).length
  const [gerando, setGerando] = useState('')

  async function postar(c) {
    setGerando(c.codigo)
    try {
      const data = new Date(ganhas[c.codigo]).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
      await compartilharImagem(await cartaoConquista({ nome: aluno?.nome, conquista: c, dataTexto: `desbloqueada em ${data}` }), `conquista-${c.codigo}.png`, '#AssessoriaJC')
    } finally { setGerando('') }
  }

  return (
    <section className="secao conquistas">
      <div className="hoje-destaque">
        <span className="hoje-kicker">Minhas conquistas</span>
        <h2><b className="lima-texto">{n}</b> de {CONQUISTAS.length} <em>medalhas</em></h2>
        <div className="hoje-barra escura"><i style={{ width: `${(n / CONQUISTAS.length) * 100}%` }} /></div>
      </div>
      {dados.ofensiva && <OfensivaCartao o={dados.ofensiva} />}
      <ul className="medalhas">
        {lista.map((c) => {
          const g = ganhas[c.codigo]
          const p = progressoConquista(c, stats)
          return (
            <li key={c.codigo} className={g ? 'medalha ganha' : 'medalha'}>
              <span className="medalha-icone" aria-hidden="true">{c.icone}</span>
              <strong>{c.nome}</strong>
              {g ? (
                <>
                  <span className="medalha-data">{new Date(g).toLocaleDateString('pt-BR')}</span>
                  {!ehMentor && <button className="link pequeno" onClick={() => postar(c)} disabled={!!gerando}>{gerando === c.codigo ? 'gerando…' : 'postar'}</button>}
                </>
              ) : (
                <>
                  <span className="medalha-falta">{p.falta}</span>
                  <i className="missao-mini"><b style={{ width: `${p.pct}%` }} /></i>
                </>
              )}
            </li>
          )
        })}
      </ul>
      <AnelQuestoes linhas={dados.desempenho} />
    </section>
  )
}
