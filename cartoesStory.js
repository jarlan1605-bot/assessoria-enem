// Cartões 1080×1920 para o story do Instagram, desenhados no canvas (como o ExportarHorario).
// Todo cartão leva a marca J&C e o @ no rodapé, discretos.
import { INSTAGRAM, NOME_SITE } from './constants'
import { minutosTexto, primeiroNome } from './estudo'

const L = 1080
const H = 1920
const COR = { creme: '#f7f2e8', papel: '#fffdf8', verde: '#1f5f4a', escuro: '#0f3a2c', lima: '#d6f36b', sol: '#f2b134', rosa: '#f7c6b7', tinta: '#14231d', suave: '#5d6a63' }
const TITULO = '"Bricolage Grotesque", "Plus Jakarta Sans", system-ui, sans-serif'
const ITALICO = '"Instrument Serif", Georgia, serif'
const TEXTO = '"Plus Jakarta Sans", system-ui, sans-serif'

async function prepararFontes() {
  try {
    await Promise.all([
      document.fonts?.load(`800 120px ${TITULO}`),
      document.fonts?.load(`italic 120px ${ITALICO}`),
      document.fonts?.load(`700 40px ${TEXTO}`),
    ])
    await document.fonts?.ready
  } catch { /* sem fontes: usa as do sistema */ }
}

