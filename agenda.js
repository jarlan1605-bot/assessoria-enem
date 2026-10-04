// Funções de data usadas pela Agenda (mentor) e pelas Aulas (aluno)

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
export const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// Prazo mínimo para o aluno cancelar (precisa bater com o agenda.sql)
export const HORAS_PARA_CANCELAR = 12

export const inicioDoMes = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
export const somarMeses = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)
export const mesmoDia = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
export const mesmoMes = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

export const fimDoAtendimento = (a) => new Date(new Date(a.inicio).getTime() + a.duracao_min * 60000)

export const hora = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export const faixaHorario = (a) => `${hora(new Date(a.inicio))}–${hora(fimDoAtendimento(a))}`

// "terça, 14/10"
export const diaPorExtenso = (d) =>
  `${DIAS_SEMANA[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

export const chaveDoDia = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

// Agrupa atendimentos por dia, mantendo a ordem
export function agruparPorDia(lista) {
  const grupos = []
  for (const a of lista) {
    const d = new Date(a.inicio)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && mesmoDia(ultimo.dia, d)) ultimo.itens.push(a)
    else grupos.push({ dia: d, itens: [a] })
  }
  return grupos
}

// Semanas do mês para o calendário (segunda a domingo); dias fora do mês = null
export function semanasDoMes(mes) {
  const primeiro = inicioDoMes(mes)
  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const deslocamento = (primeiro.getDay() + 6) % 7
  const celulas = Array(deslocamento).fill(null)
  for (let i = 1; i <= diasNoMes; i++) celulas.push(new Date(mes.getFullYear(), mes.getMonth(), i))
  while (celulas.length % 7) celulas.push(null)
  const semanas = []
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))
  return semanas
}

export const podeCancelar = (a) =>
  new Date(a.inicio).getTime() - Date.now() >= HORAS_PARA_CANCELAR * 3600000

// Link "Adicionar ao Google Agenda" (o celular avisa antes da aula)
const paraGoogle = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
export function linkGoogleAgenda({ titulo, inicio, fim, detalhes = '' }) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo,
    dates: `${paraGoogle(new Date(inicio))}/${paraGoogle(new Date(fim))}`,
    details: detalhes,
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

// Data de hoje no formato AAAA-MM-DD (fuso do aparelho)
export const hojeISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const somarDias = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number)
  return hojeISO(new Date(a, m - 1, d + n))
}
