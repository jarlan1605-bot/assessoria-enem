import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { AREAS } from './constants'
import Grafico from './Grafico'
import Metas from './Metas'

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const REDACAO = { chave: 'redacao', nome: 'Redação', cor: '#7048e8' }
const TOTAL = { chave: 'total', nome: 'Total de acertos', cor: '#2b8a6e' }

const media = (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null)
const fmt = (n, casas = 1) => (n === null || n === undefined ? '—' : n.toFixed(casas).replace('.', ','))
const totalDe = (s) => (AREAS.every((a) => s[a.chave] !== null) ? AREAS.reduce((t, a) => t + s[a.chave], 0) : null)

function estatisticas(lista, chave) {
  const vals = lista.map((s) => s[chave]).filter((v) => v !== null && v !== undefined)
  if (!vals.length) return null
  return {
    n: vals.length,
    ultimo: vals[vals.length - 1],
    primeiro: vals[0],
    melhor: Math.max(...vals),
    media: media(vals),
    subida: vals.length > 1 ? vals[vals.length - 1] - vals[0] : null,
  }
}

function Variacao({ valor, unidade = '' }) {
  if (valor === null || valor === undefined) return <span className="variacao neutra">—</span>
  if (valor === 0) return <span className="variacao neutra">= 0{unidade}</span>
  return (
    <span className={valor > 0 ? 'variacao sobe' : 'variacao desce'}>
      {valor > 0 ? '▲ +' : '▼ '}{valor}{unidade}
    </span>
  )
}

