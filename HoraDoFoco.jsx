import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_CHAVE } from './supabase'
import { checarXp } from './xp'

const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}
const horas = (min) => { const h = Math.floor(min / 60); const m = Math.round(min % 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min` }

// "Hora do foco": cronômetro de estudo no topo. O aluno liga e desliga; se fechar o site, para sozinho.
// O tempo e o XP são conferidos pelo banco (hora_do_foco.sql).
export default function HoraDoFoco({ demo = false }) {
  const [aberta, setAberta] = useState(null) // { id, inicio (ms no relógio do servidor) }
  const [minHoje, setMinHoje] = useState(0) // minutos de hoje já fechados (sem a sessão ligada)
  const [agora, setAgora] = useState(Date.now())
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const desvio = useRef(0) // relógio do servidor - relógio do aparelho
  const token = useRef(null)
  const sessao = useRef(null)
  sessao.current = aberta

  const carregar = useCallback(async () => {
    if (demo) return null
    const { data } = await supabase.rpc('estudo_hoje', { p_aluno: null })
    if (!data) return null
    desvio.current = new Date(data.agora).getTime() - Date.now()
    setMinHoje(data.minutos)
    return data
  }, [])

  // Ao abrir o site: se ficou um cronômetro ligado de antes (site fechado), ele para no último sinal
  useEffect(() => {
    if (demo) { setMinHoje(130); return }
    ;(async () => {
      const d = await carregar()
      if (d?.aberta) {
        await supabase.rpc('parar_estudo', { p_id: d.aberta.id, p_agora: false })
        carregar()
      }
    })()
    supabase.auth.getSession().then(({ data }) => { token.current = data.session?.access_token || null })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { token.current = s?.access_token || null })
    return () => data.subscription.unsubscribe()
  }, [carregar])

  // Ligado: relógio na tela, sinal a cada minuto e ao voltar para o site
  useEffect(() => {
    if (!aberta) return
    const tique = setInterval(() => setAgora(Date.now()), 1000)
    const sinal = async () => {
      if (demo) return
      const { data, error } = await supabase.rpc('sinal_estudo', { p_id: aberta.id })
      if (!error && data === false) { setAberta(null); setAviso('O cronômetro parou porque ficou muito tempo sem sinal.'); carregar() }
    }
    const pulso = setInterval(sinal, 60000)
    const voltou = () => { if (document.visibilityState === 'visible') sinal() }
    document.addEventListener('visibilitychange', voltou)
    // fechou o site: para na hora (sem esperar resposta)
    const fechou = () => {
      if (!sessao.current || !token.current) return
      try {
        fetch(`${SUPABASE_URL}/rest/v1/rpc/parar_estudo`, {
          method: 'POST', keepalive: true,
          headers: { apikey: SUPABASE_CHAVE, Authorization: `Bearer ${token.current}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_id: sessao.current.id, p_agora: true }),
        })
      } catch { /* o banco fecha no último sinal */ }
    }
    window.addEventListener('pagehide', fechou)
    return () => { clearInterval(tique); clearInterval(pulso); document.removeEventListener('visibilitychange', voltou); window.removeEventListener('pagehide', fechou) }
  }, [aberta, carregar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  async function alternar() {
    if (ocupado) return
    setOcupado(true)
    try {
      if (demo) { setAberta(aberta ? null : { id: 'demo', inicio: Date.now() - 2537000 }); setAgora(Date.now()); return }
      if (!aberta) {
        const { data, error } = await supabase.rpc('iniciar_estudo')
        if (error) { setAviso(error.message.includes('iniciar_estudo') ? 'A Hora do foco ainda não foi ativada no banco.' : 'Não foi possível ligar agora. Tente de novo.'); return }
        desvio.current = new Date(data.agora).getTime() - Date.now()
        setAberta({ id: data.id, inicio: new Date(data.inicio).getTime() })
        setAgora(Date.now())
        setAviso('Hora do foco ligada. Bons estudos! 📚')
      } else {
        const { data } = await supabase.rpc('parar_estudo', { p_id: aberta.id, p_agora: true })
        setAberta(null)
        if (data) {
          setMinHoje(data.minutos_hoje)
          setAviso(`Sessão salva: ${horas(data.minutos_sessao)} · hoje ${horas(data.minutos_hoje)}`)
        } else carregar()
        checarXp()
      }
    } finally { setOcupado(false) }
  }

  const decorrido = aberta ? agora + desvio.current - aberta.inicio : 0
  const totalHoje = minHoje + decorrido / 60000

  return (
    <div className="hora-foco">
      <button
        className={aberta ? 'hf-botao ligado' : 'hf-botao'}
        onClick={alternar}
        disabled={ocupado}
        aria-pressed={!!aberta}
        aria-label={aberta ? `Hora do foco ligada: ${fmt(decorrido)}. Toque para parar.` : `Ligar a Hora do foco. Hoje: ${horas(minHoje)}.`}
        title={aberta ? 'Toque para parar' : 'Toque para começar a contar seu estudo'}
      >
        <span className="hf-icone" aria-hidden="true">{aberta ? <i className="hf-ponto" /> : '⏱'}</span>
        {aberta ? (
          <span className="hf-tempo">{fmt(decorrido)}</span>
        ) : (
          <span className="hf-texto"><b className="hf-longo">Hora do foco</b><b className="hf-curto">Foco</b><small>{horas(totalHoje)} hoje</small></span>
        )}
      </button>
      {aviso && <span className="hf-aviso" role="status">{aviso}</span>}
    </div>
  )
}
