// Gráfico de linhas simples, sem bibliotecas
import { useEffect, useRef, useState } from 'react'

const A = 220
const M = { cima: 14, dir: 16, baixo: 30, esq: 40 }

export default function Grafico({ pontos, series, maximo }) {
  // O desenho acompanha a largura real, para as letras não ficarem minúsculas no celular
  const caixa = useRef(null)
  const [L, setL] = useState(560)
  useEffect(() => {
    if (!caixa.current) return
    const obs = new ResizeObserver(([e]) => setL(Math.max(260, Math.round(e.contentRect.width))))
    obs.observe(caixa.current)
    return () => obs.disconnect()
  }, [])

  const comDados = pontos.filter((p) => series.some((s) => p[s.chave] !== null))
  if (comDados.length < 2) {
    return <p className="suave pequeno" ref={caixa}>O gráfico aparece a partir do 2º simulado.</p>
  }

  const larg = L - M.esq - M.dir
  const alt = A - M.cima - M.baixo
  const x = (i) => M.esq + (comDados.length === 1 ? larg / 2 : (i / (comDados.length - 1)) * larg)
  const y = (v) => M.cima + alt - (v / maximo) * alt
  const linhasGrade = maximo === 45 ? [0, 15, 30, 45] : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maximo))
  const passoRotulo = Math.ceil(comDados.length / Math.max(3, Math.floor(L / 80)))

  return (
    <div className="grafico" ref={caixa}>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Gráfico de evolução">
        {linhasGrade.map((v) => (
          <g key={v}>
            <line x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)} className="grade" />
            <text x={M.esq - 8} y={y(v)} className="rotulo" textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}
        {comDados.map((p, i) =>
          i % passoRotulo === 0 || i === comDados.length - 1 ? (
            <text key={p.id} x={x(i)} y={A - 8} className="rotulo" textAnchor="middle">
              {p.data.slice(8, 10)}/{p.data.slice(5, 7)}
            </text>
          ) : null
        )}
        {series.map((s) => {
          // Quebra a linha onde a área não foi feita
          const trechos = []
          let atual = []
          comDados.forEach((p, i) => {
            if (p[s.chave] === null) {
              if (atual.length) trechos.push(atual)
              atual = []
            } else atual.push(`${x(i)},${y(p[s.chave])}`)
          })
          if (atual.length) trechos.push(atual)
          return (
            <g key={s.chave}>
              {trechos.map((t, k) => (
                <polyline key={k} points={t.join(' ')} fill="none" stroke={s.cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {comDados.map((p, i) =>
                p[s.chave] === null ? null : (
                  <circle key={p.id} cx={x(i)} cy={y(p[s.chave])} r="4" fill={s.cor} className="ponto">
                    <title>{`${s.nome}: ${p[s.chave]}${p.nome ? ` — ${p.nome}` : ''}`}</title>
                  </circle>
                )
              )}
            </g>
          )
        })}
      </svg>
      {series.length > 1 && (
        <div className="legenda">
          {series.map((s) => (
            <span key={s.chave}>
              <i style={{ background: s.cor }} /> {s.nome}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
