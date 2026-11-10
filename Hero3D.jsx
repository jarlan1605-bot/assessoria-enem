import { useEffect, useRef } from 'react'
import { NOME_MENTOR, NOME_SOCIA, FOTO_PERFIL, FOTO_SOCIA } from './constants'

// Palco 3D da entrada: fotos da dupla, anel "ENEM 2027" girando em volta e peças flutuando em profundidade.
// Só CSS 3D + um pouco de JS para seguir o mouse (nenhuma biblioteca).
const ANEL = 'ENEM 2027 ✦ ASSESSORIA J&C ✦ '.split('')
const CUBO = [['ENEM', 'frente'], ['LING', 'direita'], ['2027', 'tras'], ['MAT', 'esquerda'], ['NAT', 'cima'], ['HUM', 'baixo']]
const PECAS = [['📚', 1], ['✏️', 2], ['🧬', 3], ['📐', 4], ['🩺', 5], ['⭐', 6]]

export default function Hero3D() {
  const palco = useRef(null)

  useEffect(() => {
    const el = palco.current
    const area = el?.closest('.lp-hero')
    if (!el || !area || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let quadro = 0
    const mover = (e) => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(() => {
        const r = area.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width - 0.5
        const y = (e.clientY - r.top) / r.height - 0.5
        el.style.setProperty('--ry', `${(x * 26).toFixed(2)}deg`)
        el.style.setProperty('--rx', `${(-y * 18).toFixed(2)}deg`)
      })
    }
    const soltar = () => { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg') }
    area.addEventListener('pointermove', mover)
    area.addEventListener('pointerleave', soltar)
    return () => { cancelAnimationFrame(quadro); area.removeEventListener('pointermove', mover); area.removeEventListener('pointerleave', soltar) }
  }, [])

  return (
    <div className="h3" ref={palco}>
      <div className="h3-raios" aria-hidden="true" />
      <div className="h3-piso" aria-hidden="true" />
      <div className="h3-balanco">
        <div className="h3-cena">
          <figure className="h3-card h3-card-1">
            <img src={FOTO_PERFIL} alt={`${NOME_MENTOR}, mentor`} />
            <figcaption>🩺 {NOME_MENTOR} · Medicina UFRN</figcaption>
          </figure>
          <figure className="h3-card h3-card-2">
            <img src={FOTO_SOCIA} alt={`${NOME_SOCIA}, mentora`} />
            <figcaption>✨ {NOME_SOCIA.split(' ')[0]} · Medicina UFRN</figcaption>
          </figure>

          <div className="h3-anel-eixo" aria-hidden="true">
            <div className="h3-anel">
              {ANEL.map((l, i) => (
                <span key={i} style={{ '--a': `${(360 / ANEL.length) * i}deg` }}>{l}</span>
              ))}
            </div>
          </div>

          <div className="h3-cubo-pos" aria-hidden="true">
            <div className="h3-cubo">
              {CUBO.map(([t, lado]) => <span key={lado} className={`h3-face h3-${lado}`}>{t}</span>)}
            </div>
          </div>

          <div className="h3-gabarito" aria-hidden="true">
            {['A', 'B', 'C', 'D', 'E'].map((l) => <i key={l} className={l === 'C' ? 'ok' : ''}>{l}</i>)}
          </div>

          {PECAS.map(([e, n]) => <span key={n} className={`h3-peca h3-peca-${n}`} aria-hidden="true">{e}</span>)}
        </div>
      </div>
    </div>
  )
}
