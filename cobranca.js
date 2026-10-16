// Regras da cobrança mensal (ciclo de 1 mês a partir do último pagamento)
import { hojeISO, somarDias } from './agenda'
import { NOME_SITE } from './constants'
import { pixCopiaECola } from './pix'

export const reais = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
export const dataCurta = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '')

const ultimoDia = (a, m) => new Date(a, m + 1, 0).getDate()
// Mesmo dia no mês seguinte (31 de janeiro → 28/29 de fevereiro → 31 de março)
export function proximoMes(iso, ancora) {
  const [a, m, d] = iso.split('-').map(Number)
  const dia = ancora || d
  const na = m === 12 ? a + 1 : a
  const nm = m === 12 ? 0 : m // índice 0-11 do mês seguinte
  return hojeISO(new Date(na, nm, Math.min(dia, ultimoDia(na, nm))))
}
export const diasEntre = (de, ate) => Math.round((new Date(ate + 'T12:00:00') - new Date(de + 'T12:00:00')) / 86400000)

// Situação de um contrato hoje
export function situacao(contrato, diasAntes = 3, hoje = hojeISO()) {
  if (!contrato || !contrato.ativo || !(Number(contrato.valor_mensal) > 0)) return { tipo: 'inativo' }
  if (!contrato.proximo_vencimento) return { tipo: 'sem-data' }
  const d = diasEntre(hoje, contrato.proximo_vencimento)
  const aviso = contrato.ultimo_aviso
  if (d < 0) {
    const cobrar = !aviso || aviso < contrato.proximo_vencimento || diasEntre(aviso, hoje) >= 3
    return { tipo: 'atrasado', dias: -d, cobrar, msg: 'atraso' }
  }
  if (d === 0) return { tipo: 'hoje', dias: 0, cobrar: aviso !== hoje, msg: 'hoje' }
  if (d <= diasAntes) {
    const cobrar = !aviso || aviso < somarDias(contrato.proximo_vencimento, -diasAntes)
    return { tipo: 'breve', dias: d, cobrar, msg: 'lembrete' }
  }
  return { tipo: 'em-dia', dias: d }
}

export const MENSAGENS_PADRAO = {
  lembrete: 'Oi, {nome}! Tudo bem? 😊\nPassando para lembrar que a mensalidade da {mentoria} vence em *{vencimento}* ({valor}).{pix}\n\nQualquer dúvida, é só me chamar!',
  hoje: 'Oi, {nome}! Tudo bem? 😊\nHoje (*{vencimento}*) vence a mensalidade da {mentoria}: {valor}.{pix}\n\nAssim que pagar, me manda o comprovante, por favor. Obrigado!',
  atraso: 'Oi, {nome}! Tudo bem?\nA mensalidade da {mentoria} que venceu em *{vencimento}* ({valor}) ainda está em aberto aqui.{pix}\n\nSe já pagou, me manda o comprovante que eu atualizo. Qualquer coisa, me chama!',
}

export function mensagem({ tipo, contrato, aluno, config }) {
  const modelo = (config?.[`msg_${tipo}`] || '').trim() || MENSAGENS_PADRAO[tipo]
  const primeiro = (aluno?.nome || '').trim().split(/\s+/)[0] || ''
  const pix = config?.pix_chave
    ? `\n\nPix copia e cola (o valor já vem preenchido):\n${pixCopiaECola({ chave: config.pix_chave, tipo: config.pix_tipo, nome: config.pix_nome || NOME_SITE, cidade: config.pix_cidade, valor: contrato.valor_mensal, txid: (primeiro + contrato.proximo_vencimento?.slice(5, 7) + contrato.proximo_vencimento?.slice(2, 4)).toUpperCase() })}`
    : ''
  return modelo
    .replaceAll('{nome}', contrato.responsavel?.trim() ? contrato.responsavel.trim().split(/\s+/)[0] : primeiro)
    .replaceAll('{aluno}', primeiro)
    .replaceAll('{mentoria}', NOME_SITE)
    .replaceAll('{valor}', reais(contrato.valor_mensal))
    .replaceAll('{vencimento}', dataBR(contrato.proximo_vencimento))
    .replaceAll('{pix}', pix)
}

export function linkWhatsApp(telefone, texto) {
  const dig = (telefone || '').replace(/\D/g, '')
  const numero = dig ? (dig.length <= 11 ? '55' + dig : dig) : ''
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

// Com a cobrança automática ligada: quem precisa de você (o robô já fez a parte dele ou não conseguiu)
export function precisaVoce(contrato, config, envioComErro = false, hoje = hojeISO()) {
  const s = situacao(contrato, config?.dias_antes ?? 3, hoje)
  if (!config?.auto_ativo) return s.cobrar ? s : null
  if (['inativo', 'sem-data', 'em-dia'].includes(s.tipo)) return null
  const recente = contrato.aviso_pessoal && diasEntre(contrato.aviso_pessoal, hoje) < 3 && contrato.aviso_pessoal >= somarDias(contrato.proximo_vencimento, -15)
  if (recente) return null
  if (envioComErro) return { ...s, motivo: 'erro' }
  if (!(contrato.telefone || '').replace(/\D/g, '')) return s.cobrar || s.tipo === 'atrasado' ? { ...s, motivo: 'sem-telefone' } : null
  if (s.tipo === 'atrasado' && s.dias >= Math.max(1, Number(config.atraso_dias ?? 3))) return { ...s, motivo: 'atraso' }
  return null
}
