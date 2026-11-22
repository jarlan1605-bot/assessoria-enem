// "Estudar hoje": missões do dia, ofensiva, conquistas, desempenho, confete e compartilhar.
// Os números vêm do banco (gamificacao.sql); aqui só montamos a tela.
import { supabase } from './supabase'
import { checarXp } from './xp'

export const primeiroNome = (n) => (n || '').trim().split(/\s+/)[0] || 'você'

export const minutosTexto = (m) => {
  m = Math.round(m || 0)
  const h = Math.floor(m / 60)
  const r = m % 60
  return h ? `${h}h${r ? String(r).padStart(2, '0') : ''}` : `${r} min`
}

export function saudacao(d = new Date()) {
  const h = Number(d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export const dataPorExtenso = (d = new Date()) => {
  const t = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Monta a lista de missões a partir do resumo do dia (mesma regra da função fechar_dia do banco)
export function montarMissoes(r) {
  if (!r) return []
  const blocos = (r.blocos || []).map((b) => ({
    id: 'bloco:' + b.id,
    horarioId: b.id,
    tipo: 'bloco',
    titulo: b.conteudo ? `${b.materia} — ${b.conteudo}` : b.materia,
    detalhe: `${b.inicio}–${b.fim} · ${minutosTexto(b.minutos)}`,
    materia: b.materia,
    feita: b.status === 'feito',
    status: b.status,
  }))
  return [
    ...blocos,
    { id: 'questoes', tipo: 'questoes', titulo: `${r.meta_questoes} questões`, detalhe: `${Math.min(r.questoes, r.meta_questoes)} de ${r.meta_questoes} hoje`, feita: r.questoes >= r.meta_questoes, pct: r.questoes / r.meta_questoes },
    { id: 'foco', tipo: 'foco', titulo: `${minutosTexto(r.meta_foco)} de foco`, detalhe: `${minutosTexto(Math.min(r.foco_min, r.meta_foco))} de ${minutosTexto(r.meta_foco)}`, feita: r.foco_min >= r.meta_foco, pct: r.foco_min / r.meta_foco },
    { id: 'revisao', tipo: 'revisao', titulo: 'Revisar 5 erros do caderno', detalhe: `${Math.min(r.revisoes, 5)} de 5 revisados`, feita: r.revisoes >= 5, pct: r.revisoes / 5 },
  ]
}

// Catálogo de conquistas. As regras (chave e alvo) são as mesmas da função atualizar_conquistas do banco.
export const CONQUISTAS = [
  { codigo: 'q1', icone: '🎯', nome: 'Primeira questão', chave: 'questoes', alvo: 1, falta: (n) => 'Responda a sua 1ª questão' },
  { codigo: 'q100', icone: '💯', nome: 'Centena', chave: 'questoes', alvo: 100, falta: (n) => `Faltam ${n} questões` },
  { codigo: 'q500', icone: '🚀', nome: 'Imparável', chave: 'questoes', alvo: 500, falta: (n) => `Faltam ${n} questões` },
  { codigo: 'q1000', icone: '🏔️', nome: 'Mil questões', chave: 'questoes', alvo: 1000, falta: (n) => `Faltam ${n} questões` },
  { codigo: 'acertos100', icone: '🧠', nome: 'Cabeça boa', chave: 'acertos', alvo: 100, falta: (n) => `Faltam ${n} acertos` },
  { codigo: 'seq7', icone: '🔥', nome: 'Uma semana em chamas', chave: 'recorde', alvo: 7, falta: (n) => `Faltam ${n} dias seguidos` },
  { codigo: 'seq30', icone: '☄️', nome: '30 dias seguidos', chave: 'recorde', alvo: 30, falta: (n) => `Faltam ${n} dias seguidos` },
  { codigo: 'seq100', icone: '🌋', nome: '100 dias seguidos', chave: 'recorde', alvo: 100, falta: (n) => `Faltam ${n} dias seguidos` },
  { codigo: 'sim1', icone: '🏁', nome: 'Estreia', chave: 'simulados', alvo: 1, falta: () => 'Entregue o seu 1º simulado' },
  { codigo: 'diaprova', icone: '🏆', nome: 'Dia de prova', chave: 'dia_prova', alvo: 1, falta: () => 'Faça um dia inteiro de simulado' },
  { codigo: 'foco10h', icone: '⏳', nome: '10h de foco', chave: 'foco_min', alvo: 600, falta: (n) => `Faltam ${minutosTexto(n)} de foco` },
  { codigo: 'foco50h', icone: '🧘', nome: '50h de foco', chave: 'foco_min', alvo: 3000, falta: (n) => `Faltam ${minutosTexto(n)} de foco` },
  { codigo: 'semana', icone: '🌟', nome: 'Semana perfeita', chave: 'semana_perfeita', alvo: 1, falta: () => 'Todas as missões por 7 dias seguidos' },
  { codigo: 'lista80', icone: '🎓', nome: 'Lista de craque', chave: 'lista80', alvo: 1, falta: () => '80% de acerto numa lista (5+ questões)' },
  { codigo: 'dia1', icone: '✅', nome: 'Disciplina', chave: 'dias_completos', alvo: 1, falta: () => 'Cumpra todo o horário de um dia' },
  { codigo: 'revisor', icone: '📕', nome: 'Revisor', chave: 'revisoes', alvo: 10, falta: (n) => `Faltam ${n} revisões` },
  { codigo: 'redacao1', icone: '✍️', nome: 'Escritor(a)', chave: 'redacoes', alvo: 1, falta: () => 'Envie a sua 1ª redação' },
  { codigo: 'nivel5', icone: '⭐', nome: 'Nível 5', chave: 'nivel', alvo: 5, falta: (n) => `Faltam ${n} níveis` },
]
export const conquistaPorCodigo = (c) => CONQUISTAS.find((x) => x.codigo === c)

export function progressoConquista(c, stats = {}) {
  const v = Number(stats[c.chave] || 0)
  return { valor: v, pct: Math.min(100, Math.round((v / c.alvo) * 100)), falta: c.falta(Math.max(0, c.alvo - v)) }
}

// Avisa a tela de XP para mostrar conquistas novas (XpNotificacoes escuta este evento)
export function avisarConquistas(codigos = []) {
  for (const c of codigos) {
    const k = conquistaPorCodigo(c)
    if (k) try { window.dispatchEvent(new CustomEvent('conquista:nova', { detail: k })) } catch { /* ok */ }
  }
}

// Depois de qualquer ação do aluno: confere missões (bônus), conquistas e o XP
export async function conferirTudo(alunoId) {
  const [fim, conq] = await Promise.all([
    supabase.rpc('fechar_dia'),
    supabase.rpc('atualizar_conquistas', { p_aluno: alunoId }),
  ])
  if (conq.data?.novas?.length) avisarConquistas(conq.data.novas)
  checarXp()
  return { fim: fim.data || null, conquistas: conq.data || null }
}

// Fortes e fracas: matérias com pelo menos 3 questões, ordenadas pela % de acerto
export function fortesEFracas(linhas = []) {
  const l = linhas.filter((x) => x.total >= 3).map((x) => ({ ...x, pct: Math.round((x.acertos / x.total) * 100) }))
  const ord = [...l].sort((a, b) => b.pct - a.pct || b.total - a.total)
  const fortes = ord.slice(0, 3)
  const fracas = [...l].sort((a, b) => a.pct - b.pct || b.total - a.total).filter((x) => !fortes.includes(x)).slice(0, 3)
  return { fortes, fracas }
}

// Confete leve (canvas, sem biblioteca). Respeita "reduzir movimento".
export function soltarConfete() {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const c = document.createElement('canvas')
  c.className = 'confete'
  c.width = window.innerWidth
  c.height = window.innerHeight
  document.body.appendChild(c)
  const ctx = c.getContext('2d')
  const cores = ['#d6f36b', '#1f5f4a', '#f2b134', '#f7c6b7', '#0f3a2c']
  const p = Array.from({ length: 140 }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * 120, y: c.height * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    r: Math.random() * 6 + 4, cor: cores[Math.floor(Math.random() * cores.length)], g: Math.random() * Math.PI,
  }))
  const ini = performance.now()
  const passo = (t) => {
    ctx.clearRect(0, 0, c.width, c.height)
    for (const q of p) {
      q.vy += 0.35; q.vx *= 0.99; q.x += q.vx; q.y += q.vy; q.g += 0.2
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.g); ctx.fillStyle = q.cor
      ctx.fillRect(-q.r / 2, -q.r / 4, q.r, q.r / 2); ctx.restore()
    }
    if (t - ini < 2600) requestAnimationFrame(passo)
    else c.remove()
  }
  requestAnimationFrame(passo)
}

// Compartilhar uma imagem: no celular abre o "compartilhar" (story); se não der, baixa o arquivo
export async function compartilharImagem(blob, nomeArquivo, texto = '') {
  const arquivo = new File([blob], nomeArquivo, { type: 'image/png' })
  try {
    if (navigator.canShare?.({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], text: texto })
      return 'compartilhado'
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelado'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'baixado'
}
