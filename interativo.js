// Camada de interatividade do site inteiro (página de vendas e área interna).
// Só acrescenta movimento: não muda nenhum botão, comando ou posição. Sem bibliotecas.
const CALMO = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const TOQUE = window.matchMedia('(hover: none)').matches

// Aparecem conforme a página rola (só na página de vendas)
const SURGE = [
  '.lp-cabeca', '.as-cabeca', '.lp-socio', '.lp-mentor', '.lp-foto', '.lp-plano', '.lp-pais-item', '.lp-evo-cartao', '.lp-msg',
  '.lp-numeros-faixa > div', '.lp-recursos > *', '.lp-passos > *', '.lp-faq details', '.lp-interesse-caixa', '.lp-final', '.lp-escassez',
  '.as-card', '.as-chamada', '.as-mini-card', '.as-tempo li', '.as-faq details', '.as-rumo', '.as-destaque', '.as-resumo', '.as-final',
  '.insc-assessor',
].join(',')

// Inclinam em 3D seguindo o mouse (nenhum deles abre janela por dentro)
const INCLINA = [
  '.lp-socio', '.lp-mentor', '.lp-foto', '.lp-plano', '.lp-pais-item', '.lp-evo-cartao', '.lp-msg', '.lp-numeros-faixa > div',
  '.lp-recursos > *', '.lp-passos > *', '.as-card', '.as-chamada', '.as-mini-card', '.bf-oferta', '.insc-assessor',
  '.mini-numero', '.resumo-cartoes > *', '.login-moldura',
].join(',')

const IMA = '.lp-botao, .as-botao, .lp-zap-fixo'

function iniciar() {
  if (CALMO) return
  const raiz = document.documentElement
  raiz.classList.add('vivo')

  // ---------- 1. Surgir ao rolar ----------
  if ('IntersectionObserver' in window) {
    const olho = new IntersectionObserver((itens) => {
      for (const it of itens) {
        if (!it.isIntersecting) continue
        const el = it.target
        olho.unobserve(el)
        el.classList.add('rv-in')
        setTimeout(() => el.classList.remove('rv', 'rv-in'), 1400) // devolve as transições originais
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })

    let marcado = false
    const marcar = () => {
      marcado = false
      document.querySelectorAll(SURGE).forEach((el) => {
        if (el.dataset.rv) return
        el.dataset.rv = '1'
        const irmaos = el.parentElement ? [...el.parentElement.children].filter((c) => c.dataset.rv) : []
        el.style.setProperty('--rv-atraso', `${Math.min(irmaos.indexOf(el), 6) * 80}ms`)
        el.classList.add('rv')
        olho.observe(el)
      })
    }
    const pedir = () => { if (!marcado) { marcado = true; requestAnimationFrame(marcar) } }
    new MutationObserver(pedir).observe(document.body, { childList: true, subtree: true })
    pedir()
  }

  // ---------- 2. Barra de progresso da leitura + luz que segue o mouse ----------
  const barra = document.createElement('div')
  barra.className = 'vivo-barra'
  const luz = document.createElement('div')
  luz.className = 'vivo-luz'
  document.body.append(barra, luz)
  const naVitrine = () => !!document.querySelector('.lp, .as')
  let rolando = false
  const rolar = () => {
    rolando = false
    const total = raiz.scrollHeight - innerHeight
    barra.style.transform = `scaleX(${total > 0 ? Math.min(scrollY / total, 1) : 0})`
    barra.style.opacity = naVitrine() ? 1 : 0
  }
  addEventListener('scroll', () => { if (!rolando) { rolando = true; requestAnimationFrame(rolar) } }, { passive: true })
  rolar()

  if (TOQUE) return

  // ---------- 3. Inclinação 3D, botões "ímã" e luz ----------
  let atual = null
  let ima = null
  let quadro = 0
  let ev = null
  const soltar = (el) => { el.classList.remove('tilt'); el.style.removeProperty('--tx'); el.style.removeProperty('--ty') }
  const passo = () => {
    quadro = 0
    const e = ev
    luz.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
    luz.style.opacity = naVitrine() ? 1 : 0.55

    const alvo = e.target.closest?.(INCLINA) || null
    if (alvo !== atual) { if (atual) soltar(atual); atual = alvo }
    if (alvo) {
      const r = alvo.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      const forca = Math.max(4, Math.min(14, 2600 / Math.max(r.width, r.height))) // cartão grande inclina menos
      alvo.style.setProperty('--tx', (x * forca).toFixed(2))
      alvo.style.setProperty('--ty', (-y * forca).toFixed(2))
      alvo.classList.add('tilt')
    }

    const botao = e.target.closest?.(IMA) || null
    if (botao !== ima) { if (ima) ima.style.translate = ''; ima = botao }
    if (botao) {
      const r = botao.getBoundingClientRect()
      botao.style.translate = `${((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1)}px`
    }
  }
  addEventListener('pointermove', (e) => { ev = e; if (!quadro) quadro = requestAnimationFrame(passo) }, { passive: true })
  document.addEventListener('pointerleave', () => { if (atual) soltar(atual); if (ima) ima.style.translate = ''; atual = ima = null; luz.style.opacity = 0 })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar)
else iniciar()
