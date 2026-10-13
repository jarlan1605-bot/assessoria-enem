import { useEffect, useMemo, useRef, useState } from 'react'

/*
  Simulador do ENEM — o quadro do aplicador.
  Na prova não existe relógio: só o quadro, onde o aplicador escreve os horários
  de 30 em 30 minutos com o tempo que falta, e vai riscando o último horário que passou.
  Aqui é igual: a tela mostra só o quadro, e os horários vão sendo riscados.
*/

const CHAVE = 'simuladorProva.v3'
const INICIO = 13 * 60 + 30 // 13h30 (horário de Brasília)

const DIAS = {
  dia1: { nome: '1º dia', desc: 'Linguagens, Humanas e Redação', minutos: 330 },
  dia2: { nome: '2º dia', desc: 'Natureza e Matemática', minutos: 300 },
}

const hora = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
const falta = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
const duracaoFalada = (min) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return [h ? `${h} ${h === 1 ? 'hora' : 'horas'}` : '', m ? `${m} minutos` : ''].filter(Boolean).join(' e ') || '0 minutos'
}
const duracaoCurta = (seg) => {
  seg = Math.max(0, Math.round(seg))
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}

// Horários do quadro: de 30 em 30 minutos e, no fim, faltando 15
function horariosDoQuadro(total) {
  const lista = []
  for (let m = 0; total - m >= 30; m += 30) lista.push({ em: m, horario: INICIO + m, resta: total - m })
  if (total > 15) lista.push({ em: total - 15, horario: INICIO + total - 15, resta: 15 })
  return lista
}

// O que o aplicador fala em voz alta
function avisosDoAplicador(total, oficial) {
  const a = [{ em: 0, texto: 'Podem iniciar a prova. Boa prova a todos.' }]
  if (oficial && total >= 150) a.push({ em: 120, texto: 'Já se passaram duas horas de prova. A partir de agora, quem terminar pode entregar e sair, mas sem levar o caderno de questões.' })
  if (total > 30) a.push({ em: total - 30, texto: oficial ? 'Faltam trinta minutos. A partir de agora, quem sair pode levar o caderno de questões. Verifiquem o cartão-resposta.' : 'Faltam trinta minutos. Verifiquem o cartão-resposta.' })
  if (total > 15) a.push({ em: total - 15, texto: 'Faltam quinze minutos para o término da prova.' })
  a.push({ em: total, texto: 'Tempo esgotado. Canetas abaixo. Permaneçam sentados para a coleta do material.' })
  return a
}

function tocar(forte) {
  try {
    const C = window.AudioContext || window.webkitAudioContext
    const ctx = new C()
    const notas = forte ? [880, 660, 880, 660] : [880, 660]
    notas.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      const t0 = ctx.currentTime + i * 0.38
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.22, t0 + 0.03)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.34)
      o.connect(g).connect(ctx.destination)
      o.start(t0)
      o.stop(t0 + 0.36)
    })
    setTimeout(() => ctx.close(), 2500)
  } catch { /* sem áudio */ }
}

function falar(texto) {
  try {
    const s = window.speechSynthesis
    if (!s) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(texto)
    u.lang = 'pt-BR'
    const voz = s.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt-br')) || s.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'))
    if (voz) u.voice = voz
    u.rate = 0.95
    s.speak(u)
  } catch { /* sem voz */ }
}

const VAZIO = { dia1: null, dia2: null, treino: null }
const ler = () => {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || 'null')
    if (v) return { ...VAZIO, ...v }
    const antigo = JSON.parse(localStorage.getItem('simuladorProva.v2') || 'null') // versão anterior: uma prova só
    if (antigo) return { ...VAZIO, [antigo.total === 330 ? 'dia1' : antigo.total === 300 ? 'dia2' : 'treino']: antigo }
  } catch { /* sem armazenamento */ }
  return { ...VAZIO }
}
const pausada = (e) => (e && !e.pausadoDesde && !e.entregueEm ? { ...e, pausadoDesde: Date.now(), pausas: e.pausas + 1 } : e)
const decorridoDe = (e, agora) => (e ? Math.max(0, Math.min(e.total * 60000, (e.entregueEm ?? e.pausadoDesde ?? agora) - e.comecouEm - e.pausadoMs)) / 60000 : 0)
const gravar = (v) => {
  try { v ? localStorage.setItem(CHAVE, JSON.stringify(v)) : localStorage.removeItem(CHAVE) } catch { /* sem armazenamento */ }
}

