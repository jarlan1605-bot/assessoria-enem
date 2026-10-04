import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import {
  MESES, DIAS_CURTOS, inicioDoMes, somarMeses, mesmoDia, mesmoMes, faixaHorario,
  diaPorExtenso, chaveDoDia, agruparPorDia, semanasDoMes,
} from './agenda'
import Avatar from './Avatar'

const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Agenda({ alunos: todosAlunos, ehCeo = false, meuId, equipe = [] }) {
  const [verMentor, setVerMentor] = useState(meuId) // CEO escolhe de quem ver a agenda
  const filtrandoMentor = ehCeo && verMentor !== 'todos'
  const alunos = filtrandoMentor ? todosAlunos.filter((a) => a.mentor_id === verMentor) : todosAlunos
  const nomeDoMentor = (id) => {
    const m = equipe.find((x) => x.id === id)
    return m ? (m.id === meuId ? 'você' : (m.nome || '').split(' ')[0]) : ''
  }
  const [mes, setMes] = useState(() => inicioDoMes(new Date()))
  const [todosItens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [diaSel, setDiaSel] = useState(null)
  const [abrirForm, setAbrirForm] = useState(false)

  const nomeDoAluno = useCallback(
    (id) => {
      const a = todosAlunos.find((x) => x.id === id)
      return a ? a.nome || a.email : 'Aluno removido'
    },
    [todosAlunos]
  )

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('atendimentos')
      .select('*')
      .gte('inicio', mes.toISOString())
      .lt('inicio', somarMeses(mes, 1).toISOString())
      .order('inicio')
    if (error) setErro('Não foi possível carregar a agenda. Você já rodou o arquivo agenda.sql no Supabase?')
    else {
      setErro('')
      setItens(data ?? [])
    }
    setCarregando(false)
  }, [mes])

  useEffect(() => {
    setCarregando(true)
    carregar()
  }, [carregar])

  // Ao trocar de mês, seleciona hoje (se for o mês atual) ou nada
  useEffect(() => {
    const hoje = new Date()
    setDiaSel(mesmoMes(hoje, mes) ? hoje : null)
  }, [mes])

  const itens = useMemo(
    () => (filtrandoMentor ? todosItens.filter((a) => a.mentor_id === verMentor) : todosItens),
    [todosItens, filtrandoMentor, verMentor]
  )

  const porDia = useMemo(() => {
    const m = {}
    for (const a of itens) {
      const k = chaveDoDia(new Date(a.inicio))
      m[k] ??= { livres: 0, marcados: 0 }
      a.aluno_id ? m[k].marcados++ : m[k].livres++
    }
    return m
  }, [itens])

  const agora = Date.now()
  const marcados = itens.filter((a) => a.aluno_id)
  const realizados = marcados.filter((a) => new Date(a.inicio).getTime() < agora)
  const livresFuturos = itens.filter((a) => !a.aluno_id && new Date(a.inicio).getTime() > agora)
  const horasMarcadas = marcados.reduce((s, a) => s + a.duracao_min, 0) / 60

  const porAluno = alunos
    .map((al) => ({ ...al, usados: marcados.filter((a) => a.aluno_id === al.id).length }))
    .sort((a, b) => b.usados - a.usados || (a.nome || '').localeCompare(b.nome || ''))

  const listaVisivel = diaSel ? itens.filter((a) => mesmoDia(new Date(a.inicio), diaSel)) : itens

  async function apagar(a) {
    const quem = a.aluno_id ? ` (reservado por ${nomeDoAluno(a.aluno_id)})` : ''
    if (!confirm(`Apagar o horário de ${diaPorExtenso(new Date(a.inicio))}, ${faixaHorario(a)}${quem}?`)) return
    const { error } = await supabase.from('atendimentos').delete().eq('id', a.id)
    if (error) setErro('Não foi possível apagar: ' + error.message)
    else carregar()
  }

  async function liberar(a) {
    if (!confirm(`Desmarcar ${nomeDoAluno(a.aluno_id)} e deixar o horário livre de novo?`)) return
    const { error } = await supabase
      .from('atendimentos')
      .update({ aluno_id: null, tema: '', reservado_em: null })
      .eq('id', a.id)
    if (error) setErro('Não foi possível liberar: ' + error.message)
    else carregar()
  }

  async function marcarAluno(a, alunoId) {
    if (!alunoId) return
    const { error } = await supabase
      .from('atendimentos')
      .update({ aluno_id: alunoId, reservado_em: new Date().toISOString() })
      .eq('id', a.id)
    if (error) setErro('Não foi possível marcar: ' + error.message)
    else carregar()
  }

  const hoje = new Date()

  return (
    <section className="secao">
      <div className="agenda-topo">
        <div className="navegar-mes">
          <button className="botao fantasma" onClick={() => setMes((m) => somarMeses(m, -1))} aria-label="Mês anterior">‹</button>
          <h2>{MESES[mes.getMonth()]} {mes.getFullYear()}</h2>
          <button className="botao fantasma" onClick={() => setMes((m) => somarMeses(m, 1))} aria-label="Próximo mês">›</button>
          {!mesmoMes(mes, hoje) && (
            <button className="botao fantasma pequeno" onClick={() => setMes(inicioDoMes(hoje))}>Hoje</button>
          )}
        </div>
        <div className="agenda-acoes">
          {ehCeo && equipe.length > 1 && (
            <select className="select-mentor" value={verMentor} onChange={(e) => setVerMentor(e.target.value)} aria-label="Agenda de qual mentor">
              {equipe.map((m) => <option key={m.id} value={m.id}>{m.id === meuId ? 'Minha agenda' : `Agenda de ${m.nome || 'mentor'}`}</option>)}
              <option value="todos">Todos os mentores</option>
            </select>
          )}
          {!abrirForm && (
            <button className="botao primario" onClick={() => setAbrirForm(true)}>+ Abrir horários</button>
          )}
        </div>
      </div>

      {abrirForm && (
        <FormHorarios
          mentorAlvo={ehCeo && filtrandoMentor && verMentor !== meuId ? verMentor : null}
          nomeMentorAlvo={filtrandoMentor ? nomeDoMentor(verMentor) : ''}
          onFechar={() => setAbrirForm(false)}
          onCriado={(primeiraData) => {
            setAbrirForm(false)
            const novoMes = inicioDoMes(primeiraData)
            if (mesmoMes(novoMes, mes)) carregar()
            else setMes(novoMes)
          }}
        />
      )}

      {erro && <p className="erro">{erro}</p>}

      <div className="resumo-cartoes resumo-agenda">
        <div className="cartao mini" style={{ '--cor': 'var(--primaria)' }}>
          <span className="mini-titulo">Atendimentos</span>
          <strong className="mini-numero">{marcados.length}</strong>
          <span className="suave pequeno">marcados no mês · {horasMarcadas.toLocaleString('pt-BR')}h</span>
        </div>
        <div className="cartao mini" style={{ '--cor': '#2f9e44' }}>
          <span className="mini-titulo">Realizados</span>
          <strong className="mini-numero">{realizados.length}</strong>
          <span className="suave pequeno">já aconteceram</span>
        </div>
        <div className="cartao mini" style={{ '--cor': '#e67700' }}>
          <span className="mini-titulo">Vagos</span>
          <strong className="mini-numero">{livresFuturos.length}</strong>
          <span className="suave pequeno">horários livres à frente</span>
        </div>
        <div className="cartao mini" style={{ '--cor': '#7048e8' }}>
          <span className="mini-titulo">Alunos</span>
          <strong className="mini-numero">{new Set(marcados.map((a) => a.aluno_id)).size}</strong>
          <span className="suave pequeno">atendidos no mês</span>
        </div>
      </div>

      <div className="agenda-grade">
        <div className="cartao calendario">
          <div className="cal-cabecalho">
            {DIAS_CURTOS.map((d) => <span key={d}>{d}</span>)}
          </div>
          {semanasDoMes(mes).map((semana, i) => (
            <div key={i} className="cal-semana">
              {semana.map((d, j) => {
                if (!d) return <span key={j} className="cal-dia vazio" />
                const info = porDia[chaveDoDia(d)]
                const classes = ['cal-dia']
                if (mesmoDia(d, hoje)) classes.push('hoje')
                if (diaSel && mesmoDia(d, diaSel)) classes.push('selecionado')
                return (
                  <button
                    key={j}
                    className={classes.join(' ')}
                    onClick={() => setDiaSel(diaSel && mesmoDia(d, diaSel) ? null : d)}
                    aria-label={`${d.getDate()}: ${info?.marcados ?? 0} marcados, ${info?.livres ?? 0} livres`}
                  >
                    <span className="cal-numero">{d.getDate()}</span>
                    {info && (
                      <span className="cal-marcas">
                        {info.marcados > 0 && <span className="marca marcado">{info.marcados}</span>}
                        {info.livres > 0 && <span className="marca livre">{info.livres}</span>}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
          <div className="legenda cal-legenda">
            <span><i className="marca-cor marcado" /> marcados</span>
            <span><i className="marca-cor livre" /> livres</span>
          </div>
        </div>

        <div className="cartao lista-dia">
          <div className="lista-dia-topo">
            <h2>{diaSel ? diaPorExtenso(diaSel) : `Todo o mês de ${MESES[mes.getMonth()].toLowerCase()}`}</h2>
            {diaSel && (
              <button className="botao fantasma pequeno" onClick={() => setDiaSel(null)}>Ver o mês todo</button>
            )}
          </div>
          {carregando ? (
            <p className="suave">Carregando…</p>
          ) : listaVisivel.length === 0 ? (
            <p className="suave">
              {diaSel ? 'Nenhum horário neste dia.' : 'Nenhum horário aberto neste mês. Clique em “Abrir horários”.'}
            </p>
          ) : (
            agruparPorDia(listaVisivel).map((g) => (
              <div key={chaveDoDia(g.dia)} className="grupo-dia">
                {!diaSel && <h3 className="grupo-titulo">{diaPorExtenso(g.dia)}</h3>}
                {g.itens.map((a) => (
                  <LinhaAtendimento
                    key={a.id}
                    a={a}
                    alunos={ehCeo ? todosAlunos.filter((x) => x.mentor_id === a.mentor_id) : alunos}
                    rotuloMentor={ehCeo && !filtrandoMentor ? nomeDoMentor(a.mentor_id) : ''}
                    todosAlunos={todosAlunos}
                    nomeDoAluno={nomeDoAluno}
                    onApagar={() => apagar(a)}
                    onLiberar={() => liberar(a)}
                    onMarcar={(id) => marcarAluno(a, id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {alunos.length > 0 && (
        <div className="cartao">
          <h2>Atendimentos por aluno em {MESES[mes.getMonth()].toLowerCase()}</h2>
          <div className="por-aluno">
            {porAluno.map((al) => {
              const limite = al.limite_mensal ?? 4
              const pct = limite ? Math.min(100, (al.usados / limite) * 100) : 0
              return (
                <div key={al.id} className="por-aluno-linha">
                  <span className="por-aluno-nome">
                    <Avatar src={al.foto_url} nome={al.nome || al.email} tamanho={26} />
                    <span>{al.nome || al.email}</span>
                  </span>
                  <span className="barra" aria-hidden="true"><i style={{ width: `${pct}%` }} className={al.usados >= limite ? 'cheia' : ''} /></span>
                  <span className="por-aluno-num">{al.usados} de {limite}</span>
                </div>
              )
            })}
          </div>
          <p className="suave pequeno" style={{ marginTop: 10, marginBottom: 0 }}>
            O limite de cada aluno é ajustado no seletor de aluno, nas abas Horário ou Simulados.
          </p>
        </div>
      )}
    </section>
  )
}

function LinhaAtendimento({ a, alunos, todosAlunos, rotuloMentor, nomeDoAluno, onApagar, onLiberar, onMarcar }) {
  const [escolhendo, setEscolhendo] = useState(false)
  const passou = new Date(a.inicio).getTime() < Date.now()

  return (
    <div className={`atendimento ${a.aluno_id ? 'marcado' : 'livre'} ${passou ? 'passou' : ''}`}>
      <span className="atendimento-hora">
        {faixaHorario(a)}
        {rotuloMentor && <span className="atendimento-mentor">{rotuloMentor}</span>}
      </span>
      <div className="atendimento-info">
        {a.aluno_id ? (
          <span className="atendimento-aluno">
            <Avatar
              src={todosAlunos.find((x) => x.id === a.aluno_id)?.foto_url}
              nome={nomeDoAluno(a.aluno_id)}
              tamanho={30}
            />
            <span className="atendimento-aluno-texto">
              <strong>{nomeDoAluno(a.aluno_id)}</strong>
              {a.tema && <span className="suave pequeno">{a.tema}</span>}
            </span>
          </span>
        ) : (
          <span className="suave">{passou ? 'Não reservado' : 'Livre'}</span>
        )}
      </div>
      <div className="atendimento-acoes">
        {escolhendo ? (
          <>
            <select autoFocus defaultValue="" onChange={(e) => { onMarcar(e.target.value); setEscolhendo(false) }}>
              <option value="" disabled>Escolher aluno…</option>
              {alunos.map((al) => <option key={al.id} value={al.id}>{al.nome || al.email}</option>)}
            </select>
            <button className="link" onClick={() => setEscolhendo(false)}>cancelar</button>
          </>
        ) : (
          <>
            {!a.aluno_id && !passou && alunos.length > 0 && (
              <button className="link" onClick={() => setEscolhendo(true)}>marcar aluno</button>
            )}
            {a.aluno_id && <button className="link" onClick={onLiberar}>desmarcar</button>}
            <button className="link perigo" onClick={onApagar}>apagar</button>
          </>
        )}
      </div>
    </div>
  )
}

function FormHorarios({ mentorAlvo, nomeMentorAlvo, onFechar, onCriado }) {
  const [data, setData] = useState(hojeISO())
  const [horas, setHoras] = useState(['19:00'])
  const [duracao, setDuracao] = useState(60)
  const [semanas, setSemanas] = useState(1)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const total = horas.filter(Boolean).length * semanas

  async function salvar(e) {
    e.preventDefault()
    const validas = horas.filter(Boolean)
    if (!validas.length) return setErro('Coloque pelo menos um horário.')
    const linhas = []
    for (let s = 0; s < semanas; s++) {
      for (const h of validas) {
        const [ano, mes, dia] = data.split('-').map(Number)
        const [hh, mm] = h.split(':').map(Number)
        const inicio = new Date(ano, mes - 1, dia + s * 7, hh, mm)
        if (inicio.getTime() > Date.now()) linhas.push({ inicio: inicio.toISOString(), duracao_min: duracao, ...(mentorAlvo ? { mentor_id: mentorAlvo } : {}) })
      }
    }
    if (!linhas.length) return setErro('Esses horários já passaram. Escolha uma data futura.')
    setSalvando(true)
    const { error } = await supabase.from('atendimentos').insert(linhas)
    setSalvando(false)
    if (error) return setErro('Não foi possível salvar: ' + error.message)
    onCriado(new Date(linhas[0].inicio))
  }

  const [ano, mes, dia] = data.split('-').map(Number)
  const diaDaSemana = data ? diaPorExtenso(new Date(ano, mes - 1, dia)).split(',')[0] : ''

  return (
    <form className="cartao" onSubmit={salvar}>
      <h2>Abrir horários para atendimento{nomeMentorAlvo && nomeMentorAlvo !== 'você' ? ` de ${nomeMentorAlvo}` : ''}</h2>
      <div className="grade-form">
        <label>
          Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </label>
        <label>
          Duração
          <select value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
            {[30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60}`.replace('.', ',') + 'h'}</option>
            ))}
          </select>
        </label>
        <label className="largo-2">
          Repetir {diaDaSemana ? `${['sábado', 'domingo'].includes(diaDaSemana) ? 'todo' : 'toda'} ${diaDaSemana}` : 'toda semana'}
          <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>
            <option value={1}>Não repetir (só neste dia)</option>
            {[2, 3, 4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>Pelas próximas {n} semanas</option>
            ))}
          </select>
        </label>
      </div>

      <p className="rotulo-campo">Horários de início neste dia</p>
      <div className="horas-lista">
        {horas.map((h, i) => (
          <span key={i} className="hora-item">
            <input
              type="time"
              value={h}
              onChange={(e) => setHoras((l) => l.map((x, k) => (k === i ? e.target.value : x)))}
            />
            {horas.length > 1 && (
              <button type="button" className="link perigo" onClick={() => setHoras((l) => l.filter((_, k) => k !== i))} aria-label="Remover horário">✕</button>
            )}
          </span>
        ))}
        <button
          type="button"
          className="botao fantasma pequeno"
          onClick={() => {
            const ult = horas[horas.length - 1] || '18:00'
            const [hh, mm] = ult.split(':').map(Number)
            const t = Math.min(hh * 60 + mm + duracao, 23 * 60)
            setHoras((l) => [...l, `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`])
          }}
        >
          + outro horário
        </button>
      </div>

      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <span className="suave pequeno" style={{ marginRight: 'auto', alignSelf: 'center' }}>
          {total === 1 ? 'Vai abrir 1 horário.' : `Vai abrir ${total} horários.`}
        </span>
        <button type="button" className="botao fantasma" onClick={onFechar}>Cancelar</button>
        <button className="botao primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Abrir horários'}</button>
      </div>
    </form>
  )
}
