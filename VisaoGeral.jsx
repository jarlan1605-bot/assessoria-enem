import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { CONTEUDOS } from './conteudos'

// Visão geral (equipe): todas as métricas de todos os alunos numa tabela só.
// Clicar num aluno abre o painel completo dele.
const horas = (s) => { s = Math.round(s || 0); if (!s) return '–'; const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min` }
const pct = (a, n) => (n ? Math.round((a / n) * 100) : null)
const quando = (iso) => {
  if (!iso) return 'nunca'
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000)
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`
}

const PERIODOS = [['q_hoje', 'Hoje'], ['q_semana', 'Semana'], ['q_mes', 'Mês'], ['q_ano', 'Ano'], ['q_total', 'Total']]
const TEMPOS = { q_hoje: 'tempo_hoje', q_semana: 'tempo_semana', q_mes: 'tempo_mes', q_ano: 'tempo_total', q_total: 'tempo_total' }

export default function VisaoGeral({ equipe = [], onAbrir }) {
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [periodo, setPeriodo] = useState('q_semana')
  const [ordem, setOrdem] = useState({ col: 'q', desc: true })
  const [busca, setBusca] = useState('')
  const [verSuspensos, setVerSuspensos] = useState(false)

  useEffect(() => {
    supabase.rpc('metricas_alunos').then(({ data, error }) => {
      if (error) setErro(error.message)
      setLista(data ?? [])
    })
  }, [])

  const nomeMentor = (id) => (equipe.find((m) => m.id === id)?.nome || '').split(' ')[0] || '–'
  const linhas = useMemo(() => {
    if (!lista) return []
    const t = busca.trim().toLowerCase()
    const l = lista
      .filter((a) => verSuspensos || !a.suspenso)
      .filter((a) => !t || `${a.nome} ${a.email}`.toLowerCase().includes(t))
      .map((a) => ({
        ...a,
        q: a[periodo],
        tempo: a[TEMPOS[periodo]],
        acerto: pct(a.a_total, a.n_total),
        trilha: Math.round((a.trilha_soma || 0) / CONTEUDOS.length),
        ultima: a.ultima_atividade ? new Date(a.ultima_atividade).getTime() : 0,
      }))
    const { col, desc } = ordem
    return l.sort((x, y) => {
      const a = x[col] ?? -1, b = y[col] ?? -1
      const r = typeof a === 'string' ? a.localeCompare(b) : a - b
      return desc ? -r : r
    })
  }, [lista, periodo, ordem, busca, verSuspensos])

  if (!lista) return <p className="suave">Carregando os alunos…</p>
  if (erro) return <p className="erro">{erro}</p>

  const ativos = lista.filter((a) => !a.suspenso)
  const soma = (k) => ativos.reduce((s, a) => s + (a[k] || 0), 0)
  const semEstudar = ativos.filter((a) => !a.ultima_atividade || Date.now() - new Date(a.ultima_atividade) > 3 * 86400000)
  const nomePeriodo = PERIODOS.find((p) => p[0] === periodo)[1].toLowerCase()

  function ordenar(col) { setOrdem((o) => ({ col, desc: o.col === col ? !o.desc : col !== 'nome' })) }
  const Th = ({ col, children, title }) => (
    <th onClick={() => ordenar(col)} title={title} className={ordem.col === col ? 'vg-ord' : ''}>
      {children}{ordem.col === col ? (ordem.desc ? ' ↓' : ' ↑') : ''}
    </th>
  )

  function baixar() {
    const cab = ['Aluno', 'E-mail', 'Mentor', 'Questões hoje', 'Questões semana', 'Questões mês', 'Questões ano', 'Questões total', '% acerto', 'Tempo hoje (min)', 'Tempo semana (min)', 'Tempo mês (min)', 'Tempo total (min)', 'XP semana', 'XP total', 'Ranking semana', 'Ranking geral', 'Check-ins semana', 'Check-ins mês', 'Check-ins total', 'Trilha %', 'Conteúdos concluídos', 'Simulados completos', 'Simulados feitos', 'Último simulado', 'Nota último', 'Erros p/ revisar', 'Última atividade']
    const linhasCsv = linhas.map((a) => [a.nome, a.email, nomeMentor(a.mentor_id), a.q_hoje, a.q_semana, a.q_mes, a.q_ano, a.q_total, a.acerto ?? '', ...[a.tempo_hoje, a.tempo_semana, a.tempo_mes, a.tempo_total].map((s) => Math.round(s / 60)), a.xp_semana, a.xp_total, a.pos_semana ?? '', a.pos_geral ?? '', a.checkins_semana, a.checkins_mes, a.checkins_total, a.trilha, a.trilha_concluidos, a.simulados_completos, a.simulados_total, a.ultimo_simulado ?? '', a.ultimo_simulado_nota ?? '', a.erros_pendentes, a.ultima_atividade ? new Date(a.ultima_atividade).toLocaleString('pt-BR') : ''])
    const csv = [cab, ...linhasCsv].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `alunos-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <section className="secao vg">
      <div className="pn-grade">
        <Card icone="👥" titulo="Alunos ativos" valor={ativos.length} sub={`${semEstudar.length} sem estudar há 3+ dias`} />
        <Card icone="🧠" titulo="Questões hoje" valor={soma('q_hoje').toLocaleString('pt-BR')} sub={`${soma('q_semana').toLocaleString('pt-BR')} na semana · ${soma('q_mes').toLocaleString('pt-BR')} no mês`} />
        <Card icone="📆" titulo="Questões no ano" valor={soma('q_ano').toLocaleString('pt-BR')} sub={`${pct(soma('a_total'), soma('n_total')) ?? '–'}% de acerto geral`} />
        <Card icone="⏱️" titulo="Tempo na plataforma" valor={horas(soma('tempo_semana'))} sub={`na semana · ${horas(soma('tempo_mes'))} no mês`} />
        <Card icone="✅" titulo="Check-ins no mês" valor={soma('checkins_mes')} sub={`${soma('checkins_semana')} esta semana`} />
        <Card icone="🏁" titulo="Simulados completos" valor={soma('simulados_completos')} sub={`${soma('simulados_total')} simulados entregues`} />
      </div>

      {semEstudar.length > 0 && (
        <div className="cartao vg-alerta">
          <strong>⚠️ Sem estudar há 3 dias ou mais:</strong>{' '}
          {semEstudar.map((a, i) => (
            <span key={a.aluno_id}>{i ? ', ' : ''}<button className="link" onClick={() => onAbrir(a.aluno_id, 'painel')}>{(a.nome || a.email).split(' ').slice(0, 2).join(' ')}</button> <small className="suave">({quando(a.ultima_atividade)})</small></span>
          ))}
        </div>
      )}

      <div className="cartao vg-barra">
        <input type="search" placeholder="Buscar aluno…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="vg-periodos" role="tablist">
          {PERIODOS.map(([k, r]) => (
            <button key={k} className={periodo === k ? 'ativo' : ''} onClick={() => setPeriodo(k)}>{r}</button>
          ))}
        </div>
        <label className="vg-check"><input type="checkbox" checked={verSuspensos} onChange={(e) => setVerSuspensos(e.target.checked)} /> mostrar suspensos</label>
        <button className="botao pequeno" onClick={baixar}>⬇️ Baixar planilha</button>
      </div>

      <div className="cartao vg-tabela-caixa">
        <table className="vg-tabela">
          <thead>
            <tr>
              <Th col="nome">Aluno</Th>
              <Th col="q" title={`Questões feitas (${nomePeriodo})`}>Questões ({nomePeriodo})</Th>
              <Th col="acerto" title="Acerto geral">% acerto</Th>
              <Th col="tempo" title={`Tempo na plataforma (${periodo === 'q_ano' ? 'total' : nomePeriodo})`}>Tempo</Th>
              <Th col="pos_semana" title="Posição no ranking da semana">Ranking</Th>
              <Th col="xp_total">XP</Th>
              <Th col="checkins_mes" title="Check-ins feitos no mês (total entre parênteses)">Check-ins</Th>
              <Th col="trilha" title="Andamento da trilha de conteúdos">Trilha</Th>
              <Th col="simulados_completos" title="Simulados completos (entregues no total)">Simulados</Th>
              <Th col="erros_pendentes" title="Erros para revisar hoje">Revisar</Th>
              <Th col="ultima" title="Última atividade">Ativo</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((a) => (
              <tr key={a.aluno_id} onClick={() => onAbrir(a.aluno_id, 'painel')} className={a.suspenso ? 'vg-suspenso' : ''}>
                <td>
                  <strong>{a.nome || a.email}</strong>
                  <small className="suave">Mentor: {nomeMentor(a.mentor_id)}{a.suspenso ? ' · suspenso' : ''}</small>
                </td>
                <td><b>{a.q.toLocaleString('pt-BR')}</b></td>
                <td>{a.acerto !== null ? `${a.acerto}%` : '–'}</td>
                <td>{horas(a.tempo)}</td>
                <td>{a.pos_semana ? `${a.pos_semana}º` : '–'}<small className="suave">{a.pos_geral ? `${a.pos_geral}º geral` : ''}</small></td>
                <td>{a.xp_total.toLocaleString('pt-BR')}<small className="suave">+{a.xp_semana} sem.</small></td>
                <td>{a.checkins_mes}<small className="suave">{a.checkins_total} no total</small></td>
                <td>
                  <div className="vg-trilha"><i style={{ width: `${a.trilha}%` }} /></div>
                  <small className="suave">{a.trilha}% · {a.trilha_concluidos}/{CONTEUDOS.length}</small>
                </td>
                <td>{a.simulados_completos}<small className="suave">{a.simulados_total} entregues{a.ultimo_simulado_nota ? ` · últ. ${a.ultimo_simulado_nota}` : ''}</small></td>
                <td>{a.erros_pendentes || '–'}</td>
                <td className={!a.ultima || Date.now() - a.ultima > 3 * 86400000 ? 'vg-parado' : ''}>{quando(a.ultima_atividade)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!linhas.length && <p className="suave">Nenhum aluno encontrado.</p>}
      </div>
      <p className="suave pequeno">Clique num aluno para abrir o painel completo dele: questão por questão, cada simulado, tempo, trilha e check-ins.</p>
    </section>
  )
}

function Card({ icone, titulo, valor, sub }) {
  return (
    <div className="cartao pn-card">
      <span className="pn-card-titulo">{icone} {titulo}</span>
      <b>{valor}</b>
      <small className="suave">{sub}</small>
    </div>
  )
}