export default function SimuladorProva() {
  const [provas, setProvas] = useState(() => ler())
  const [modo, setModo] = useState(() => {
    const p = ler()
    return ['dia1', 'dia2', 'treino'].find((k) => p[k] && !p[k].pausadoDesde && !p[k].entregueEm) || ['dia1', 'dia2', 'treino'].find((k) => p[k]) || 'dia1'
  })
  const estado = provas[modo]
  const setEstado = (f) => setProvas((p) => ({ ...p, [modo]: typeof f === 'function' ? f(p[modo]) : f }))
  const livre = modo === 'treino'
  const dia = livre ? 'dia1' : modo
  const provasRef = useRef(provas)
  provasRef.current = provas
  const [livreMin, setLivreMin] = useState(150)
  const [voz, setVoz] = useState(true)
  const [agora, setAgora] = useState(Date.now())
  const [fala, setFala] = useState(null)
  const [telaCheia, setTelaCheia] = useState(false)
  const caixa = useRef(null)
  const wake = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  useEffect(() => gravar(provas), [provas])

  // fechou ou recarregou a página no meio da prova: ela fica pausada até o aluno voltar
  useEffect(() => {
    const ao = () => {
      const p = provasRef.current
      gravar({ dia1: pausada(p.dia1), dia2: pausada(p.dia2), treino: pausada(p.treino) })
    }
    window.addEventListener('pagehide', ao)
    return () => window.removeEventListener('pagehide', ao)
  }, [])

  // trocar de prova: a que estava rodando fica pausada, guardada do jeito que estava
  function irPara(k) {
    if (k === modo) return
    setProvas((p) => ({ ...p, [modo]: p[modo] && decorridoDe(p[modo], Date.now()) < p[modo].total ? pausada(p[modo]) : p[modo] }))
    window.speechSynthesis?.cancel()
    setFala(null)
    setModo(k)
  }

  const decorrido = decorridoDe(estado, agora)
  const acabou = estado && (estado.entregueEm || decorrido >= estado.total)
  const pausado = estado && estado.pausadoDesde && !acabou
  const quadro = useMemo(() => (estado ? horariosDoQuadro(estado.total) : []), [estado?.total]) // eslint-disable-line react-hooks/exhaustive-deps
  const avisos = useMemo(() => (estado ? avisosDoAplicador(estado.total, estado.oficial) : []), [estado?.total, estado?.oficial]) // eslint-disable-line react-hooks/exhaustive-deps

  // o aplicador fala na hora certa (cada aviso uma vez)
  useEffect(() => {
    if (!estado || pausado || estado.entregueEm) return
    const pend = avisos.filter((a) => a.em <= decorrido + 1e-6 && !estado.falados.includes(a.em))
    if (!pend.length) return
    const ultimo = pend[pend.length - 1]
    setEstado((e) => ({ ...e, falados: [...e.falados, ...pend.map((a) => a.em)] }))
    if (decorrido - ultimo.em < 1) {
      setFala({ ...ultimo, id: Date.now() })
      if (estado.som) tocar(ultimo.em === estado.total)
      if (estado.voz) setTimeout(() => falar(ultimo.texto), estado.som ? 900 : 0)
    }
  }, [decorrido, estado, pausado, avisos])

  useEffect(() => {
    if (!fala) return
    const t = setTimeout(() => setFala(null), 12000)
    return () => clearTimeout(t)
  }, [fala])

  // tela sempre acesa durante a prova
  useEffect(() => {
    const precisa = estado && !pausado && !acabou
    const pedir = async () => {
      try { if (precisa && !wake.current && navigator.wakeLock) wake.current = await navigator.wakeLock.request('screen') } catch { /* sem suporte */ }
    }
    if (precisa) pedir()
    else if (wake.current) { wake.current.release?.(); wake.current = null }
    const vis = () => { if (document.visibilityState === 'visible' && precisa) { wake.current = null; pedir() } }
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [estado, pausado, acabou])

  useEffect(() => {
    const f = () => setTelaCheia(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])

  function comecar() {
    const total = livre ? Math.max(30, Math.min(600, Math.round((Number(livreMin) || 150) / 15) * 15)) : DIAS[dia].minutos
    if (voz) falar('Atenção. A prova vai começar.')
    setEstado({
      nome: livre ? `Treino de ${duracaoFalada(total)}` : `ENEM — ${DIAS[dia].nome}`,
      total, oficial: !livre, som: true, voz,
      comecouEm: Date.now() + (voz ? 2000 : 300), pausadoMs: 0, pausadoDesde: null, pausas: 0, entregueEm: null, falados: [],
    })
    setTimeout(() => caixa.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const pausar = () => {
    setEstado((e) => (e.pausadoDesde ? { ...e, pausadoMs: e.pausadoMs + (Date.now() - e.pausadoDesde), pausadoDesde: null } : { ...e, pausadoDesde: Date.now(), pausas: e.pausas + 1 }))
    window.speechSynthesis?.cancel()
  }
  const entregar = () => {
    if (!confirm('Entregar a prova agora?')) return
    setEstado((e) => ({ ...e, entregueEm: e.pausadoDesde ?? Date.now() }))
    window.speechSynthesis?.cancel()
  }
  const sair = () => {
    if (!acabou && !confirm('Recomeçar esta prova do zero? O que foi feito até agora será apagado.')) return
    if (document.fullscreenElement) document.exitFullscreen?.()
    window.speechSynthesis?.cancel()
    setEstado(null)
    setFala(null)
  }
  const alternarTelaCheia = () => (document.fullscreenElement ? document.exitFullscreen?.() : caixa.current?.requestFullscreen?.().catch(() => {}))


  const abas = (
    <div className="sp-modos">
      {[['dia1', '1º dia', 'Linguagens, Humanas e Redação'], ['dia2', '2º dia', 'Natureza e Matemática'], ['treino', 'Treino', 'Você escolhe o tempo']].map(([k, nome, desc]) => {
        const p = provas[k]
        const d = decorridoDe(p, agora)
        const fim = p && (p.entregueEm || d >= p.total)
        const situacao = !p
          ? (k === 'treino' ? 'começa às 13h30' : `${duracaoFalada(DIAS[k].minutos)} · 13h30 às ${hora(INICIO + DIAS[k].minutos)}`)
          : fim ? 'encerrada' : p.pausadoDesde ? `⏸ pausada no horário das ${hora(INICIO + Math.floor(d / 30) * 30)}` : '● em andamento'
        return (
          <button key={k} className={modo === k ? 'sp-modo ativo' : 'sp-modo'} onClick={() => irPara(k)}>
            <strong>{nome}</strong>
            <span>{desc}</span>
            <b className={p && !fim ? (p.pausadoDesde ? 'sp-st-pausa' : 'sp-st-rodando') : ''}>{situacao}</b>
          </button>
        )
      })}
    </div>
  )

  // ---------------- preparação ----------------
  if (!estado) {
    const total = livre ? Number(livreMin) || 0 : DIAS[dia].minutos
    return (
      <section className="secao">
        <div className="comunidade-topo">
          <div>
            <h2 style={{ margin: 0 }}>Simulador do ENEM</h2>
            <p className="suave pequeno" style={{ margin: '2px 0 0' }}>Igual à sala de prova: sem relógio, só o quadro do aplicador, que vai riscando os horários.</p>
          </div>
        </div>

        {abas}

        <div className="cartao">
          {livre && (
            <label className="sp-linha">
              Duração (minutos, de 15 em 15)
              <input type="number" min="30" max="600" step="15" value={livreMin} onChange={(e) => setLivreMin(e.target.value)} />
              <span className="suave pequeno">Ritmo do ENEM: 3 minutos por questão. 45 questões = 2h15.</span>
            </label>
          )}
          <p className="sp-explica">
            Na tela vai aparecer só o <b>quadro do aplicador</b>, com os horários de 30 em 30 minutos e quanto falta.
            Quando um horário passa, ele é <b>riscado</b>, como o aplicador faz. Não tem cronômetro: você se guia pelo quadro, como no dia.
            {total > 0 && <> Término: <b>{hora(INICIO + total)}</b>.</>}
          </p>
          <label className="caixa-marcar" style={{ marginTop: 0 }}>
            <input type="checkbox" checked={voz} onChange={(e) => setVoz(e.target.checked)} />
            Aplicador fala os avisos em voz alta (início, 2 horas, 30 e 15 minutos finais e término)
          </label>
          <div className="linha-botoes">
            <button className="botao fantasma" onClick={() => { tocar(false); if (voz) setTimeout(() => falar('Teste de som. Faltam quinze minutos para o término da prova.'), 900) }}>🔊 Testar som</button>
            <button className="botao primario" onClick={comecar}>▶ Começar {livre ? 'treino' : `o ${DIAS[dia].nome}`}</button>
          </div>
        </div>

        <div className="cartao sp-regras">
          <h3 className="sp-sub" style={{ marginTop: 0 }}>Regras do dia (horário de Brasília)</h3>
          <ul>
            <li>Portões abrem às 12h e fecham às 13h. A prova começa às 13h30.</li>
            <li>1º dia: 5h30 de prova (até 19h). 2º dia: 5h (até 18h30).</li>
            <li>Só pode sair depois de 2 horas de prova, sem o caderno de questões.</li>
            <li>O caderno só pode ser levado nos últimos 30 minutos.</li>
          </ul>
          <p className="suave pequeno" style={{ marginBottom: 0 }}>Para treinar de verdade: prova impressa, cartão-resposta, caneta preta e celular longe. Deixe o quadro aberto em outra tela ou na TV.</p>
        </div>
      </section>
    )
  }

  // ---------------- a sala de prova ----------------
  const atual = [...quadro].reverse().find((h) => decorrido >= h.em)
  const saida = INICIO + 120
  const comCaderno = INICIO + estado.total - 30

  return (
    <section className="secao">
      {!telaCheia && abas}
      {pausado && (
        <div className="aviso-info">Esta prova está pausada. Você pode continuar agora ou outro dia: ela fica guardada neste aparelho, do jeito que parou. Também dá para fazer a outra prova e voltar depois.</div>
      )}
      <div ref={caixa} className={`qa-sala ${telaCheia ? 'cheia' : ''}`}>
        <div className="qa-quadro">
          <div className="qa-cabecalho">
            <span className="qa-titulo">{estado.nome}</span>
            <span className="qa-info">
              <span>Início <b>13h30</b></span>
              <span>Término <b>{hora(INICIO + estado.total)}</b></span>
              {estado.oficial && <span>Saída a partir de <b>{hora(saida)}</b></span>}
              {estado.oficial && <span>Levar caderno a partir de <b>{hora(comCaderno)}</b></span>}
            </span>
          </div>

          <div className="qa-grade">
            {quadro.map((h) => {
              const riscado = decorrido >= estado.total || (atual && h.em < atual.em)
              const agoraAqui = !acabou && atual && h.em === atual.em
              const tom = h.resta <= 15 ? 'qa-t3' : h.resta <= 30 ? 'qa-t2' : h.resta <= 60 ? 'qa-t1' : ''
              return (
                <div key={h.em} className={`qa-cartao ${tom} ${riscado ? 'riscado' : ''} ${agoraAqui ? 'atual' : ''}`}>
                  <span className="qa-hora">{hora(h.horario)}</span>
                  <span className="qa-resta">{falta(h.resta)}</span>
                  {riscado && (
                    <svg className="qa-risco" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M6 52 C 30 38, 60 22, 94 8" />
                      <path d="M8 10 C 36 24, 62 38, 92 54" />
                    </svg>
                  )}
                </div>
              )
            })}
          </div>

          {acabou && (
            <div className="qa-fim">
              {estado.entregueEm && decorrido < estado.total - 0.01 ? `Prova entregue às ${hora(INICIO + Math.floor(decorrido))}` : 'TEMPO ESGOTADO'}
            </div>
          )}
          {pausado && <div className="qa-pausa">⏸ PROVA PAUSADA</div>}
        </div>

        {fala && (
          <div className="qa-fala" role="alert" onClick={() => setFala(null)}>
            <span>🗣️</span><span><b>Aplicador:</b> {fala.texto}</span>
          </div>
        )}

        <div className="qa-controles">
          {!acabou && <button className="botao" onClick={pausar}>{pausado ? '▶ Continuar' : '⏸ Pausar'}</button>}
          {!acabou && <button className="botao" onClick={entregar}>Entregar prova</button>}
          <button className="botao fantasma" onClick={alternarTelaCheia}>{telaCheia ? 'Sair da tela cheia' : '⛶ Tela cheia'}</button>
          <button className="botao fantasma" onClick={() => setEstado((e) => ({ ...e, voz: !e.voz, som: !e.voz }))}>{estado.voz ? '🔊 Som ligado' : '🔇 Sem som'}</button>
          <button className="botao fantasma" onClick={sair}>{acabou ? 'Fazer de novo' : 'Recomeçar do zero'}</button>
        </div>
      </div>

      {acabou && (
        <div className="cartao">
          <h2>Como foi</h2>
          <div className="resumo-cartoes">
            <div className="cartao mini" style={{ '--cor': 'var(--primaria)' }}>
              <span className="mini-titulo">Entregou às</span>
              <strong className="mini-numero">{hora(INICIO + Math.min(estado.total, Math.floor(decorrido)))}</strong>
              <span className="suave pequeno">{duracaoCurta(decorrido * 60)} de prova</span>
            </div>
            <div className="cartao mini" style={{ '--cor': estado.total - decorrido > 1 ? '#2f9e44' : '#e8590c' }}>
              <span className="mini-titulo">Sobrou</span>
              <strong className="mini-numero">{duracaoCurta((estado.total - decorrido) * 60)}</strong>
              <span className="suave pequeno">{estado.total - decorrido > 1 ? 'deu tempo de revisar?' : 'usou o tempo todo'}</span>
            </div>
            <div className="cartao mini" style={{ '--cor': estado.pausas ? '#e67700' : '#2f9e44' }}>
              <span className="mini-titulo">Pausas</span>
              <strong className="mini-numero">{estado.pausas}</strong>
              <span className="suave pequeno">{estado.pausas ? `${duracaoCurta(estado.pausadoMs / 1000)} parado` : 'como no dia da prova 👏'}</span>
            </div>
          </div>
          <p className="suave pequeno" style={{ marginBottom: 0 }}>Agora corrija e lance os acertos na aba <b>Simulados</b>. As erradas vão para o caderno de erros.</p>
        </div>
      )}
    </section>
  )
}