export default function Evolucao({ alunoId, ehMentor, onLancar }) {
  const [simulados, setSimulados] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ano, setAno] = useState(new Date().getFullYear())
  const [redacoes, setRedacoes] = useState([]) // redações corrigidas pelo mentor

  useEffect(() => {
    supabase
      .from('redacoes')
      .select('id, corrigida_em, c1, c2, c3, c4, c5, tema')
      .eq('aluno_id', alunoId)
      .eq('status', 'corrigida')
      .then(({ data }) =>
        setRedacoes(
          (data ?? []).map((r) => ({
            id: 'r' + r.id,
            data: (r.corrigida_em || '').slice(0, 10),
            nome: r.tema ? `Redação: ${r.tema}` : 'Redação corrigida',
            redacao: (r.c1 ?? 0) + (r.c2 ?? 0) + (r.c3 ?? 0) + (r.c4 ?? 0) + (r.c5 ?? 0),
          }))
        )
      )
  }, [alunoId])

  useEffect(() => {
    setCarregando(true)
    supabase
      .from('simulados')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('data', { ascending: true })
      .order('criado_em', { ascending: true })
      .then(({ data, error }) => {
        if (error) setErro('Não foi possível carregar os simulados.')
        else {
          setErro('')
          const lista = (data ?? []).map((s) => ({ ...s, total: totalDe(s) }))
          setSimulados(lista)
          const anos = [...new Set(lista.map((s) => Number(s.data.slice(0, 4))))]
          const atual = new Date().getFullYear()
          if (anos.length && !anos.includes(atual)) setAno(Math.max(...anos))
        }
        setCarregando(false)
      })
  }, [alunoId])

  const anos = useMemo(() => {
    const a = new Set(simulados.map((s) => Number(s.data.slice(0, 4))))
    a.add(new Date().getFullYear())
    return [...a].sort((x, y) => y - x)
  }, [simulados])

  const doAno = useMemo(() => simulados.filter((s) => Number(s.data.slice(0, 4)) === ano), [simulados, ano])

  if (carregando) return <p className="suave">Carregando…</p>
  if (erro) return <p className="erro">{erro}</p>

  const porMes = MESES_CURTOS.map((_, m) => doAno.filter((s) => Number(s.data.slice(5, 7)) === m + 1).length)
  const maxMes = Math.max(1, ...porMes)
  const estTotal = estatisticas(doAno, 'total')
  // Redação: notas dos simulados + redações corrigidas pelo mentor
  const pontosRedacao = [...doAno.filter((s) => s.redacao !== null), ...redacoes.filter((r) => Number(r.data.slice(0, 4)) === ano)]
    .sort((a, b) => a.data.localeCompare(b.data))
  const estRedacao = estatisticas(pontosRedacao, 'redacao')
  const estAreas = AREAS.map((a) => ({ ...a, est: estatisticas(doAno, a.chave) }))
  const comMedia = estAreas.filter((a) => a.est)
  const foco = comMedia.length > 1 ? comMedia.reduce((p, a) => (a.est.media < p.est.media ? a : p)) : null
  const forte = comMedia.length > 1 ? comMedia.reduce((p, a) => (a.est.media > p.est.media ? a : p)) : null
  const questoes = doAno.reduce((t, s) => t + AREAS.filter((a) => s[a.chave] !== null).length * 45, 0)
  const acertos = doAno.reduce((t, s) => t + AREAS.reduce((u, a) => u + (s[a.chave] ?? 0), 0), 0)

  return (
    <section className="secao evolucao">
      <div className="evolucao-topo">
        <div>
          <h2 style={{ margin: 0 }}>{ehMentor ? 'Evolução do aluno' : 'Sua evolução'}</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>Acertos de 0 a 45 em cada área e nota da redação.</p>
        </div>
        {anos.length > 1 && (
          <div className="filtros" role="tablist" aria-label="Ano">
            {anos.map((a) => (
              <button key={a} className={a === ano ? 'filtro ativo' : 'filtro'} onClick={() => setAno(a)}>{a}</button>
            ))}
          </div>
        )}
      </div>

      {doAno.length === 0 ? (
        <div className="cartao vazio">
          <p>
            {ehMentor
              ? `Este aluno ainda não lançou simulados em ${ano}.`
              : `Você ainda não lançou simulados em ${ano}. Lance o primeiro e acompanhe sua subida aqui!`}
          </p>
          {!ehMentor && onLancar && <button className="botao primario" onClick={onLancar}>Lançar simulado</button>}
        </div>
      ) : null}
      {doAno.length === 0 ? (
        <Metas alunoId={alunoId} simulados={[]} ehMentor={ehMentor} />
      ) : (
        <>
          <div className="resumo-cartoes resumo-evolucao">
            <div className="cartao mini destaque-ano" style={{ '--cor': 'var(--primaria)' }}>
              <span className="mini-titulo">Simulados em {ano}</span>
              <strong className="mini-numero">{doAno.length}</strong>
              <div className="barras-mes" aria-label="Simulados por mês">
                {porMes.map((n, m) => (
                  <span key={m} className="barra-mes" title={`${MESES_CURTOS[m]}: ${n}`}>
                    <i style={{ height: `${(n / maxMes) * 100}%` }} className={n ? '' : 'zero'} />
                    <small>{MESES_CURTOS[m][0]}</small>
                  </span>
                ))}
              </div>
            </div>
            <div className="cartao mini" style={{ '--cor': '#0c8599' }}>
              <span className="mini-titulo">Média de acertos</span>
              <strong className="mini-numero">{fmt(estTotal?.media, 0)}<small className="de">/180</small></strong>
              <span className="suave pequeno">
                {questoes ? `${fmt((acertos / questoes) * 100, 0)}% de acerto · ${questoes.toLocaleString('pt-BR')} questões` : 'nas provas completas'}
              </span>
            </div>
            <div className="cartao mini" style={{ '--cor': '#e8590c' }}>
              <span className="mini-titulo">Melhor resultado</span>
              <strong className="mini-numero">{estTotal ? estTotal.melhor : '—'}<small className="de">/180</small></strong>
              <span className="suave pequeno">
                desde o 1º do ano: <Variacao valor={estTotal?.subida ?? null} />
              </span>
            </div>
            <div className="cartao mini" style={{ '--cor': REDACAO.cor }}>
              <span className="mini-titulo">Redação</span>
              <strong className="mini-numero">{estRedacao ? Math.round(estRedacao.media) : '—'}</strong>
              <span className="suave pequeno">
                média · melhor {estRedacao?.melhor ?? '—'} · <Variacao valor={estRedacao?.subida ?? null} />
              </span>
            </div>
          </div>

          {foco && forte && foco.chave !== forte.chave && (
            <div className="cartao dica-foco">
              <span className="dica-icone" aria-hidden="true">🎯</span>
              <p>
                {ehMentor ? 'Área para reforçar: ' : 'Sua área para focar: '}
                <b style={{ color: foco.cor }}>{foco.nome}</b> (média {fmt(foco.est.media)} de 45).{' '}
                {ehMentor ? 'Melhor área: ' : 'Seu ponto forte: '}
                <b style={{ color: forte.cor }}>{forte.nome}</b> (média {fmt(forte.est.media)}).
              </p>
            </div>
          )}

          <Metas alunoId={alunoId} simulados={doAno} redacoes={redacoes.filter((r) => Number(r.data.slice(0, 4)) === ano)} ehMentor={ehMentor} />

          <div className="areas-grade">
            {estAreas.map((a) => (
              <div key={a.chave} className="cartao area-cartao" style={{ '--cor': a.cor }}>
                <div className="area-topo">
                  <span className="mini-titulo">{a.nome}</span>
                  <Variacao valor={a.est?.subida ?? null} />
                </div>
                {a.est ? (
                  <>
                    <div className="area-numeros">
                      <div><strong>{a.est.ultimo}</strong><span>último</span></div>
                      <div><strong>{fmt(a.est.media)}</strong><span>média</span></div>
                      <div><strong>{a.est.melhor}</strong><span>melhor</span></div>
                      <div><strong>{fmt((a.est.media / 45) * 100, 0)}%</strong><span>acerto</span></div>
                    </div>
                    <Grafico pontos={doAno} series={[a]} maximo={45} altura={150} preenchido />
                  </>
                ) : (
                  <p className="suave pequeno">Nenhum simulado desta área em {ano}.</p>
                )}
              </div>
            ))}
          </div>

          <div className="graficos">
            <div className="cartao">
              <h2>Total de acertos (soma das 4 áreas)</h2>
              {estTotal ? (
                <Grafico pontos={doAno} series={[TOTAL]} maximo={180} preenchido />
              ) : (
                <p className="suave pequeno">Aparece quando houver simulados com as 4 áreas preenchidas.</p>
              )}
            </div>
            <div className="cartao">
              <h2>Redação</h2>
              {estRedacao ? (
                <Grafico pontos={pontosRedacao} series={[REDACAO]} maximo={1000} preenchido />
              ) : (
                <p className="suave pequeno">Nenhuma redação lançada em {ano}.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
