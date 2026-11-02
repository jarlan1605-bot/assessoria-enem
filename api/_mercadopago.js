// Funções do Pix com baixa automática pelo Mercado Pago (usadas pelas funções do Vercel).
// Variável no Vercel: MP_ACCESS_TOKEN (Access Token de produção da sua conta do Mercado Pago).
const MP_TOKEN = process.env.MP_ACCESS_TOKEN
const NOME_MENTORIA = process.env.NOME_MENTORIA || 'Mentoria ENEM'

export const mpConfigurado = () => Boolean(MP_TOKEN)

export function hojeBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const ultimoDia = (a, m) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate()
// Mesmo dia no mês seguinte (31/01 → 28/02 → 31/03), igual ao Financeiro do site
export function proximoMes(iso, ancora) {
  const [a, m, d] = iso.split('-').map(Number)
  const dia = ancora || d
  const na = m === 12 ? a + 1 : a
  const nm = m === 12 ? 0 : m
  const dd = Math.min(dia, ultimoDia(na, nm))
  return `${na}-${String(nm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

async function mp(caminho, { metodo = 'GET', corpo, idempotencia } = {}) {
  const r = await fetch(`https://api.mercadopago.com${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${MP_TOKEN}`,
      'Content-Type': 'application/json',
      ...(idempotencia ? { 'X-Idempotency-Key': idempotencia } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Mercado Pago: ${json?.message || json?.error || 'erro ' + r.status}`)
  return json
}

const dataBR = (iso) => iso.split('-').reverse().join('/')

// Devolve o Pix em aberto desta mensalidade ou gera um novo no Mercado Pago
export async function pixDaMensalidade(admin, { contrato, aluno, urlSite }) {
  const venc = contrato.proximo_vencimento
  const valor = Math.round(Number(contrato.valor_mensal) * 100) / 100
  const { data: existentes } = await admin
    .from('cobrancas_pix').select('*')
    .eq('aluno_id', contrato.aluno_id).eq('vencimento', venc).eq('status', 'pendente')
    .order('criado_em', { ascending: false }).limit(1)
  const atual = existentes?.[0]
  const valeAinda = atual && Number(atual.valor) === valor && (!atual.expira_em || new Date(atual.expira_em) - Date.now() > 6 * 3600000)
  if (valeAinda) return atual

  const expira = new Date(Date.now() + 3 * 86400000)
  const pagamento = await mp('/v1/payments', {
    metodo: 'POST',
    idempotencia: `${contrato.aluno_id}-${venc}-${valor}-${Math.floor(Date.now() / 3600000)}`,
    corpo: {
      transaction_amount: valor,
      description: `Mensalidade ${NOME_MENTORIA} - vencimento ${dataBR(venc)}`,
      payment_method_id: 'pix',
      payer: { email: aluno?.email || 'aluno@exemplo.com', first_name: (aluno?.nome || 'Aluno').split(' ')[0] },
      external_reference: `${contrato.aluno_id}|${venc}`,
      notification_url: urlSite ? `${urlSite}/api/mercadopago` : undefined,
      date_of_expiration: expira.toISOString().replace('Z', '+00:00'),
    },
  })
  const t = pagamento?.point_of_interaction?.transaction_data || {}
  const linha = {
    aluno_id: contrato.aluno_id, vencimento: venc, valor, mp_id: String(pagamento.id),
    copia_cola: t.qr_code || '', qr_base64: t.qr_code_base64 || '', link: t.ticket_url || '',
    status: pagamento.status === 'approved' ? 'pago' : 'pendente', expira_em: expira.toISOString(),
  }
  if (atual) await admin.from('cobrancas_pix').update({ status: 'cancelado' }).eq('id', atual.id)
  const { data, error } = await admin.from('cobrancas_pix').insert(linha).select('*').single()
  if (error) throw new Error('Não foi possível salvar o Pix: ' + error.message)
  return data
}

// Consulta um pagamento no Mercado Pago e, se aprovado, dá baixa na mensalidade
export async function conferirPagamento(admin, mpId) {
  const p = await mp(`/v1/payments/${encodeURIComponent(mpId)}`)
  const [alunoId, venc] = String(p.external_reference || '').split('|')
  if (!alunoId || !/^\d{4}-\d{2}-\d{2}$/.test(venc || '')) return { ignorado: true }

  if (p.status === 'cancelled' || p.status === 'expired' || p.status === 'rejected') {
    await admin.from('cobrancas_pix').update({ status: p.status === 'cancelled' ? 'cancelado' : 'expirado' }).eq('mp_id', String(p.id)).eq('status', 'pendente')
    return { status: p.status }
  }
  if (p.status !== 'approved') return { status: p.status }

  const pagoEm = p.date_approved ? new Date(p.date_approved) : new Date()
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(pagoEm)
  await admin.from('cobrancas_pix').update({ status: 'pago', pago_em: pagoEm.toISOString() }).eq('mp_id', String(p.id))

  // registra o pagamento (só uma vez por mensalidade)
  const { data: ja } = await admin.from('mensalidades').select('id, pago_em').eq('aluno_id', alunoId).eq('competencia', venc).maybeSingle()
  if (ja?.pago_em) return { status: 'approved', jaRegistrado: true }
  const { error } = await admin.from('mensalidades').upsert(
    { aluno_id: alunoId, competencia: venc, vencimento: venc, valor: p.transaction_amount, pago_em: dia, forma: 'Pix (Mercado Pago)' },
    { onConflict: 'aluno_id,competencia' }
  )
  if (error) throw new Error('Não foi possível registrar o pagamento: ' + error.message)

  // passa o vencimento para o mês seguinte (se ainda for o desta mensalidade)
  const { data: ct } = await admin.from('contratos').select('proximo_vencimento, dia_vencimento').eq('aluno_id', alunoId).maybeSingle()
  if (ct?.proximo_vencimento === venc) {
    await admin.from('contratos').update({ proximo_vencimento: proximoMes(venc, ct.dia_vencimento), ultimo_aviso: null }).eq('aluno_id', alunoId)
  }
  return { status: 'approved', registrado: true }
}

export function urlDoSite(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return host ? `https://${host}` : ''
}