function novoCanvas() {
  const c = document.createElement('canvas')
  c.width = L
  c.height = H
  return [c, c.getContext('2d')]
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

// Quebra o texto em linhas que cabem na largura
function linhas(ctx, texto, largura) {
  const palavras = String(texto).split(/\s+/)
  const out = []
  let atual = ''
  for (const p of palavras) {
    const t = atual ? atual + ' ' + p : p
    if (ctx.measureText(t).width > largura && atual) { out.push(atual); atual = p } else atual = t
  }
  if (atual) out.push(atual)
  return out
}

function fundo(ctx, escuro = false) {
  ctx.fillStyle = escuro ? COR.escuro : COR.creme
  ctx.fillRect(0, 0, L, H)
  // detalhes orgânicos
  ctx.globalAlpha = escuro ? 0.18 : 0.55
  ctx.fillStyle = COR.lima
  ctx.beginPath(); ctx.arc(L - 60, 230, 260, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = escuro ? COR.verde : COR.rosa
  ctx.beginPath(); ctx.arc(40, H - 360, 220, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
}

function topo(ctx, nome, kicker, escuro = false) {
  ctx.fillStyle = escuro ? COR.lima : COR.verde
  ctx.font = `800 34px ${TEXTO}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(kicker.toUpperCase(), 90, 210)
  ctx.fillStyle = escuro ? '#f2efe6' : COR.tinta
  ctx.font = `800 92px ${TITULO}`
  ctx.fillText(primeiroNome(nome), 90, 320)
}

function rodape(ctx, escuro = false) {
  ctx.fillStyle = escuro ? 'rgba(242,239,230,0.75)' : 'rgba(20,35,29,0.6)'
  ctx.font = `700 30px ${TEXTO}`
  ctx.textAlign = 'center'
  ctx.fillText(`${NOME_SITE}${INSTAGRAM ? '  ·  @' + INSTAGRAM : ''}`, L / 2, H - 90)
  ctx.textAlign = 'left'
}

function selo(ctx, x, y, texto, fundoCor, corTexto) {
  ctx.font = `800 36px ${TEXTO}`
  const w = ctx.measureText(texto).width + 56
  retangulo(ctx, x, y, w, 72, 36)
  ctx.fillStyle = fundoCor
  ctx.fill()
  ctx.fillStyle = corTexto
  ctx.fillText(texto, x + 28, y + 49)
  return w
}

function paraBlob(c) {
  return new Promise((ok) => c.toBlob((b) => ok(b), 'image/png'))
}

// 1) Dia concluído
export async function cartaoDia({ nome, feitas, total, focoMin, questoes, ofensiva, dataTexto }) {
  await prepararFontes()
  const [c, ctx] = novoCanvas()
  fundo(ctx)
  topo(ctx, nome, dataTexto || 'Hoje')
  ctx.fillStyle = COR.tinta
  ctx.font = `italic 120px ${ITALICO}`
  ctx.fillText(feitas >= total ? 'dia concluído' : 'dia de estudo', 86, 470)

  // cartão verde com as missões
  retangulo(ctx, 70, 560, L - 140, 520, 56)
  ctx.fillStyle = COR.escuro
  ctx.fill()
  ctx.fillStyle = COR.lima
  ctx.font = `800 230px ${TITULO}`
  ctx.fillText(`${feitas}/${total}`, 130, 830)
  ctx.fillStyle = '#f2efe6'
  ctx.font = `700 46px ${TEXTO}`
  ctx.fillText(feitas >= total ? 'Missões de hoje ✓' : 'missões de hoje', 136, 920)
  // barra
  retangulo(ctx, 136, 970, L - 272, 34, 17); ctx.fillStyle = 'rgba(242,239,230,0.15)'; ctx.fill()
  retangulo(ctx, 136, 970, Math.max(34, (L - 272) * Math.min(1, feitas / Math.max(1, total))), 34, 17); ctx.fillStyle = COR.lima; ctx.fill()

  // números
  const itens = [['⏱', minutosTexto(focoMin), 'de foco'], ['🧠', String(questoes), 'questões'], ['🔥', `${ofensiva}`, ofensiva === 1 ? 'dia seguido' : 'dias seguidos']]
  itens.forEach(([ic, v, t], i) => {
    const y = 1160 + i * 190
    retangulo(ctx, 70, y, L - 140, 160, 40)
    ctx.fillStyle = i === 2 ? COR.sol : COR.papel
    ctx.fill()
    ctx.font = `64px ${TEXTO}`
    ctx.fillStyle = COR.tinta
    ctx.fillText(ic, 120, y + 104)
    ctx.font = `800 76px ${TITULO}`
    ctx.fillText(v, 230, y + 108)
    const w = ctx.measureText(v).width
    ctx.font = `600 40px ${TEXTO}`
    ctx.fillStyle = i === 2 ? '#3d2a00' : COR.suave
    ctx.fillText(t, 250 + w, y + 104)
  })
  rodape(ctx)
  return paraBlob(c)
}

// 2) Conquista desbloqueada
export async function cartaoConquista({ nome, conquista, dataTexto }) {
  await prepararFontes()
  const [c, ctx] = novoCanvas()
  fundo(ctx, true)
  topo(ctx, nome, 'Conquista desbloqueada', true)
  // medalha
  ctx.fillStyle = COR.lima
  ctx.beginPath(); ctx.arc(L / 2, 860, 300, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = COR.sol; ctx.lineWidth = 18
  ctx.beginPath(); ctx.arc(L / 2, 860, 330, 0, Math.PI * 2); ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = `280px ${TEXTO}`
  ctx.fillStyle = COR.tinta
  ctx.fillText(conquista.icone, L / 2, 960)
  ctx.fillStyle = '#f2efe6'
  ctx.font = `800 96px ${TITULO}`
  linhas(ctx, conquista.nome, L - 180).forEach((t, i) => ctx.fillText(t, L / 2, 1360 + i * 104))
  ctx.font = `italic 64px ${ITALICO}`
  ctx.fillStyle = COR.lima
  ctx.fillText(dataTexto || 'mais uma pra conta', L / 2, 1560)
  ctx.textAlign = 'left'
  rodape(ctx, true)
  return paraBlob(c)
}

// 3) Resultado de uma lista
export async function cartaoLista({ nome, titulo, acertos, total }) {
  await prepararFontes()
  const [c, ctx] = novoCanvas()
  fundo(ctx)
  topo(ctx, nome, 'Lista concluída')
  const pct = total ? Math.round((acertos / total) * 100) : 0
  // anel
  const cx = L / 2, cy = 820, r = 300
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#e6dece'; ctx.lineWidth = 64
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = COR.verde
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100); ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = COR.tinta
  ctx.font = `800 170px ${TITULO}`
  ctx.fillText(`${acertos}/${total}`, cx, cy + 40)
  ctx.font = `700 46px ${TEXTO}`
  ctx.fillStyle = COR.suave
  ctx.fillText(`${pct}% de acerto`, cx, cy + 120)
  ctx.fillStyle = COR.tinta
  ctx.font = `italic 84px ${ITALICO}`
  ctx.fillText('Acertei', cx, 1290)
  ctx.font = `800 80px ${TITULO}`
  ctx.fillText(`${acertos} de ${total} em`, cx, 1390)
  ctx.fillStyle = COR.verde
  linhas(ctx, titulo, L - 200).slice(0, 2).forEach((t, i) => ctx.fillText(t, cx, 1490 + i * 90))
  ctx.textAlign = 'left'
  rodape(ctx)
  return paraBlob(c)
}

// 4) Resumo da semana
export async function cartaoSemana({ nome, focoMin, questoes, dias, ofensiva, completos }) {
  await prepararFontes()
  const [c, ctx] = novoCanvas()
  fundo(ctx)
  topo(ctx, nome, 'Resumo da semana')
  ctx.fillStyle = COR.tinta
  ctx.font = `italic 110px ${ITALICO}`
  ctx.fillText('minha semana', 86, 460)
  // 7 dias
  const nomes = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
  const w = (L - 180) / 7
  nomes.forEach((n, i) => {
    const x = 90 + i * w + w / 2
    ctx.fillStyle = dias?.[i] ? COR.sol : '#e6dece'
    ctx.beginPath(); ctx.arc(x, 620, w / 2 - 14, 0, Math.PI * 2); ctx.fill()
    ctx.textAlign = 'center'
    ctx.font = `48px ${TEXTO}`
    ctx.fillStyle = COR.tinta
    ctx.fillText(dias?.[i] ? '🔥' : '·', x, 640)
    ctx.font = `800 34px ${TEXTO}`
    ctx.fillStyle = COR.suave
    ctx.fillText(n, x, 730)
    ctx.textAlign = 'left'
  })
  retangulo(ctx, 70, 820, L - 140, 760, 56)
  ctx.fillStyle = COR.escuro
  ctx.fill()
  const itens = [[minutosTexto(focoMin), 'de foco'], [String(questoes), 'questões resolvidas'], [String(completos), completos === 1 ? 'dia com todas as missões' : 'dias com todas as missões'], [`🔥 ${ofensiva}`, 'dias seguidos']]
  itens.forEach(([v, t], i) => {
    const y = 960 + i * 165
    ctx.fillStyle = i === 0 ? COR.lima : '#f2efe6'
    ctx.font = `800 96px ${TITULO}`
    ctx.fillText(v, 136, y)
    ctx.font = `600 40px ${TEXTO}`
    ctx.fillStyle = 'rgba(242,239,230,0.75)'
    ctx.fillText(t, 136, y + 54)
  })
  rodape(ctx)
  return paraBlob(c)
}
