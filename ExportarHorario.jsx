import { useEffect, useMemo, useRef, useState } from 'react'
import { DIAS, NOME_SITE } from './constants'

const DIAS_COMPLETOS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
const hhmm = (t) => (t || '').slice(0, 5)
const minutos = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number)
  return h * 60 + m
}
const duracao = (min) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m}min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
const primeiroNome = (nome) => (nome || '').trim().split(/\s+/)[0] || ''

// Texto pronto para colar no WhatsApp (*negrito* e _itálico_ do próprio WhatsApp)
export function textoDoHorario({ nome, blocos, contaEstudo, mesNome = '', observacoes = '' }) {
  const linhas = [`🗓️ *HORÁRIO DE ESTUDOS${mesNome ? ` — ${mesNome.toUpperCase()}` : ''}*`, `👤 *${(nome || 'Aluno').trim()}*`, '']
  const livres = []
  let total = 0
  DIAS.forEach((_, i) => {
    const doDia = blocos.filter((b) => b.dia === i).sort((a, b) => minutos(a.inicio) - minutos(b.inicio))
    if (!doDia.length) {
      livres.push(DIAS_COMPLETOS[i])
      return
    }
    const estudo = doDia.filter(contaEstudo).reduce((s, b) => s + minutos(b.fim) - minutos(b.inicio), 0)
    total += estudo
    linhas.push(`📌 *${DIAS_COMPLETOS[i].toUpperCase()}*${estudo ? `  _(${duracao(estudo)} de estudo)_` : ''}`)
    for (const b of doDia) {
      const conteudo = (b.conteudo || '').trim()
      linhas.push(`▫️ ${hhmm(b.inicio)}–${hhmm(b.fim)} · *${b.materia}*${conteudo ? ` — ${conteudo}` : ''}`)
    }
    linhas.push('')
  })
  if (livres.length) linhas.push(`🌿 *Livre:* ${livres.join(', ')}`, '')
  if (total) linhas.push(`⏱️ *Total:* ${duracao(total)} de estudo na semana`)
  if (observacoes.trim()) linhas.push('', '📝 *Observações:*', observacoes.trim(), '')
  linhas.push(`✅ Marque o check-in de cada bloco no site: ${window.location.origin}`)
  linhas.push('', `_${NOME_SITE}_`)
  return linhas.join('\n')
}

// ---------- Imagem (PNG) do horário, desenhada no canvas ----------
const FONTE = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Arial, sans-serif'

