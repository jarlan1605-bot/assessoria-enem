// Aviso por e-mail para a equipe (Resend: resend.com, plano grátis).
// Variáveis no Vercel: RESEND_API_KEY e AVISO_EMAIL (para quem vai o aviso; pode ter vários, separados por vírgula).
// Opcional: AVISO_REMETENTE (precisa de domínio verificado no Resend; sem ele usa o remetente de teste do Resend).
const CHAVE = process.env.RESEND_API_KEY
const PARA = (process.env.AVISO_EMAIL || '').split(',').map((e) => e.trim()).filter(Boolean)
const DE = process.env.AVISO_REMETENTE || 'Assessoria J&C <onboarding@resend.dev>'

export const emailConfigurado = () => Boolean(CHAVE && PARA.length)

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Nunca derruba a inscrição: se o e-mail falhar, só registra no log
export async function avisarEquipe({ assunto, titulo, linhas = [], botao }) {
  if (!emailConfigurado()) return false
  const corpo = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#14231d">
      <h2 style="margin:0 0 12px">${esc(titulo)}</h2>
      <table style="border-collapse:collapse;width:100%">
        ${linhas.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#5d6a63;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0"><b>${esc(v)}</b></td></tr>`).join('')}
      </table>
      ${botao ? `<p style="margin:20px 0"><a href="${esc(botao.link)}" style="background:#14231d;color:#d6f36b;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(botao.texto)}</a></p>` : ''}
      <p style="color:#5d6a63;font-size:12px">Aviso automático do site da Assessoria J&amp;C.</p>
    </div>`
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: DE, to: PARA, subject: assunto, html: corpo }),
    })
    if (!r.ok) console.error('Resend:', r.status, await r.text().catch(() => ''))
    return r.ok
  } catch (e) {
    console.error('Resend:', e.message)
    return false
  }
}
