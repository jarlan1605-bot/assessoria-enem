// XP e níveis (o XP é dado pelo banco: arquivo xp.sql)
export const xpDoNivel = (n) => 50 * n * (n - 1) // nível 2 = 100 XP, 3 = 300, 4 = 600, 5 = 1000...
export const nivelDe = (xp) => Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * Math.max(0, xp))) / 2))

const TITULOS = ['Calouro(a)', 'Focado(a)', 'Estudante raiz', 'Maratonista', 'Gabaritador(a)', 'Mestre do ENEM', 'Lenda da J&C', 'Rumo à aprovação 🩺']
export const tituloDoNivel = (n) => TITULOS[Math.min(n, TITULOS.length) - 1]

export function progressoNivel(xp) {
  const n = nivelDe(xp)
  const ini = xpDoNivel(n)
  const fim = xpDoNivel(n + 1)
  return { nivel: n, titulo: tituloDoNivel(n), atual: xp - ini, falta: fim - xp, total: fim - ini, pct: Math.round(((xp - ini) / (fim - ini)) * 100) }
}

// Avisa a notificação de XP para conferir agora (depois de uma ação do aluno)
export const checarXp = () => {
  try { window.dispatchEvent(new Event('xp:checar')) } catch { /* ok */ }
}

export const COMO_GANHAR = [
  ['🧠', 'Banco de questões', 'Acertou: +4 XP · errou: +2 XP (vale a 1ª vez de cada questão)'],
  ['✅', 'Check-in do horário', 'Bloco feito: +10 · feito em parte: +5 (hoje ou ontem)'],
  ['🗓️', 'Dia completo', 'Todos os blocos do dia feitos: +25'],
  ['🔥', 'Sequência', '7 dias seguidos de check-in: +50'],
  ['🏁', 'Simulado ENEM', '+2 por acerto, +1 por questão respondida, +100 por um dia inteiro, +40 por uma área inteira, +50 no simulado agendado'],
  ['📕', 'Caderno de erros', 'Cada revisão feita: +3'],
  ['✍️', 'Redação', 'Cada redação enviada: +30'],
  ['🧭', 'Trilha', 'Conteúdo concluído (100%): +15'],
  ['⏱️', 'Sessão de foco', '+2 XP a cada 5 minutos de foco concluídos'],
  ['🎉', 'Missões do dia', 'Todas as missões do dia: +40'],
  ['📋', 'Lista de questões', 'Terminou uma lista inteira: +20'],
  ['⏱️', 'Hora do foco', 'Por dia: 1h = 16 XP · 3h = 58 · 5h = 130 · 8h = 248 · 10h = 460'],
]

// Dias seguidos com check-in (até hoje ou ontem)
export function sequenciaAtual(eventos) {
  const dias = new Set(eventos.filter((e) => e.tipo === 'checkin').map((e) => (e.chave.split(':')[2] || '').slice(0, 10)))
  const fmt = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  let d = new Date()
  if (!dias.has(fmt(d))) d = new Date(Date.now() - 864e5)
  let n = 0
  while (dias.has(fmt(d))) { n++; d = new Date(d.getTime() - 864e5) }
  return n
}
