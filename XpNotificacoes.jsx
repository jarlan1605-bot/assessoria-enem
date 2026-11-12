import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'
import { nivelDe, tituloDoNivel } from './xp'

const EMOJI = { questao: '🧠', checkin: '✅', dia: '🗓️', sequencia: '🔥', simulado: '🏁', revisao: '📕', redacao: '✍️', trilha: '🧭' }

// Chip de XP no topo + avisos "Parabéns, você ganhou X XP" (só para alunos)
export default function XpNotificacoes({ perfil, onAbrir }) {
  const [total, setTotal] = useState(null)
  const [avisos, setAvisos] = useState([])
  const desde = useRef(null)
  const chave = 'xpVisto:' + perfil.id

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('xp_eventos').select('xp').eq('aluno_id', perfil.id).range(0, 9999)
    const t = (data ?? []).reduce((s, e) => s + e.xp, 0)
    setTotal((antes) => {
      if (antes !== null && nivelDe(t) > nivelDe(antes)) {
        const n = nivelDe(t)
        mostrar({ id: 'nivel' + n, emoji: '⭐', titulo: `Subiu para o nível ${n}!`, texto: tituloDoNivel(n), xp: null, grande: true })
      }
      return t
    })
  }, [perfil.id])

  function mostrar(a) {
    setAvisos((l) => [...l.filter((x) => x.id !== a.id), a].slice(-4))
    setTimeout(() => setAvisos((l) => l.filter((x) => x.id !== a.id)), a.grande ? 6500 : 4500)
  }

  const checar = useCallback(async () => {
    if (!desde.current) return
    const { data } = await supabase.from('xp_eventos').select('id, tipo, descricao, xp, xp_anterior, atualizado_em')
      .eq('aluno_id', perfil.id).gt('atualizado_em', desde.current).order('atualizado_em').limit(20)
    if (!data?.length) return
    desde.current = data[data.length - 1].atualizado_em
    try { localStorage.setItem(chave, desde.current) } catch { /* ok */ }
    // junta vários pequenos (ex.: várias questões seguidas) num aviso só por tipo
    const porTipo = new Map()
    for (const e of data) {
      const ganho = e.xp - (e.xp_anterior || 0)
      if (ganho <= 0) continue
      const g = porTipo.get(e.tipo) || { xp: 0, n: 0, descricao: e.descricao }
      g.xp += ganho
      g.n += 1
      g.descricao = e.descricao
      porTipo.set(e.tipo, g)
    }
    for (const [tipo, g] of porTipo) {
      mostrar({ id: tipo + Date.now(), emoji: EMOJI[tipo] || '⚡', titulo: `Parabéns! +${g.xp} XP`, texto: g.n > 1 ? `${g.n} ações · ${g.descricao}` : g.descricao, xp: g.xp })
    }
    carregar()
  }, [perfil.id, chave, carregar])

  useEffect(() => {
    let salvo = null
    try { salvo = localStorage.getItem(chave) } catch { /* ok */ }
    desde.current = salvo || new Date().toISOString()
    carregar()
    checar()
    const t = setInterval(checar, 20000)
    const ouvir = () => setTimeout(checar, 700)
    window.addEventListener('xp:checar', ouvir)
    const foco = () => checar()
    window.addEventListener('focus', foco)
    return () => { clearInterval(t); window.removeEventListener('xp:checar', ouvir); window.removeEventListener('focus', foco) }
  }, [chave, carregar, checar])

  return (
    <>
      {total !== null && (
        <button className="xp-chip" onClick={onAbrir} title="Ver ranking">
          <span>⚡ {total.toLocaleString('pt-BR')} XP</span>
          <b>Nv {nivelDe(total)}</b>
        </button>
      )}
      {createPortal(<div className="xp-avisos" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={a.grande ? 'xp-aviso grande' : 'xp-aviso'} role="status">
            <span className="xp-aviso-emoji">{a.emoji}</span>
            <div>
              <strong>{a.titulo}</strong>
              {a.texto && <span>{a.texto}</span>}
            </div>
            {a.xp ? <span className="xp-aviso-bolha">+{a.xp}</span> : null}
          </div>
        ))}
      </div>, document.body)}
    </>
  )
}