function quebrar(ctx, texto, largura) {
  const palavras = (texto || '').split(/\s+/).filter(Boolean)
  const linhas = []
  let atual = ''
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p
    if (ctx.measureText(tentativa).width <= largura || !atual) atual = tentativa
    else {
      linhas.push(atual)
      atual = p
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

function retangulo(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function misturar(hex, alfa) {
  const n = parseInt((hex || '#868e96').replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const m = (c) => Math.round(c * alfa + 255 * (1 - alfa))
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`
}

function escurecer(hex, f = 0.72) {
  const n = parseInt((hex || '#868e96').replace('#', ''), 16)
  const c = (v) => Math.round(v * f)
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`
}

export async function imagemDoHorario({ nome, blocos, corDe, contaEstudo, mesNome = '' }) {
  try { await document.fonts?.ready } catch { /* sem fontes */ }
  const L = 1080
  const M = 56 // margem
  const W = L - 2 * M
  const medir = document.createElement('canvas').getContext('2d')

  // 1ª passada: mede a altura de cada parte
  const dias = DIAS.map((_, i) => blocos.filter((b) => b.dia === i).sort((a, b) => minutos(a.inicio) - minutos(b.inicio)))
  const layout = []
  let y = 0
  const cabecalho = 230
  y += cabecalho + 36
  let total = 0
  dias.forEach((doDia, i) => {
    if (!doDia.length) return
    const estudo = doDia.filter(contaEstudo).reduce((s, b) => s + minutos(b.fim) - minutos(b.inicio), 0)
    total += estudo
    const linhasBloco = doDia.map((b) => {
      medir.font = `500 28px ${FONTE}`
      const conteudo = quebrar(medir, (b.conteudo || '').trim(), W - 250)
      const h = Math.max(78, 26 + 36 + conteudo.length * 36 + (conteudo.length ? 4 : -10))
      return { b, conteudo, h }
    })
    const alturaDia = 64 + linhasBloco.reduce((s, x) => s + x.h + 12, 0)
    layout.push({ i, y, estudo, linhasBloco, alturaDia })
    y += alturaDia + 22
  })
  const livres = dias.map((d, i) => (d.length ? null : DIAS_COMPLETOS[i])).filter(Boolean)
  const yLivres = y
  if (livres.length) y += 76
  const yRodape = y + 10
  const H = yRodape + 90

  // 2ª passada: desenha (com o dobro de resolução para ficar nítido)
  const esc = 2
  const canvas = document.createElement('canvas')
  canvas.width = L * esc
  canvas.height = H * esc
  const ctx = canvas.getContext('2d')
  ctx.scale(esc, esc)
  ctx.fillStyle = '#f6f4ef'
  ctx.fillRect(0, 0, L, H)

  // cabeçalho
  retangulo(ctx, M, 40, W, cabecalho - 20, 30)
  ctx.fillStyle = '#1f5f4a'
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = `700 26px ${FONTE}`
  ctx.fillText(`HORÁRIO DE ESTUDOS${mesNome ? ` · ${mesNome.toUpperCase()}` : ''}`, M + 40, 98)
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 54px ${FONTE}`
  const nomeLinhas = quebrar(ctx, (nome || 'Aluno').trim(), W - 80).slice(0, 2)
  let yn = 160
  if (nomeLinhas.length === 2) {
    ctx.font = `800 44px ${FONTE}`
    yn = 148
  }
  nomeLinhas.forEach((t, k) => ctx.fillText(t, M + 40, yn + k * 50))
  ctx.font = `600 26px ${FONTE}`
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  const sub = `${NOME_SITE}${total ? ` · ${duracao(total)} de estudo na semana` : ''}`
  ctx.fillText(sub, M + 40, cabecalho + 2 - (nomeLinhas.length === 2 ? 0 : 6))

  // dias
  for (const d of layout) {
    let yy = d.y
    ctx.fillStyle = '#1d1b18'
    ctx.font = `800 34px ${FONTE}`
    ctx.fillText(DIAS_COMPLETOS[d.i], M + 4, yy + 40)
    if (d.estudo) {
      ctx.font = `700 26px ${FONTE}`
      ctx.fillStyle = '#6b665e'
      const t = `${duracao(d.estudo)} de estudo`
      ctx.fillText(t, M + W - ctx.measureText(t).width - 4, yy + 40)
    }
    yy += 64
    for (const { b, conteudo, h } of d.linhasBloco) {
      const cor = corDe(b.materia)
      retangulo(ctx, M, yy, W, h, 18)
      ctx.fillStyle = misturar(cor, 0.13)
      ctx.fill()
      ctx.save()
      retangulo(ctx, M, yy, W, h, 18)
      ctx.clip()
      ctx.fillStyle = cor
      ctx.fillRect(M, yy, 10, h)
      ctx.restore()
      ctx.fillStyle = '#4a4640'
      ctx.font = `700 27px ${FONTE}`
      ctx.fillText(`${hhmm(b.inicio)}–${hhmm(b.fim)}`, M + 32, yy + 46)
      ctx.fillStyle = escurecer(cor)
      ctx.font = `800 31px ${FONTE}`
      const mat = quebrar(ctx, b.materia, W - 260)[0]
      ctx.fillText(mat, M + 220, yy + 46)
      ctx.fillStyle = '#2b2925'
      ctx.font = `500 28px ${FONTE}`
      conteudo.forEach((t, k) => ctx.fillText(t, M + 220, yy + 46 + 38 + k * 36))
      yy += h + 12
    }
  }

  if (livres.length) {
    ctx.fillStyle = '#6b665e'
    ctx.font = `700 28px ${FONTE}`
    ctx.fillText(`Livre: ${livres.join(', ')}`, M + 4, yLivres + 40)
  }

  ctx.strokeStyle = '#e3ded3'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(M, yRodape)
  ctx.lineTo(M + W, yRodape)
  ctx.stroke()
  ctx.fillStyle = '#6b665e'
  ctx.font = `600 24px ${FONTE}`
  ctx.fillText('Marque o check-in de cada bloco no site da mentoria', M + 4, yRodape + 48)

  return new Promise((ok) => canvas.toBlob((b) => ok(b), 'image/png'))
}

// ---------- Janela de exportação ----------
export default function ExportarHorario({ nome, blocos, corDe, contaEstudo, mesNome = '', observacoes = '', onFechar }) {
  const texto = useMemo(() => textoDoHorario({ nome, blocos, contaEstudo, mesNome, observacoes }), [nome, blocos, contaEstudo, mesNome, observacoes])
  const [copiado, setCopiado] = useState(false)
  const [imagem, setImagem] = useState(null) // { blob, url }
  const [aviso, setAviso] = useState('')
  const ativo = useRef(true)

  useEffect(() => {
    ativo.current = true
    imagemDoHorario({ nome, blocos, corDe, contaEstudo, mesNome }).then((blob) => {
      if (ativo.current && blob) setImagem({ blob, url: URL.createObjectURL(blob) })
    })
    return () => { ativo.current = false }
  }, [nome, blocos, corDe, contaEstudo, mesNome])

  useEffect(() => () => imagem && URL.revokeObjectURL(imagem.url), [imagem])

  const nomeArquivo = `horario-${(nome || 'aluno').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}.png`
  const podeCompartilhar = imagem && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [new File([imagem.blob], nomeArquivo, { type: 'image/png' })] })

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setAviso('Não deu para copiar automaticamente. Selecione o texto e copie.')
    }
  }

  async function compartilharImagem() {
    try {
      await navigator.share({ files: [new File([imagem.blob], nomeArquivo, { type: 'image/png' })], title: `Horário — ${nome}`, text: `Horário de estudos — ${primeiroNome(nome)}` })
    } catch { /* cancelado */ }
  }

  return (
    <div className="fundo-modal" onClick={onFechar}>
      <div className="cartao modal modal-exportar" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-topo">
          <h2>Enviar horário pelo WhatsApp</h2>
          <button className="botao fantasma pequeno" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <p className="suave pequeno">Mande como <b>texto</b> (o aluno lê direto na conversa) ou como <b>imagem</b> (fica salva na galeria).</p>

        <div className="exportar-grade">
          <div className="exportar-coluna">
            <strong>Texto</strong>
            <pre className="exportar-texto">{texto}</pre>
            <div className="linha-botoes" style={{ marginTop: 8 }}>
              <button className="botao fantasma" onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar texto'}</button>
              <a className="botao primario botao-whats" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
                Abrir no WhatsApp
              </a>
            </div>
          </div>
          <div className="exportar-coluna">
            <strong>Imagem</strong>
            <div className="exportar-imagem">
              {imagem ? <img src={imagem.url} alt={`Horário de ${nome}`} /> : <span className="suave pequeno">Gerando imagem…</span>}
            </div>
            <div className="linha-botoes" style={{ marginTop: 8 }}>
              {imagem && <a className="botao fantasma" href={imagem.url} download={nomeArquivo}>Baixar imagem</a>}
              {podeCompartilhar && <button className="botao primario botao-whats" onClick={compartilharImagem}>Compartilhar imagem</button>}
            </div>
            {imagem && !podeCompartilhar && <p className="suave pequeno" style={{ margin: '6px 0 0' }}>No computador: baixe a imagem e arraste para a conversa do WhatsApp Web.</p>}
          </div>
        </div>
        {aviso && <p className="erro pequeno">{aviso}</p>}
      </div>
    </div>
  )
}
