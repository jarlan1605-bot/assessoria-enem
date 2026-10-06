// Funções do banco de questões
import { AREAS } from './constants'

export const LETRAS = ['A', 'B', 'C', 'D', 'E']
export const DIFICULDADES = { facil: 'Fácil', media: 'Média', dificil: 'Difícil' }
export const nomeArea = (k) => AREAS.find((a) => a.chave === k)?.nome ?? k
export const corArea = (k) => AREAS.find((a) => a.chave === k)?.cor ?? '#868e96'

// Nome curto para o caderno de erros: "ENEM 2023 — Q91"
export const origemQuestao = (q) => {
  const base = q.prova ? q.prova.split(' — ').slice(0, 1).join('') : q.banca
  return q.numero ? `${base} — Q${q.numero}` : base
}

export function embaralhar(lista) {
  const a = [...lista]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const minSeg = (s) => {
  s = Math.max(0, Math.round(s || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${r}`
}

export const slug = (t) =>
  (t || 'questoes')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'questoes'

// Texto com imagens: {{img:1}} coloca a 1ª imagem naquele ponto; **negrito** também funciona.
// As imagens não citadas no texto aparecem depois do enunciado.
export function partesDoTexto(texto) {
  const partes = []
  const re = /\{\{img:(\d+)\}\}/g
  let ult = 0
  let m
  while ((m = re.exec(texto || ''))) {
    if (m.index > ult) partes.push({ t: texto.slice(ult, m.index) })
    partes.push({ img: Number(m[1]) - 1 })
    ult = re.lastIndex
  }
  if (ult < (texto || '').length) partes.push({ t: texto.slice(ult) })
  return partes
}

export const imagensCitadas = (q) => {
  const usadas = new Set()
  for (const txt of [q.enunciado, ...Object.values(q.alternativas || {})]) {
    for (const p of partesDoTexto(txt)) if (p.img !== undefined) usadas.add(p.img)
  }
  return usadas
}

// Primeira resposta de cada questão (a que vale para o desempenho)
export function primeirasRespostas(respostas) {
  const m = new Map()
  for (const r of [...respostas].sort((a, b) => a.criado_em.localeCompare(b.criado_em))) {
    if (!m.has(r.questao_id)) m.set(r.questao_id, r)
  }
  return m
}
