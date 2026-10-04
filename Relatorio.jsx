import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { AREAS, NOME_SITE, MATERIAS } from './constants'
import { MESES, inicioDoMes, somarMeses, hojeISO } from './agenda'
import { resumoAdesao } from './adesao'
import { totalRedacao } from './Redacao'
import { MOTIVOS } from './CadernoErros'
import Avatar from './Avatar'

const isoDe = (d) => hojeISO(d)
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)
const fmt = (n, c = 1) => (n === null || n === undefined ? '—' : n.toFixed(c).replace('.', ','))
const totalDe = (s) => (AREAS.every((a) => s[a.chave] !== null) ? AREAS.reduce((t, a) => t + s[a.chave], 0) : null)
const minutos = (t) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m }

function Delta({ atual, anterior, casas = 1 }) {
  if (atual === null || anterior === null) return null
  const d = atual - anterior
  if (Math.abs(d) < 0.05) return <span className="variacao neutra"> =</span>
  return <span className={d > 0 ? 'variacao sobe' : 'variacao desce'}> {d > 0 ? '▲ +' : '▼ '}{fmt(d, casas)}</span>
}

export default function Relatorio({ aluno, ehMentor, equipe = [] }) {
  const [mes, setMes] = useState(() => {
    const h = new Date()
    return h.getDate() <= 5 ? somarMeses(inicioDoMes(h), -1) : inicioDoMes(h) // no início do mês, mostra o mês que fechou
  })
  const [dados, setDados] = useState(null)
  const [comentario, setComentario] = useState('')
  const [salvo, setSalvo] = useState('')

  const alunoId = aluno.id
  const ini = isoDe(mes)
  const fim = isoDe(new Date(mes.getFullYear(), mes.getMonth() + 1, 0))
  const iniAnt = isoDe(somarMeses(mes, -1))

  useEffect(() => {
    let ativo = true
    setDados(null)
    ;(async () => {
      const [sim, hor, chk, atd, red, err, met, rel] = await Promise.all([
        supabase.from('simulados').select('*').eq('aluno_id', alunoId).gte('data', iniAnt).lte('data', fim).order('data'),
        supabase.from('horarios').select('*').eq('aluno_id', alunoId),
        supabase.from('checkins').select('horario_id, dia, status').eq('aluno_id', alunoId).gte('dia', ini).lte('dia', fim),
        supabase.from('atendimentos').select('inicio, duracao_min, tema').eq('aluno_id', alunoId).gte('inicio', mes.toISOString()).lt('inicio', somarMeses(mes, 1).toISOString()),
        supabase.from('redacoes').select('*').eq('aluno_id', alunoId).eq('status', 'corrigida').gte('corrigida_em', mes.toISOString()).lt('corrigida_em', somarMeses(mes, 1).toISOString()),
        supabase.from('erros').select('*').eq('aluno_id', alunoId),
        supabase.from('metas').select('*').eq('aluno_id', alunoId),
        supabase.from('relatorios').select('*').eq('aluno_id', alunoId).eq('mes', ini).maybeSingle(),
      ])
      if (!ativo) return
      setDados({
        simulados: (sim.data ?? []).map((s) => ({ ...s, total: totalDe(s) })),
        horarios: hor.data ?? [],
        checkins: chk.data ?? [],
        atendimentos: atd.data ?? [],
        redacoes: red.data ?? [],
        erros: err.data ?? [],
        metas: met.data ?? [],
      })
      setComentario(rel.data?.comentario ?? '')
      setSalvo('')
    })()
    return () => { ativo = false }
  }, [alunoId, ini, fim, iniAnt, mes])

  async function salvarComentario() {
    setSalvo('salvando')
    const { error } = await supabase.from('relatorios').upsert({ aluno_id: alunoId, mes: ini, comentario: comentario.trim(), atualizado_em: new Date().toISOString() })
    setSalvo(error ? 'erro' : 'ok')
  }

  const mentor = equipe.find((m) => m.id === aluno.mentor_id)
  const nomeMes = `${MESES[mes.getMonth()]} de ${mes.getFullYear()}`

  if (!dados) return <p className="suave">Montando o relatório…</p>

  const doMes = dados.simulados.filter((s) => s.data >= ini)
  const doAnterior = dados.simulados.filter((s) => s.data < ini)
  const mediaArea = (lista, k) => media(lista.map((s) => s[k]).filter((v) => v !== null && v !== undefined))
  const totalMes = mediaArea(doMes, 'total')
  const totalAnt = mediaArea(doAnterior, 'total')
  const redacoesNotas = [...doMes.map((s) => s.redacao).filter((v) => v !== null), ...dados.redacoes.map(totalRedacao)]
  const redMes = media(redacoesNotas)
  const adesao = resumoAdesao(dados.horarios, dados.checkins, ini, fim)
  const minSemana = dados.horarios.filter((b) => b.materia !== 'Descanso' && b.conta_estudo !== false).reduce((t, b) => t + minutos(b.fim) - minutos(b.inicio), 0)
  const aulasFeitas = dados.atendimentos.filter((a) => new Date(a.inicio) < new Date())
  const errosMes = dados.erros.filter((e) => e.criado_em.slice(0, 10) >= ini && e.criado_em.slice(0, 10) <= fim)
  const topAssuntos = Object.entries(
    errosMes.reduce((m, e) => { const k = e.assunto || e.materia || 'Sem assunto'; m[k] = (m[k] || 0) + 1; return m }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const motivoTop = Object.keys(MOTIVOS).map((k) => [k, errosMes.filter((e) => e.motivo === k).length]).sort((a, b) => b[1] - a[1])[0]
  const horasPorMateria = Object.entries(
    dados.horarios.filter((b) => b.materia !== 'Descanso' && b.conta_estudo !== false).reduce((m, b) => { m[b.materia] = (m[b.materia] || 0) + minutos(b.fim) - minutos(b.inicio); return m }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <section className="secao">
      <div className="comunidade-topo nao-imprimir">
        <div className="navegar-mes">
          <button className="botao fantasma" onClick={() => setMes((m) => somarMeses(m, -1))} aria-label="Mês anterior">‹</button>
          <h2>{nomeMes}</h2>
          <button className="botao fantasma" onClick={() => setMes((m) => somarMeses(m, 1))} aria-label="Próximo mês" disabled={somarMeses(mes, 1) > new Date()}>›</button>
        </div>
        <button className="botao primario" onClick={() => window.print()}>⬇ Baixar PDF / imprimir</button>
      </div>
      <p className="suave pequeno nao-imprimir" style={{ marginTop: -6 }}>
        Na janela que abrir, escolha “Salvar como PDF” como destino. Depois é só mandar para o aluno ou para os responsáveis.
      </p>

      <article className="relatorio-folha">
        <header className="rel-cabecalho">
          <div className="rel-marca">
            <Avatar src={mentor?.foto_url} nome={mentor?.nome || NOME_SITE} tamanho={46} />
            <div>
              <strong>{NOME_SITE}</strong>
              <span>Relatório mensal · {nomeMes}</span>
            </div>
          </div>
          <div className="rel-aluno">
            <strong>{aluno.nome || aluno.email}</strong>
            {mentor && <span>Mentor: {mentor.nome}</span>}
          </div>
        </header>

        <div className="rel-kpis">
          <div><span>Simulados</span><strong>{doMes.length}</strong><small>no mês</small></div>
          <div><span>Média de acertos</span><strong>{fmt(totalMes, 0)}<small>/180</small></strong><small>vs mês anterior<Delta atual={totalMes} anterior={totalAnt} casas={0} /></small></div>
          <div><span>Redação</span><strong>{fmt(redMes, 0)}</strong><small>{redacoesNotas.length} {redacoesNotas.length === 1 ? 'nota' : 'notas'}</small></div>
          <div><span>Plano cumprido</span><strong>{adesao.pct === null ? '—' : `${adesao.pct}%`}</strong><small>{adesao.diasComCheckin} dias com check-in</small></div>
          <div><span>Aulas com o mentor</span><strong>{aulasFeitas.length}</strong><small>realizadas</small></div>
        </div>

        <h3 className="rel-titulo">Desempenho por área</h3>
        <table className="tabela rel-tabela">
          <thead>
            <tr><th>Área</th><th className="num">Média no mês</th><th className="num">Mês anterior</th><th className="num">Melhor</th><th className="num">% de acerto</th></tr>
          </thead>
          <tbody>
            {AREAS.map((a) => {
              const m = mediaArea(doMes, a.chave)
              const ant = mediaArea(doAnterior, a.chave)
              const vals = doMes.map((s) => s[a.chave]).filter((v) => v !== null)
              return (
                <tr key={a.chave}>
                  <td><span className="rel-bolinha" style={{ background: a.cor }} />{a.nome}</td>
                  <td className="num"><b>{fmt(m)}</b><Delta atual={m} anterior={ant} /></td>
                  <td className="num">{fmt(ant)}</td>
                  <td className="num">{vals.length ? Math.max(...vals) : '—'}</td>
                  <td className="num">{m === null ? '—' : `${Math.round((m / 45) * 100)}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {doMes.length > 0 && (
          <>
            <h3 className="rel-titulo">Simulados do mês</h3>
            <table className="tabela rel-tabela">
              <thead>
                <tr><th>Data</th><th>Simulado</th>{AREAS.map((a) => <th key={a.chave} className="num">{a.curto}</th>)}<th className="num">Total</th><th className="num">Red.</th></tr>
              </thead>
              <tbody>
                {doMes.map((s) => (
                  <tr key={s.id}>
                    <td>{s.data.split('-').reverse().slice(0, 2).join('/')}</td>
                    <td>{s.nome || '—'}</td>
                    {AREAS.map((a) => <td key={a.chave} className="num">{s[a.chave] ?? '—'}</td>)}
                    <td className="num"><b>{s.total ?? '—'}</b></td>
                    <td className="num">{s.redacao ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="rel-colunas">
          <div>
            <h3 className="rel-titulo">Rotina de estudos</h3>
            <p><b>{Math.round(minSemana / 60)}h</b> planejadas por semana{adesao.pct !== null && <> · <b>{adesao.pct}%</b> do plano cumprido no mês</>}.</p>
            {horasPorMateria.length > 0 && (
              <ul className="rel-lista">
                {horasPorMateria.map(([m, min]) => (
                  <li key={m}><span className="rel-bolinha" style={{ background: MATERIAS.find((x) => x.nome === m)?.cor || '#868e96' }} />{m}: {fmt(min / 60, 1)}h/semana</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="rel-titulo">Caderno de erros</h3>
            <p><b>{errosMes.length}</b> erros registrados no mês · <b>{dados.erros.filter((e) => e.dominado).length}</b> assuntos já dominados no total.</p>
            {topAssuntos.length > 0 && (
              <>
                <p className="pequeno" style={{ marginBottom: 4 }}>Assuntos para reforçar:</p>
                <ul className="rel-lista">{topAssuntos.map(([a, n]) => <li key={a}>{a} ({n})</li>)}</ul>
              </>
            )}
            {motivoTop && motivoTop[1] > 0 && <p className="pequeno">Motivo mais comum: {MOTIVOS[motivoTop[0]].nome.toLowerCase()}.</p>}
          </div>
        </div>

        {dados.metas.length > 0 && (
          <>
            <h3 className="rel-titulo">Metas</h3>
            <ul className="rel-lista">
              {dados.metas.map((m) => {
                const k = m.area
                const vals = dados.simulados.map((s) => (k === 'total' ? s.total : s[k])).filter((v) => v !== null && v !== undefined).slice(-3)
                const atual = media(vals)
                const nome = k === 'total' ? 'Total' : k === 'redacao' ? 'Redação' : AREAS.find((a) => a.chave === k)?.nome
                return <li key={m.id}>{nome}: meta {Number(m.alvo)} · atual {fmt(atual)} {atual !== null && atual >= Number(m.alvo) ? '🏆' : ''}</li>
              })}
            </ul>
          </>
        )}

        <h3 className={comentario ? 'rel-titulo' : 'rel-titulo nao-imprimir'}>Palavra do mentor</h3>
        {ehMentor ? (
          <div className="nao-imprimir">
            <textarea rows="5" value={comentario} onChange={(e) => { setComentario(e.target.value); setSalvo('') }} placeholder="Como foi o mês, pontos fortes, o que ajustar no próximo…" />
            <div className="linha-botoes" style={{ marginTop: 8 }}>
              {salvo === 'ok' && <span className="suave pequeno" style={{ alignSelf: 'center' }}>✓ salvo</span>}
              {salvo === 'erro' && <span className="erro pequeno" style={{ alignSelf: 'center' }}>não salvou</span>}
              <button className="botao primario pequeno" onClick={salvarComentario} disabled={salvo === 'salvando'}>Salvar comentário</button>
            </div>
          </div>
        ) : null}
        <p className={ehMentor ? 'rel-comentario so-imprimir' : 'rel-comentario'}>
          {comentario || (ehMentor ? '' : 'Seu mentor ainda não deixou um comentário para este mês.')}
        </p>

        <footer className="rel-rodape">Gerado em {new Date().toLocaleDateString('pt-BR')} · {NOME_SITE}</footer>
      </article>
    </section>
  )
}
