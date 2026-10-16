// Função do Vercel: cobrança automática pelo WhatsApp (API oficial da Meta).
// - Todo dia, por volta das 12h (horário de Brasília), o Vercel chama esta função (veja vercel.json).
// - Ela manda: lembrete alguns dias antes, aviso no dia do vencimento e um aviso de atraso.
//   Depois disso, o aluno aparece no site como "Sua vez" para o CEO cobrar pessoalmente.
// - Cada mensagem é registrada em envios_whatsapp e nunca é enviada duas vezes.
// Variáveis no Vercel: SUPABASE_SERVICE_ROLE_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, CRON_SECRET.
import { createClient } from '@supabase/supabase-js'
import { pixCopiaECola } from '../pix.js'

const URL_SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const CHAVE_SECRETA = process.env.SUPABASE_SERVICE_ROLE_KEY
const WA_TOKEN = process.env.WHATSAPP_TOKEN
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID
const NOME_MENTORIA = process.env.NOME_MENTORIA || 'Mentoria ENEM'
const VERSAO_API = 'v21.0'

const responder = (res, status, corpo) => res.status(status).json(corpo)

// Datas no fuso de Brasília
function hojeBrasil() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return p // AAAA-MM-DD
}
const diasEntre = (de, ate) => Math.round((new Date(ate + 'T12:00:00Z') - new Date(de + 'T12:00:00Z')) / 86400000)
const dataBR = (iso) => iso.split('-').reverse().join('/')
const reais = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const telefoneWa = (t) => {
  const d = String(t || '').replace(/\D/g, '')
  if (!d) return ''
  return d.length <= 11 ? '55' + d : d
}
const primeiroNome = (t) => String(t || '').trim().split(/\s+/)[0] || ''
// A Meta não aceita quebra de linha nem muitos espaços dentro das variáveis
const limpar = (t) => String(t || '').replace(/[\n\r\t]+/g, ' ').replace(/ {4,}/g, '   ').trim() || '-'

