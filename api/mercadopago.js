// Função do Vercel: Pix com baixa automática pelo Mercado Pago.
// 1) Aviso do Mercado Pago (webhook): quando um Pix é pago, o site confere o pagamento
//    direto na API do Mercado Pago e dá baixa na mensalidade.
// 2) Pedidos do site: o aluno gera o Pix da própria mensalidade; o CEO gera o de qualquer aluno.
// Variáveis no Vercel: SUPABASE_SERVICE_ROLE_KEY e MP_ACCESS_TOKEN.
import { createClient } from '@supabase/supabase-js'
import { mpConfigurado, pixDaMensalidade, conferirPagamento, urlDoSite, hojeBrasil } from './_mercadopago.js'

const URL_SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const CHAVE_SECRETA = process.env.SUPABASE_SERVICE_ROLE_KEY
const responder = (res, status, corpo) => res.status(status).json(corpo)
const diasEntre = (de, ate) => Math.round((new Date(ate + 'T12:00:00Z') - new Date(de + 'T12:00:00Z')) / 86400000)

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não permitido.' })
  if (!URL_SUPABASE || !CHAVE_SECRETA) return responder(res, 500, { erro: 'Falta a variável SUPABASE_SERVICE_ROLE_KEY no Vercel.' })
  const admin = createClient(URL_SUPABASE, CHAVE_SECRETA, { auth: { persistSession: false, autoRefreshToken: false } })

  let corpo = req.body
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo) } catch { corpo = {} } }
  corpo = corpo || {}

  // ---------- 1) Aviso do Mercado Pago ----------
  if (!corpo.acao) {
    const q = req.query || {}
    const tipo = corpo.type || corpo.topic || q.type || q.topic
    const id = corpo.data?.id || q['data.id'] || q.id
    if (!mpConfigurado()) return responder(res, 200, { ok: false, motivo: 'MP_ACCESS_TOKEN não configurado' })
    if (tipo && tipo !== 'payment') return responder(res, 200, { ok: true, ignorado: tipo })
    if (!id || !/^\d+$/.test(String(id))) return responder(res, 200, { ok: true, ignorado: 'sem id' })
    try {
      // nunca confia no corpo do aviso: o pagamento é consultado na API com a sua chave
      return responder(res, 200, { ok: true, ...(await conferirPagamento(admin, String(id))) })
    } catch (e) {
      return responder(res, 500, { erro: e.message }) // o Mercado Pago tenta de novo depois
    }
  }

  // ---------- 2) Pedidos do site ----------
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return responder(res, 401, { erro: 'Faça login de novo.' })
  const { data: du } = await admin.auth.getUser(token)
  if (!du?.user) return responder(res, 401, { erro: 'Sessão expirada. Faça login de novo.' })
  const { data: eu } = await admin.from('perfis').select('id, papel').eq('id', du.user.id).single()
  const ehCeo = eu?.papel === 'ceo'

  try {
    if (corpo.acao === 'situacao') {
      if (!ehCeo) return responder(res, 403, { erro: 'Só o CEO.' })
      return responder(res, 200, { configurado: mpConfigurado(), webhook: `${urlDoSite(req)}/api/mercadopago` })
    }

    // aluno: a própria mensalidade; CEO: a de qualquer aluno
    const alunoId = ehCeo && corpo.aluno_id ? corpo.aluno_id : du.user.id
    if (!ehCeo && eu?.papel !== 'aluno') return responder(res, 403, { erro: 'Só para alunos.' })
    const [{ data: contrato }, { data: aluno }, { data: config }] = await Promise.all([
      admin.from('contratos').select('*').eq('aluno_id', alunoId).maybeSingle(),
      admin.from('perfis').select('id, nome, email').eq('id', alunoId).maybeSingle(),
      admin.from('financeiro_config').select('dias_antes').eq('id', 1).maybeSingle(),
    ])
    const ativo = contrato && contrato.ativo !== false && contrato.proximo_vencimento && Number(contrato.valor_mensal) > 0

    if (corpo.acao === 'minha') {
      if (!ativo) return responder(res, 200, { mostrar: false })
      const dias = diasEntre(hojeBrasil(), contrato.proximo_vencimento)
      const antes = Math.max(Number(config?.dias_antes ?? 3), 5)
      const { data: pix } = await admin.from('cobrancas_pix').select('*')
        .eq('aluno_id', alunoId).eq('vencimento', contrato.proximo_vencimento).eq('status', 'pendente')
        .order('criado_em', { ascending: false }).limit(1)
      return responder(res, 200, {
        mostrar: dias <= antes, vencimento: contrato.proximo_vencimento, valor: Number(contrato.valor_mensal), dias,
        disponivel: mpConfigurado(), pix: pix?.[0] && new Date(pix[0].expira_em) > Date.now() ? pix[0] : null,
      })
    }

    if (corpo.acao === 'gerar') {
      if (!mpConfigurado()) return responder(res, 400, { erro: 'O pagamento por Pix automático ainda não foi ativado. Fale com seu mentor.' })
      if (!ativo) return responder(res, 400, { erro: 'Não há mensalidade em aberto.' })
      const pix = await pixDaMensalidade(admin, { contrato, aluno, urlSite: urlDoSite(req) })
      return responder(res, 200, { pix })
    }

    if (corpo.acao === 'conferir') {
      // o aluno clicou em "já paguei": confere o último Pix desta mensalidade na hora
      const { data: pix } = await admin.from('cobrancas_pix').select('mp_id, status').eq('aluno_id', alunoId).order('criado_em', { ascending: false }).limit(1)
      if (!pix?.[0] || !mpConfigurado()) return responder(res, 200, { pago: false })
      if (pix[0].status === 'pago') return responder(res, 200, { pago: true })
      const r = await conferirPagamento(admin, pix[0].mp_id)
      return responder(res, 200, { pago: r.status === 'approved' })
    }

    return responder(res, 400, { erro: 'Ação desconhecida.' })
  } catch (e) {
    return responder(res, 500, { erro: e.message })
  }
}
