import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { MATERIAS, corDaMateria } from './constants'
import { hojeISO, somarDias } from './agenda'
import { conferirTudo, minutosTexto } from './estudo'

const MODOS = { curto: { foco: 25, pausa: 5, nome: '25 / 5' }, longo: { foco: 50, pausa: 10, nome: '50 / 10' } }
const OPCOES = MATERIAS.filter((m) => !['Descanso', 'Escola/Cursinho', 'Simulado'].includes(m.nome)).map((m) => m.nome)
const modoTeste = () => { try { return new URLSearchParams(window.location.search).has('teste') } catch { return false } }
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

// Som suave no fim (sem arquivo de áudio)
function tocarSino() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const t = ctx.currentTime + i * 0.35
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.05)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 1.7)
    })
    setTimeout(() => ctx.close?.(), 3000)
  } catch { /* sem áudio */ }
}

export default function Foco({ alunoId, ehMentor, irPara }) {
  const [sessoes, setSessoes] = useState([])
  const carregar = useCallback(async () => {
    const seg = (() => { const h = hojeISO(); const d = new Date(h + 'T12:00:00'); return somarDias(h, -((d.getDay() + 6) % 7)) })()
    const { data } = await supabase.from('sessoes_foco').select('materia, minutos, criado_em').eq('aluno_id', alunoId)
      .gte('criado_em', new Date(seg + 'T00:00:00-03:00').toISOString()).order('criado_em')
    setSessoes(data ?? [])
  }, [alunoId])
  useEffect(() => { carregar() }, [carregar])

  return (
    <section className="secao foco">
      {!ehMentor && <Pomodoro alunoId={alunoId} onConcluiu={carregar} />}
      <GraficoSemana sessoes={sessoes} />
      <button className="botao" onClick={() => irPara?.('ranking')}>🏆 Ver ranking de horas de foco</button>
    </section>
  )
}

export function Pomodoro({ alunoId, onConcluiu, registrar }) {
  const teste = modoTeste()
  const [materia, setMateria] = useState(() => { try { return sessionStorage.getItem('focoMateria') || '' } catch { return '' } })
  const [modo, setModo] = useState('curto')
  const [fase, setFase] = useState('parado') // parado | foco | pausa
  const [fimEm, setFimEm] = useState(null)
  const [pausadoResta, setPausadoResta] = useState(null)
  const [agora, setAgora] = useState(Date.now())
  const [msg, setMsg] = useState('')
  const caixa = useRef(null)
  const wake = useRef(null)

  useEffect(() => { try { sessionStorage.removeItem('focoMateria') } catch { /* ok */ } }, [])

  const dur = (f) => (teste ? 1 : MODOS[modo][f]) * 60000
  const resta = pausadoResta ?? (fimEm ? Math.max(0, fimEm - agora) : dur('foco'))
  const total = fase === 'pausa' ? dur('pausa') : dur('foco')
  const rodando = fase !== 'parado' && pausadoResta === null

  useEffect(() => {
    if (!rodando) return
    const t = setInterval(() => setAgora(Date.now()), 250)
    return () => clearInterval(t)
  }, [rodando])

  // Tela sempre acesa enquanto o cronômetro corre (como no Simulador do ENEM)
  useEffect(() => {
    const pedir = async () => { try { if (rodando && !wake.current && navigator.wakeLock) wake.current = await navigator.wakeLock.request('screen') } catch { /* sem suporte */ } }
    if (rodando) pedir()
    else if (wake.current) { wake.current.release?.(); wake.current = null }
    const vis = () => { if (document.visibilityState === 'visible' && rodando) { wake.current = null; pedir() } }
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [rodando])

  const terminarFase = useCallback(async () => {
    tocarSino()
    if (fase === 'foco') {
      const minutos = Math.round(dur('foco') / 60000)
      const salvar = registrar || (async () => {
        const { error } = await supabase.rpc('registrar_foco', { p_materia: materia, p_minutos: minutos })
        if (error) throw error
        await conferirTudo(alunoId)
      })
      try {
        await salvar(materia, minutos)
        setMsg(`Sessão salva: ${minutosTexto(minutos)} de ${materia}. Respira — hora da pausa.`)
        onConcluiu?.()
      } catch (e) {
        setMsg('Não foi possível salvar a sessão: ' + (e.message || 'tente de novo'))
      }
      setFase('pausa')
      setFimEm(Date.now() + dur('pausa'))
    } else {
      setMsg('Pausa encerrada. Bora para mais uma?')
      setFase('parado')
      setFimEm(null)
    }
  }, [fase, materia, alunoId, registrar, onConcluiu]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rodando && resta <= 0) terminarFase()
  }, [rodando, resta, terminarFase])

  function comecar() {
    if (!materia) return setMsg('Escolha a matéria antes de começar.')
    setMsg('')
    setFase('foco')
    setPausadoResta(null)
    setAgora(Date.now())
    setFimEm(Date.now() + dur('foco'))
    caixa.current?.requestFullscreen?.().catch(() => {})
  }
  function pausar() {
    if (pausadoResta !== null) { setFimEm(Date.now() + pausadoResta); setAgora(Date.now()); setPausadoResta(null) } else setPausadoResta(resta)
  }
  function parar() {
    setFase('parado'); setFimEm(null); setPausadoResta(null)
    if (document.fullscreenElement) document.exitFullscreen?.()
  }

  const mm = String(Math.floor(resta / 60000)).padStart(2, '0')
  const ss = String(Math.floor((resta % 60000) / 1000)).padStart(2, '0')
  const progresso = 1 - resta / total
  const R = 140
  const C = 2 * Math.PI * R

  return (
    <div ref={caixa} className={`pomodoro fase-${fase}`}>
      {fase === 'parado' ? (
        <div className="pomodoro-config">
          <span className="hoje-kicker">Sessão de foco</span>
          <h2>No que você vai <em>focar</em> agora?</h2>
          <div className="pomodoro-materias" role="radiogroup" aria-label="Matéria">
            {OPCOES.map((m) => (
              <button key={m} role="radio" aria-checked={materia === m} className={materia === m ? 'chip-materia ativo' : 'chip-materia'}
                style={{ '--cor': corDaMateria(m) }} onClick={() => setMateria(m)}>{m}</button>
            ))}
          </div>
          <div className="abas" role="tablist" aria-label="Duração">
            {Object.entries(MODOS).map(([k, v]) => (
              <button key={k} role="tab" aria-selected={modo === k} className={modo === k ? 'aba ativa' : 'aba'} onClick={() => setModo(k)}>{v.nome} min</button>
            ))}
          </div>
          {teste && <p className="suave pequeno">Modo de teste: 1 min de foco e 1 de pausa.</p>}
          <button className="botao lima grande" onClick={comecar}>▶ Começar foco</button>
          {msg && <p className="pomodoro-msg" role="status">{msg}</p>}
        </div>
      ) : (
        <div className="pomodoro-rodando">
          <span className="pomodoro-fase">{fase === 'foco' ? `Foco · ${materia}` : 'Pausa · respira'}</span>
          <svg className="pomodoro-anel" viewBox="0 0 320 320" role="timer" aria-label={`${mm} minutos e ${ss} segundos restantes`}>
            <circle cx="160" cy="160" r={R} className="pomodoro-trilho" />
            <circle cx="160" cy="160" r={R} className="pomodoro-valor" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - progresso) }} />
            <text x="160" y="178" textAnchor="middle" className="pomodoro-tempo">{mm}:{ss}</text>
          </svg>
          <div className="pomodoro-botoes">
            <button className="botao" onClick={pausar}>{pausadoResta !== null ? '▶ Continuar' : '⏸ Pausar'}</button>
            <button className="botao fantasma" onClick={parar}>Encerrar</button>
          </div>
          {msg && <p className="pomodoro-msg" role="status">{msg}</p>}
        </div>
      )}
    </div>
  )
}

