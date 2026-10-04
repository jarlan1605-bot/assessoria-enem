// Cálculos do check-in diário: % do plano cumprido e sequência de dias
import { hojeISO, somarDias } from './agenda'

const PESO = { feito: 1, parcial: 0.5, nao: 0 }
const minutos = (t) => {
  const [h, m] = (t || '00:00').slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
export const diaDaSemana = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return (new Date(a, m - 1, d).getDay() + 6) % 7 // 0 = segunda
}
export const mapaCheckins = (checkins) => {
  const m = {}
  for (const c of checkins) m[`${c.horario_id}|${c.dia}`] = c.status
  return m
}

// Pontuação de um dia. No dia de hoje, só conta blocos já marcados ou que já terminaram.
export function pontuacaoDoDia(iso, blocos, mapa) {
  const hoje = hojeISO()
  const agora = new Date()
  const minAgora = agora.getHours() * 60 + agora.getMinutes()
  const doDia = blocos.filter((b) => b.dia === diaDaSemana(iso) && b.materia !== 'Descanso')
  let total = 0
  let pontos = 0
  let marcados = 0
  for (const b of doDia) {
    const st = mapa[`${b.id}|${iso}`]
    if (iso === hoje && !st && minutos(b.fim) > minAgora) continue
    total++
    if (st) {
      marcados++
      pontos += PESO[st]
    }
  }
  return { total, pontos, marcados, planejados: doDia.length }
}

// % do plano cumprido entre duas datas (inclusive), sem contar dias futuros
export function resumoAdesao(blocos, checkins, inicio, fim) {
  const mapa = mapaCheckins(checkins)
  const hoje = hojeISO()
  let total = 0
  let pontos = 0
  let diasComCheckin = 0
  for (let d = inicio; d <= fim && d <= hoje; d = somarDias(d, 1)) {
    const p = pontuacaoDoDia(d, blocos, mapa)
    total += p.total
    pontos += p.pontos
    if (p.marcados) diasComCheckin++
  }
  return { pct: total ? Math.round((pontos / total) * 100) : null, diasComCheckin }
}

// Dias seguidos cumprindo pelo menos 70% do plano (dias sem estudo planejado não quebram)
export function sequenciaDeDias(blocos, checkins) {
  const mapa = mapaCheckins(checkins)
  const hoje = hojeISO()
  let seq = 0
  for (let i = 0; i < 60; i++) {
    const d = somarDias(hoje, -i)
    const p = pontuacaoDoDia(d, blocos, mapa)
    if (p.planejados === 0) continue
    const ok = p.total > 0 && p.pontos / p.total >= 0.7
    if (ok) seq++
    else if (d === hoje) continue // hoje ainda está em andamento
    else break
  }
  return seq
}
