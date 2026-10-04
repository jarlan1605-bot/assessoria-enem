import { useEffect, useState } from 'react'

// Faixa "Faltam X dias para o ENEM". Cada pessoa pode esconder ou mostrar.
export default function Contagem({ config, visivel, onAlterar }) {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  if (!config?.data_enem_1) return null
  const dia1 = new Date(config.data_enem_1)
  const dia2 = config.data_enem_2 ? new Date(config.data_enem_2) : null
  const fim = (dia2 || dia1).getTime() + 6 * 3600000
  if (agora > fim) return null // a prova já passou

  if (!visivel) {
    return (
      <button className="contagem-mostrar" onClick={() => onAlterar(true)}>
        ⏳ Mostrar contagem do ENEM
      </button>
    )
  }

  const meiaNoite = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const hoje = meiaNoite(new Date(agora))
  const alvo = hoje <= meiaNoite(dia1) ? dia1 : dia2
  const dias = Math.round((meiaNoite(alvo) - hoje) / 86400000)
  const dataCurta = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  let titulo
  if (dias === 0) titulo = alvo === dia1 ? 'Hoje é o 1º dia do ENEM. Boa prova! 💚' : 'Hoje é o 2º dia do ENEM. Vai com tudo! 💚'
  else if (dias === 1) titulo = `Amanhã é o ${alvo === dia1 ? '1º' : '2º'} dia do ENEM`
  else titulo = alvo === dia1 ? `Faltam ${dias} dias para o ENEM` : `Faltam ${dias} dias para o 2º dia do ENEM`

  return (
    <div className="contagem" role="status">
      <span className="contagem-numero" aria-hidden="true">{dias > 1 ? dias : '🎯'}</span>
      <div className="contagem-texto">
        <strong>{titulo}</strong>
        <span className="suave pequeno">
          1º dia {dataCurta(dia1)}{dia2 && ` · 2º dia ${dataCurta(dia2)}`} · cada dia de estudo conta, no seu ritmo.
        </span>
      </div>
      <button className="botao fantasma pequeno" onClick={() => onAlterar(false)} title="Esconder a contagem (você pode mostrar de novo quando quiser)">
        Ocultar
      </button>
    </div>
  )
}
