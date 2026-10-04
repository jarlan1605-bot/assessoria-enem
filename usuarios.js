// Função do Vercel: cria contas, redefine senhas e remove contas.
// Só o CEO consegue usar. A chave secreta fica SÓ aqui no servidor
// (variável SUPABASE_SERVICE_ROLE_KEY no Vercel) e nunca vai para o navegador.
import { createClient } from '@supabase/supabase-js'

const URL_SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const CHAVE_SECRETA = process.env.SUPABASE_SERVICE_ROLE_KEY

const responder = (res, status, corpo) => res.status(status).json(corpo)
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não permitido.' })
  if (!URL_SUPABASE || !CHAVE_SECRETA) {
    return responder(res, 500, { erro: 'Falta configurar a variável SUPABASE_SERVICE_ROLE_KEY no Vercel.' })
  }

  const admin = createClient(URL_SUPABASE, CHAVE_SECRETA, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1) Quem está pedindo? Precisa estar logado e ser CEO.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return responder(res, 401, { erro: 'Faça login de novo.' })
  const { data: dadosUsuario, error: erroUsuario } = await admin.auth.getUser(token)
  const quem = dadosUsuario?.user
  if (erroUsuario || !quem) return responder(res, 401, { erro: 'Sessão expirada. Faça login de novo.' })

  const { data: eu } = await admin.from('perfis').select('papel').eq('id', quem.id).single()
  if (eu?.papel !== 'ceo') return responder(res, 403, { erro: 'Só o CEO pode fazer isso.' })

  let corpo = req.body
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo) } catch { corpo = {} }
  }
  corpo = corpo || {}

  try {
    // 2) Criar mentor ou aluno
    if (corpo.acao === 'criar') {
      const email = String(corpo.email || '').trim().toLowerCase()
      const senha = String(corpo.senha || '')
      const nome = String(corpo.nome || '').trim().slice(0, 80)
      const papel = corpo.papel === 'mentor' ? 'mentor' : 'aluno'

      if (!nome) return responder(res, 400, { erro: 'Coloque o nome.' })
      if (!emailValido(email)) return responder(res, 400, { erro: 'E-mail inválido.' })
      if (senha.length < 6) return responder(res, 400, { erro: 'A senha precisa ter pelo menos 6 caracteres.' })

      let mentorId = null
      if (papel === 'aluno') {
        mentorId = corpo.mentor_id || quem.id
        const { data: mentor } = await admin.from('perfis').select('papel').eq('id', mentorId).single()
        if (!mentor || !['mentor', 'ceo'].includes(mentor.papel)) {
          return responder(res, 400, { erro: 'Mentor responsável inválido.' })
        }
      }

      const { data: criado, error } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
      })
      if (error) {
        const ja = /already|registered|exists/i.test(error.message)
        return responder(res, 400, { erro: ja ? 'Já existe uma conta com esse e-mail.' : 'Não foi possível criar: ' + error.message })
      }

      const id = criado.user.id
      const dados = { nome, email, papel, mentor_id: mentorId }
      const limite = Number(corpo.limite_mensal)
      if (papel === 'aluno' && Number.isFinite(limite) && limite >= 0 && limite <= 60) dados.limite_mensal = limite

      // o perfil é criado automaticamente junto com a conta; aqui completamos os dados
      const { error: erroPerfil } = await admin.from('perfis').upsert({ id, ...dados })
      if (erroPerfil) {
        await admin.auth.admin.deleteUser(id)
        return responder(res, 500, { erro: 'Não foi possível salvar o perfil: ' + erroPerfil.message })
      }
      return responder(res, 200, { ok: true, id })
    }

    // 3) Redefinir senha de alguém
    if (corpo.acao === 'senha') {
      const senha = String(corpo.senha || '')
      if (!corpo.id) return responder(res, 400, { erro: 'Pessoa não informada.' })
      if (senha.length < 6) return responder(res, 400, { erro: 'A senha precisa ter pelo menos 6 caracteres.' })
      const { error } = await admin.auth.admin.updateUserById(corpo.id, { password: senha })
      if (error) return responder(res, 400, { erro: 'Não foi possível trocar a senha: ' + error.message })
      return responder(res, 200, { ok: true })
    }

    // 4) Remover conta (apaga horário e simulados do aluno)
    if (corpo.acao === 'excluir') {
      if (!corpo.id) return responder(res, 400, { erro: 'Pessoa não informada.' })
      if (corpo.id === quem.id) return responder(res, 400, { erro: 'Você não pode remover a própria conta.' })
      const { data: alvo } = await admin.from('perfis').select('papel').eq('id', corpo.id).single()
      if (alvo?.papel === 'ceo') return responder(res, 400, { erro: 'Não é possível remover um CEO por aqui.' })
      const { error } = await admin.auth.admin.deleteUser(corpo.id)
      if (error) return responder(res, 400, { erro: 'Não foi possível remover: ' + error.message })
      return responder(res, 200, { ok: true })
    }

    return responder(res, 400, { erro: 'Ação desconhecida.' })
  } catch (e) {
    return responder(res, 500, { erro: 'Erro inesperado: ' + (e?.message || e) })
  }
}
