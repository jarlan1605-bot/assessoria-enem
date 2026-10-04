import { useEffect, useState } from 'react'

export default function Avatar({ src, nome, tamanho = 40 }) {
  const [falhou, setFalhou] = useState(!src)
  useEffect(() => setFalhou(!src), [src])

  const iniciais = (nome || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

  const estilo = { width: tamanho, height: tamanho, fontSize: tamanho * 0.38 }

  if (falhou) {
    return (
      <span className="avatar avatar-iniciais" style={estilo} aria-hidden="true">
        {iniciais}
      </span>
    )
  }
  return (
    <img
      className="avatar"
      style={estilo}
      src={src}
      alt={nome}
      onError={() => setFalhou(true)}
    />
  )
}