async function enviarModelo({ para, modelo, idioma, variaveis }) {
  const r = await fetch(`https://graph.facebook.com/${VERSAO_API}/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para,
      type: 'template',
      template: {
        name: modelo,
        language: { code: idioma || 'pt_BR' },
        components: [{ type: 'body', parameters: variaveis.map((v) => ({ type: 'text', text: limpar(v) })) }],
      },
    }),
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = corpo?.error
    throw new Error(e ? `${e.message}${e.error_data?.details ? ' — ' + e.error_data.details : ''} (código ${e.code})` : `Erro ${r.status} da Meta`)
  }
  return corpo?.messages?.[0]?.id || ''
}

function variaveisDe({ contrato, aluno, config }) {
  const nome = contrato.responsavel?.trim() ? primeiroNome(contrato.responsavel) : primeiroNome(aluno?.nome) || 'tudo bem'
  const pix = config.pix_chave
    ? pixCopiaECola({
        chave: config.pix_chave, tipo: config.pix_tipo, nome: config.pix_nome || NOME_MENTORIA, cidade: config.pix_cidade,
        valor: contrato.valor_mensal, txid: (primeiroNome(aluno?.nome) + contrato.proximo_vencimento.slice(5, 7) + contrato.proximo_vencimento.slice(2, 4)).toUpperCase(),
      })
    : 'Fale com seu mentor para receber a chave Pix'
  return [nome, reais(contrato.valor_mensal), dataBR(contrato.proximo_vencimento), pix]
}

// Decide qual mensagem (se alguma) vai hoje para cada aluno
function tipoDeHoje(contrato, config, hoje, jaEnviados) {
  const d = diasEntre(hoje, contrato.proximo_vencimento)
  const antes = Number(config.dias_antes ?? 3)
  const atraso = Math.max(1, Number(config.atraso_dias ?? 3))
  const ja = (t) => jaEnviados.has(`${contrato.aluno_id}|${contrato.proximo_vencimento}|${t}`)
  if (d > 0 && d <= antes && !ja('lembrete')) return 'lembrete'
  if (d === 0 && !ja('hoje')) return 'hoje'
  // atraso: no dia combinado (ou até 3 dias depois, se a rotina falhou em algum dia)
  if (d <= -atraso && d >= -(atraso + 3) && !ja('atraso')) return 'atraso'
  return null
}

async function rodar(admin, { apenasSimular = false } = {}) {
  const hoje = hojeBrasil()
  const [{ data: config }, { data: contratos }, { data: alunos }] = await Promise.all([
    admin.from('financeiro_config').select('*').eq('id', 1).maybeSingle(),
    admin.from('contratos').select('*').eq('ativo', true).not('proximo_vencimento', 'is', null),
    admin.from('perfis').select('id, nome').eq('papel', 'aluno'),
  ])
  if (!config?.auto_ativo && !apenasSimular) return { hoje, ativo: false, enviados: [], erros: [], pulados: [] }
  const nomes = Object.fromEntries((alunos ?? []).map((a) => [a.id, a]))
  const desde = new Date(Date.now() - 70 * 86400000).toISOString()
  const { data: envios } = await admin.from('envios_whatsapp').select('aluno_id, vencimento, tipo, status').gte('criado_em', desde)
  const jaEnviados = new Set((envios ?? []).filter((e) => e.status !== 'erro').map((e) => `${e.aluno_id}|${e.vencimento}|${e.tipo}`))

  const resultado = { hoje, ativo: true, enviados: [], erros: [], pulados: [] }
  for (const ct of contratos ?? []) {
    if (!(Number(ct.valor_mensal) > 0)) continue
    const tipo = tipoDeHoje(ct, config, hoje, jaEnviados)
    if (!tipo) continue
    const aluno = nomes[ct.aluno_id]
    const para = telefoneWa(ct.telefone)
    if (!para) {
      resultado.pulados.push({ aluno: aluno?.nome, motivo: 'sem WhatsApp cadastrado' })
      continue
    }
    if (apenasSimular) {
      resultado.enviados.push({ aluno: aluno?.nome, tipo, simulado: true })
      continue
    }
    // registra antes de enviar: se a rotina rodar duas vezes, a segunda não repete a mensagem
    const { data: reg, error: errReg } = await admin
      .from('envios_whatsapp')
      .upsert({ aluno_id: ct.aluno_id, vencimento: ct.proximo_vencimento, tipo, telefone: para, status: 'enviando', erro: '' }, { onConflict: 'aluno_id,vencimento,tipo' })
      .select('id')
      .single()
    if (errReg) {
      resultado.erros.push({ aluno: aluno?.nome, erro: errReg.message })
      continue
    }
    try {
      const modelo = config[`tpl_${tipo}`]
      const wamid = await enviarModelo({ para, modelo, idioma: config.tpl_idioma, variaveis: variaveisDe({ contrato: ct, aluno, config }) })
      await admin.from('envios_whatsapp').update({ status: 'enviado', wamid }).eq('id', reg.id)
      await admin.from('contratos').update({ ultimo_aviso: hoje }).eq('aluno_id', ct.aluno_id)
      resultado.enviados.push({ aluno: aluno?.nome, tipo })
    } catch (e) {
      await admin.from('envios_whatsapp').update({ status: 'erro', erro: String(e.message).slice(0, 500) }).eq('id', reg.id)
      resultado.erros.push({ aluno: aluno?.nome, tipo, erro: e.message })
    }
  }
  return resultado
}

export default async function handler(req, res) {
  if (!URL_SUPABASE || !CHAVE_SECRETA) return responder(res, 500, { erro: 'Falta a variável SUPABASE_SERVICE_ROLE_KEY no Vercel.' })
  const admin = createClient(URL_SUPABASE, CHAVE_SECRETA, { auth: { persistSession: false, autoRefreshToken: false } })
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')

  // 1) Chamada diária do Vercel (cron)
  if (req.method === 'GET') {
    if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) return responder(res, 401, { erro: 'Não autorizado.' })
    if (!WA_TOKEN || !WA_PHONE_ID) return responder(res, 500, { erro: 'Faltam WHATSAPP_TOKEN e WHATSAPP_PHONE_ID no Vercel.' })
    const r = await rodar(admin)
    return responder(res, 200, r)
  }

  // 2) Botões do site (só o CEO): testar, simular e rodar agora
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não permitido.' })
  if (!token) return responder(res, 401, { erro: 'Faça login de novo.' })
  const { data: du } = await admin.auth.getUser(token)
  if (!du?.user) return responder(res, 401, { erro: 'Sessão expirada. Faça login de novo.' })
  const { data: eu } = await admin.from('perfis').select('papel').eq('id', du.user.id).single()
  if (eu?.papel !== 'ceo') return responder(res, 403, { erro: 'Só o CEO pode fazer isso.' })

  let corpo = req.body
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo) } catch { corpo = {} } }
  corpo = corpo || {}

  try {
    if (corpo.acao === 'simular') return responder(res, 200, await rodar(admin, { apenasSimular: true }))
    if (!WA_TOKEN || !WA_PHONE_ID) return responder(res, 400, { erro: 'Faltam as variáveis WHATSAPP_TOKEN e WHATSAPP_PHONE_ID no Vercel (veja o passo a passo).' })
    if (corpo.acao === 'teste') {
      const para = telefoneWa(corpo.telefone)
      if (!para) return responder(res, 400, { erro: 'Coloque o seu WhatsApp para receber o teste.' })
      const { data: config } = await admin.from('financeiro_config').select('*').eq('id', 1).maybeSingle()
      const tipo = ['lembrete', 'hoje', 'atraso'].includes(corpo.tipo) ? corpo.tipo : 'lembrete'
      const contrato = { valor_mensal: 1, proximo_vencimento: hojeBrasil(), responsavel: '', aluno_id: 'teste' }
      const wamid = await enviarModelo({ para, modelo: config?.[`tpl_${tipo}`], idioma: config?.tpl_idioma, variaveis: variaveisDe({ contrato, aluno: { nome: 'Teste' }, config: config || {} }) })
      return responder(res, 200, { ok: true, wamid })
    }
    if (corpo.acao === 'rodar') return responder(res, 200, await rodar(admin))
    return responder(res, 400, { erro: 'Ação desconhecida.' })
  } catch (e) {
    return responder(res, 500, { erro: e.message })
  }
}