// Horas de foco por dia e por matéria nesta semana
export function GraficoSemana({ sessoes }) {
  const { porDia, porMateria, total } = useMemo(() => {
    const porDia = Array(7).fill(0)
    const porMateria = {}
    for (const s of sessoes) {
      const d = new Date(new Date(s.criado_em).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
      porDia[(d.getDay() + 6) % 7] += s.minutos
      porMateria[s.materia || 'Outro'] = (porMateria[s.materia || 'Outro'] || 0) + s.minutos
    }
    return { porDia, porMateria: Object.entries(porMateria).sort((a, b) => b[1] - a[1]), total: porDia.reduce((a, b) => a + b, 0) }
  }, [sessoes])
  const max = Math.max(60, ...porDia)
  return (
    <div className="cartao foco-grafico">
      <div className="hoje-missoes-topo">
        <div><span className="hoje-kicker">Esta semana</span><h2><b>{minutosTexto(total)}</b> de foco</h2></div>
      </div>
      <div className="barras-dia" role="img" aria-label="Minutos de foco por dia da semana">
        {porDia.map((m, i) => (
          <div key={i} className="barra-dia">
            <span className="barra-dia-valor">{m ? minutosTexto(m) : ''}</span>
            <i style={{ height: `${Math.max(m ? 6 : 2, (m / max) * 100)}%` }} />
            <span>{DIAS[i]}</span>
          </div>
        ))}
      </div>
      {porMateria.length > 0 ? (
        <ul className="foco-materias">
          {porMateria.map(([m, v]) => (
            <li key={m}><span className="ponto" style={{ background: corDaMateria(m) }} />{m}<i><b style={{ width: `${(v / porMateria[0][1]) * 100}%`, background: corDaMateria(m) }} /></i><strong>{minutosTexto(v)}</strong></li>
          ))}
        </ul>
      ) : <p className="suave pequeno">Nenhuma sessão de foco nesta semana ainda.</p>}
    </div>
  )
}
