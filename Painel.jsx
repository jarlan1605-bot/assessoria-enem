import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { hojeISO, somarDias } from './agenda'
import { CONTEUDOS, MATERIAS_TRILHA } from './conteudos'
import { progressoNivel, sequenciaAtual } from './xp'

// Painel do aluno: tudo num lugar só (questões, tempo, trilha, ranking, simulados)
async function tudo(fazer) {
  let lista = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await fazer().range(de, de + 999)
    if (error) return lista
    lista = lista.concat(data ?? [])
    if (!data || data.length < 1000) return lista
  }
}
const diaLocal = (iso) => hojeISO(new Date(iso))
const inicioSemana = () => { const h = hojeISO(); const d = new Date(h + 'T12:00:00'); return somarDias(h, -((d.getDay() + 6) % 7)) }
const inicioMes = () => hojeISO().slice(0, 8) + '01'
const horas = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min` }
const pct = (a, n) => (n ? Math.round((a / n) * 100) : null)

export default function Painel({ alunoId, aluno, ehMentor, irPara }) {
  const [d, setD] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const semana = inicioSemana()
      const [resp, tent, gabs, tempo, trilha, erros, checkins, xp, ranking] = await Promise.all([
        tudo(() => supabase.from('respostas').select('criado_em, correta').eq('aluno_id', alunoId).order('criado_em')),
        tudo(() => supabase.from('simulado_tentativas').select('id, titulo, enviado_em, respostas, agendado_id, simulado_resultados(acertos, total)').eq('aluno_id', alunoId).not('enviado_em', 'is', null).order('enviado_em', { ascending: false })),
        tudo(() => supabase.from('gabarito_respostas').select('id, titulo, enviado_em, respondidas, acertos, total').eq('aluno_id', alunoId).order('enviado_em', { ascending: false })),
        tudo(() => supabase.from('tempo_plataforma').select('dia, segundos').eq('aluno_id', alunoId)),
        tudo(() => supabase.from('trilha_conteudos').select('conteudo, progresso').eq('aluno_id', alunoId)),
        tudo(() => supabase.from('erros').select('id, proxima_revisao, dominado').eq('aluno_id', alunoId)),
        tudo(() => supabase.from('checkins').select('dia, status').eq('aluno_id', alunoId).gte('dia', somarDias(hojeISO(), -6))),
        tudo(() => supabase.from('xp_eventos').select('tipo, chave, xp, criado_em').eq('aluno_id', alunoId)),
        supabase.rpc('ranking_xp', { p_desde: new Date(semana + 'T00:00:00').toISOString() }),
      ])
      if (!vivo) return
      setD({ resp, tent, gabs, tempo, trilha, erros, checkins, xp, ranking: ranking.data ?? [] })
    })()
    return () => { vivo = false }
  }, [alunoId])

  const m = useMemo(() => {
    if (!d) return null
    const hoje = hojeISO()
    const sem = inicioSemana()
    const mes = inicioMes()
    // cada "lote" de questões feitas: banco (1 por resposta), simulados e cartões-resposta
    const lotes = [
      ...d.resp.map((r) => ({ dia: diaLocal(r.criado_em), n: 1, a: r.correta ? 1 : 0, temAcerto: true })),
      ...d.tent.map((t) => {
        const r = Array.isArray(t.simulado_resultados) ? t.simulado_resultados[0] : t.simulado_resultados
        return { dia: diaLocal(t.enviado_em), n: Object.keys(t.respostas || {}).length, a: r ? r.acertos : 0, temAcerto: !!r }
      }),
      ...d.gabs.map((g) => ({ dia: diaLocal(g.enviado_em), n: g.respondidas, a: g.acertos, temAcerto: true })),
    ]
    const periodo = (desde) => {
      const l = lotes.filter((x) => !desde || x.dia >= desde)
      const n = l.reduce((s, x) => s + x.n, 0)
      const comA = l.filter((x) => x.temAcerto)
      return { n, pct: pct(comA.reduce((s, x) => s + x.a, 0), comA.reduce((s, x) => s + x.n, 0)) }
    }
    const ultimos14 = Array.from({ length: 14 }, (_, i) => somarDias(hoje, i - 13)).map((dia) => ({ dia, n: lotes.filter((x) => x.dia === dia).reduce((s, x) => s + x.n, 0) }))
    const tempo = (desde) => d.tempo.filter((t) => !desde || t.dia >= desde).reduce((s, t) => s + t.segundos, 0)
    const regs = Object.fromEntries(d.trilha.map((t) => [t.conteudo, t.progresso]))
    const soma = CONTEUDOS.reduce((s, c) => s + (regs[c.id] ?? 0), 0)
    const concluidos = CONTEUDOS.filter((c) => regs[c.id] === 100).length
    const porMateria = MATERIAS_TRILHA.map((mt) => {
      const l = CONTEUDOS.filter((c) => c.materia === mt.chave)
      return { ...mt, pct: Math.round(l.reduce((s, c) => s + (regs[c.id] ?? 0), 0) / Math.max(1, l.length)), feitos: l.filter((c) => regs[c.id] === 100).length, total: l.length }
    })
    const xpTotal = d.xp.reduce((s, e) => s + e.xp, 0)
    const xpSemana = d.xp.filter((e) => diaLocal(e.criado_em) >= sem).reduce((s, e) => s + e.xp, 0)
    const pos = d.ranking.findIndex((r) => r.aluno_id === alunoId) + 1
    const revisar = d.erros.filter((e) => !e.dominado && e.proxima_revisao && e.proxima_revisao <= hoje).length
    const checkFeitos = d.checkins.filter((c) => c.status === 'feito').length
    const simulados = [
      ...d.tent.map((t) => { const r = Array.isArray(t.simulado_resultados) ? t.simulado_resultados[0] : t.simulado_resultados; return { id: t.id, titulo: t.titulo, quando: t.enviado_em, r } }),
      ...d.gabs.map((g) => ({ id: g.id, titulo: g.titulo, quando: g.enviado_em, r: { acertos: g.acertos, total: g.total } })),
    ].filter((s) => s.quando).sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 5)
    return {
      hoje: periodo(hoje), semana: periodo(sem), mes: periodo(mes), total: periodo(null), ultimos14,
      tempoHoje: tempo(hoje), tempoSemana: tempo(sem), tempoMes: tempo(mes),
      trilhaPct: Math.round(soma / CONTEUDOS.length), concluidos, totalConteudos: CONTEUDOS.length, porMateria,
      xpTotal, xpSemana, pos, nRanking: d.ranking.length, seq: sequenciaAtual(d.xp), revisar, checkFeitos, simulados,
      nivel: progressoNivel(xpTotal),
    }
  }, [d, alunoId])

  if (!m) return <p className="suave">Carregando o painel…</p>
  const maxDia = Math.max(1, ...m.ultimos14.map((x) => x.n))
  const nome = (aluno?.nome || '').split(' ')[0]

  return (
    <section className="secao pn">
      <div className="cartao pn-topo">
        <div>
          <span className="suave pequeno">{ehMentor ? `Painel de ${aluno?.nome || 'aluno'}` : `Bora, ${nome || 'campeão'}! 💪`}</span>
          <h2>{m.hoje.n ? `${m.hoje.n} ${m.hoje.n === 1 ? 'questão' : 'questões'} hoje` : 'Nenhuma questão hoje ainda'}</h2>
          <span className="suave pequeno">{m.semana.n} na semana · {m.mes.n} no mês · {m.total.n.toLocaleString('pt-BR')} no total</span>
        </div>
        <button className="pn-nivel" onClick={() => irPara?.('ranking')} title="Ver ranking">
          <b>{m.nivel.nivel}</b><span>nível</span>
        </button>
      </div>

      <div className="pn-grade">
        <Bloco icone="📅" titulo="Hoje" valor={m.hoje.n} sub={m.hoje.pct !== null ? `${m.hoje.pct}% de acerto` : 'questões'} />
        <Bloco icone="🗓️" titulo="Semana" valor={m.semana.n} sub={m.semana.pct !== null ? `${m.semana.pct}% de acerto` : 'questões'} />
        <Bloco icone="📆" titulo="Mês" valor={m.mes.n} sub={m.mes.pct !== null ? `${m.mes.pct}% de acerto` : 'questões'} />
        <Bloco icone="🧠" titulo="Total" valor={m.total.n.toLocaleString('pt-BR')} sub={m.total.pct !== null ? `${m.total.pct}% de acerto` : 'questões'} />
      </div>

      <div className="cartao pn-bloco">
        <h3>Questões nos últimos 14 dias</h3>
        <div className="pn-barras">
          {m.ultimos14.map((x) => (
            <div key={x.dia} className={x.dia === hojeISO() ? 'pn-barra hoje' : 'pn-barra'} title={`${x.dia.split('-').reverse().slice(0, 2).join('/')}: ${x.n}`}>
              <span className="pn-barra-n">{x.n || ''}</span>
              <i style={{ height: `${Math.max(3, (x.n / maxDia) * 100)}%` }} />
              <small>{new Date(x.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'narrow' })}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="pn-grade">
        <Bloco icone="🏆" titulo="Ranking da semana" valor={m.pos ? `${m.pos}º` : '–'} sub={`de ${m.nRanking} alunos`} onClick={() => irPara?.('ranking')} />
        <Bloco icone="⚡" titulo="XP" valor={m.xpTotal.toLocaleString('pt-BR')} sub={`+${m.xpSemana} esta semana`} onClick={() => irPara?.('ranking')} />
        <Bloco icone="🔥" titulo="Sequência" valor={m.seq} sub="dias seguidos de check-in" onClick={() => irPara?.('horario')} />
        <Bloco icone="⏱️" titulo="Tempo na plataforma" valor={horas(m.tempoHoje)} sub={`${horas(m.tempoSemana)} na semana · ${horas(m.tempoMes)} no mês`} />
      </div>

      <div className="cartao pn-bloco">
        <div className="pn-cabeca">
          <h3>🧭 Andamento dos conteúdos</h3>
          <button className="botao pequeno" onClick={() => irPara?.('trilha')}>Abrir trilha →</button>
        </div>
        <div className="pn-trilha">
          <div className="pn-anel" style={{ '--p': m.trilhaPct }}><b>{m.trilhaPct}%</b></div>
          <div>
            <strong>{m.concluidos} de {m.totalConteudos} conteúdos concluídos</strong>
            <span className="suave pequeno">Faltam {m.totalConteudos - m.concluidos} para terminar a trilha toda.</span>
          </div>
        </div>
        <div className="pn-materias">
          {m.porMateria.map((mt) => (
            <div key={mt.chave} className="pn-materia">
              <span>{mt.emoji} {mt.nome}</span>
              <div className="pn-linha"><i style={{ width: `${mt.pct}%`, background: mt.cor }} /></div>
              <small className="suave">{mt.feitos}/{mt.total}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="pn-grade">
        <Bloco icone="✅" titulo="Check-ins (7 dias)" valor={m.checkFeitos} sub="blocos de estudo feitos" onClick={() => irPara?.('horario')} />
        <Bloco icone="📕" titulo="Para revisar hoje" valor={m.revisar} sub="no caderno de erros" onClick={() => irPara?.('erros')} />
      </div>

      <div className="cartao pn-bloco">
        <div className="pn-cabeca">
          <h3>🏁 Últimos simulados</h3>
          <button className="botao pequeno" onClick={() => irPara?.('simulado-enem')}>Fazer simulado →</button>
        </div>
        {m.simulados.length ? (
          <ul className="pn-sims">
            {m.simulados.map((s) => (
              <li key={s.id}><span>{s.titulo}</span><span className="suave pequeno">{new Date(s.quando).toLocaleDateString('pt-BR')}</span><b>{s.r ? `${s.r.acertos}/${s.r.total}` : 'aguardando'}</b></li>
            ))}
          </ul>
        ) : <p className="suave">Nenhum simulado ainda. Que tal fazer o primeiro?</p>}
      </div>
    </section>
  )
}

function Bloco({ icone, titulo, valor, sub, onClick }) {
  const C = onClick ? 'button' : 'div'
  return (
    <C className={onClick ? 'cartao pn-card clicavel' : 'cartao pn-card'} onClick={onClick}>
      <span className="pn-card-titulo">{icone} {titulo}</span>
      <b>{valor}</b>
      <small className="suave">{sub}</small>
    </C>
  )
}
