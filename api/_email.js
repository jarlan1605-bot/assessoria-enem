// Aviso por e-mail para a equipe (Resend: resend.com, plano grátis).
// Variáveis no Vercel: RESEND_API_KEY e AVISO_EMAIL (para quem vai o aviso; pode ter vários, separados por vírgula).
// Opcional: AVISO_REMETENTE (precisa de domínio verificado no Resend; sem ele usa o remetente de teste do Resend).
const CHAVE = process.env.RESEND_API_KEY
const PARA = (process.env.AVISO_EMAIL || '').split(',').map((e) => e.trim()).filter(Boolean)
const DE = process.env.AVISO_REMETENTE || 'Assessoria J&C <onboarding@resend.dev>'

export const emailConfigurado = () => Boolean(CHAVE && PARA.length)

const GMAIL_USUARIO = process.env.GMAIL_USUARIO
const GMAIL_SENHA = (process.env.GMAIL_SENHA_APP || '').replace(/\s+/g, '')
const SITE = process.env.SITE_URL || 'https://assessoria-enem.vercel.app'

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

// ---------------------------------------------------------------------------
// E-mail de boas-vindas para quem acabou de ganhar uma conta (aluno ou mentor).
// Envia pelo Gmail (GMAIL_USUARIO + GMAIL_SENHA_APP, uma "senha de app" do Google)
// ou, se não tiver, pelo Resend (que só entrega para qualquer pessoa com domínio verificado: AVISO_REMETENTE).
// Nunca derruba o cadastro: devolve true/false.
export async function enviarBoasVindas({ para, nome, email, senha, papel = 'aluno', assessor = '' }) {
  if (!para) return false
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || 'tudo bem'
  const assunto = papel === 'mentor' ? 'Sua conta de mentor na Assessoria J&C' : 'Bem-vindo(a) à Assessoria J&C! Seus dados de acesso'
  const html = `
  <div style="background:#f7f2e8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#14231d">
    <div style="max-width:560px;margin:auto;background:#fffdf7;border:2px solid #14231d;border-radius:20px;overflow:hidden">
      <div style="background:#0f3a2c;padding:22px 24px">
        <div style="color:#d6f36b;font-size:13px;font-weight:bold;letter-spacing:.08em">ASSESSORIA J&amp;C</div>
        <h1 style="margin:6px 0 0;color:#f7f2e8;font-size:24px">Olá, ${esc(primeiro)}! 🎉</h1>
      </div>
      <div style="padding:22px 24px">
        <p style="margin:0 0 14px;font-size:15px;line-height:1.5">${papel === 'mentor'
          ? 'Sua conta de <b>mentor</b> na plataforma da Assessoria J&amp;C foi criada.'
          : `Você foi cadastrado(a) na plataforma da <b>Assessoria J&amp;C</b>${assessor ? `, com acompanhamento de <b>${esc(assessor)}</b>` : ''}. É lá que ficam seu horário de estudos, o banco de questões, os simulados e o ranking.`}</p>
        <table style="width:100%;border-collapse:collapse;background:#f7f2e8;border-radius:14px">
          <tr><td style="padding:12px 16px;color:#5d6a63;font-size:13px">Seu login (e-mail)</td><td style="padding:12px 16px;font-size:15px"><b>${esc(email)}</b></td></tr>
          <tr><td style="padding:12px 16px;color:#5d6a63;font-size:13px">Sua senha</td><td style="padding:12px 16px;font-size:18px;font-family:Consolas,monospace"><b>${esc(senha)}</b></td></tr>
        </table>
        <p style="margin:22px 0;text-align:center"><a href="${SITE}/" style="background:#14231d;color:#d6f36b;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:bold;font-size:15px">Entrar na plataforma →</a></p>
        <p style="margin:0;font-size:13px;color:#5d6a63;line-height:1.5">Dica: depois de entrar, troque a senha em <b>Meu perfil</b>. Guarde este e-mail ou apague-o depois.</p>
      </div>
    </div>
    <p style="text-align:center;color:#5d6a63;font-size:12px">Assessoria J&amp;C · e-mail automático, não precisa responder.</p>
  </div>`
  const texto = `Olá, ${primeiro}!\n\nSeus dados de acesso à plataforma da Assessoria J&C:\nLogin: ${email}\nSenha: ${senha}\n\nEntre em ${SITE}/ e troque a senha em Meu perfil.`

  if (GMAIL_USUARIO && GMAIL_SENHA) {
    try {
      const nodemailer = (await import('nodemailer')).default
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USUARIO, pass: GMAIL_SENHA } })
      await t.sendMail({ from: `Assessoria J&C <${GMAIL_USUARIO}>`, to: para, subject: assunto, html, text: texto })
      return true
    } catch (e) {
      console.error('Gmail:', e.message)
      return false
    }
  }
  if (!CHAVE) return false
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: DE, to: [para], subject: assunto, html, text: texto }),
    })
    if (!r.ok) console.error('Resend (boas-vindas):', r.status, await r.text().catch(() => ''))
    return r.ok
  } catch (e) {
    console.error('Resend (boas-vindas):', e.message)
    return false
  }
}
