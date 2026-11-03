// Função do Vercel: inscrição com pagamento único pelo Mercado Pago.
// 1) "criar": salva a inscrição e devolve o link de pagamento do Mercado Pago só dela.
// 2) "status": confere no Mercado Pago se a inscrição foi paga e lista os assessores disponíveis.
// 3) "escolher": com o pagamento aprovado, cria a conta do aluno (senha aleatória) e vincula ao assessor.
// O id da inscrição só é conhecido por quem preencheu o formulário (vai no link de volta do pagamento).
// Variáveis no Vercel: SUPABASE_SERVICE_ROLE_KEY e MP_ACCESS_TOKEN (VALOR_INSCRICAO é opcional, padrão 1800).
import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { avisarEquipe } from './_email.js'
import { mpConfigurado, criarPagamentoInscricao, conferirInscricao, urlDoSite, VALOR_INSCRICAO } from './_mercadopago.js'

const URL_SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const CHAVE_SECRETA = process.env.SUPABASE_SERVICE_ROLE_KEY
const responder = (res, status, corpo) => res.status(status).json(corpo)
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const uuidValido = (t) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(t || ''))
const texto = (v, max) => String(v ?? '').trim().slice(0, max)

// Senha fácil de digitar no celular (sem letras que se confundem)
function senhaAleatoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz'
  const numeros = '23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += letras[randomInt(letras.length)]
  for (let i = 0; i < 4; i++) s += numeros[randomInt(numeros.length)]
  return s
}

// Assessores que aparecem para o aluno escolher: os da página de mentores com vagas abertas.
// Se ninguém preencheu a página de mentores ainda, mostra toda a equipe.
async function assessoresDisponiveis(admin) {
  const { data } = await admin.from('perfis').select('id, nome, foto_url, papel, vitrine, disponivel, caracteristicas, legenda').in('papel', ['mentor', 'ceo']).order('criado_em')
  const equipe = data ?? []
  const vitrine = equipe.filter((m) => m.vitrine && m.disponivel)
  return (vitrine.length ? vitrine : equipe).map((m) => ({
    id: m.id, nome: m.nome, foto_url: m.foto_url, caracteristicas: m.caracteristicas ?? [], legenda: m.legenda ?? '',
  }))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não permitido.' })
  if (!URL_SUPABASE || !CHAVE_SECRETA) return responder(res, 500, { erro: 'Falta a variável SUPABASE_SERVICE_ROLE_KEY no Vercel.' })
  const admin = createClient(URL_SUPABASE, CHAVE_SECRETA, { auth: { persistSession: false, autoRefreshToken: false } })

  let corpo = req.body
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo) } catch { corpo = {} } }
  corpo = corpo || {}

  try {
    // ---------- 1) Nova inscrição ----------
    if (corpo.acao === 'criar') {
      if (!mpConfigurado()) return responder(res, 503, { erro: 'O pagamento on-line ainda não foi ativado. Fale com a gente pelo WhatsApp.' })
      if (corpo.site) return responder(res, 200, { ok: true }) // campo escondido: robô
      const nome = texto(corpo.nome, 100)
      const email = texto(corpo.email, 120).toLowerCase()
      const zap = String(corpo.whatsapp || '').replace(/\D/g, '')
      if (nome.length < 2) return responder(res, 400, { erro: 'Coloque o seu nome.' })
      if (!emailValido(email)) return responder(res, 400, { erro: 'Coloque um e-mail válido. É com ele que você vai entrar na plataforma.' })
      if (zap.length < 10 || zap.length > 13) return responder(res, 400, { erro: 'Coloque um WhatsApp com DDD.' })
      if (!texto(corpo.situacao, 60)) return responder(res, 400, { erro: 'Conte em que fase dos estudos você está.' })

      const { data: ja } = await admin.from('perfis').select('id').eq('email', email).maybeSingle()
      if (ja) return responder(res, 400, { erro: 'Já existe uma conta com esse e-mail. Se você já é aluno, entre pela Área do aluno.' })

      const idade = Number(corpo.idade)
      const { data: ins, error } = await admin.from('interessados').insert({
        nome, email, whatsapp: zap,
        idade: idade >= 10 && idade <= 80 ? idade : null,
        cidade: texto(corpo.cidade, 80), situacao: texto(corpo.situacao, 60), curso: texto(corpo.curso, 80),
        dificuldade: texto(corpo.dificuldade, 120), como_conheceu: texto(corpo.como_conheceu, 60),
        responsavel: texto(corpo.responsavel, 100), mensagem: texto(corpo.mensagem, 600),
        valor: VALOR_INSCRICAO,
      }).select('id, nome, email').single()
      if (error) return responder(res, 500, { erro: 'Não foi possível salvar a inscrição: ' + error.message })

      const site = urlDoSite(req)
      const fone = zap.length >= 12 ? zap : '55' + zap
      await avisarEquipe({
        assunto: `📝 Nova inscrição: ${nome}`,
        titulo: `${nome} quer entrar na assessoria!`,
        linhas: [['WhatsApp', zap], ['E-mail', email], ['Fase', texto(corpo.situacao, 60)], ['Curso', texto(corpo.curso, 80)], ['Cidade', texto(corpo.cidade, 80)], ['Precisa de ajuda em', texto(corpo.dificuldade, 120)], ['Como conheceu', texto(corpo.como_conheceu, 60)], ['Mensagem', texto(corpo.mensagem, 600)], ['Situação', 'foi para o pagamento (ainda não pagou)']],
        botao: { texto: 'Chamar no WhatsApp', link: `https://wa.me/${fone}?text=${encodeURIComponent(`Olá, ${nome.split(' ')[0]}! Aqui é da Assessoria J&C 😊`)}` },
      })
      const { preferencia, link } = await criarPagamentoInscricao({ inscricao: ins, urlSite: site })
      await admin.from('interessados').update({ mp_preferencia: preferencia, link_pagamento: link }).eq('id', ins.id)
      return responder(res, 200, { id: ins.id, link })
    }

    if (!uuidValido(corpo.id)) return responder(res, 400, { erro: 'Inscrição não encontrada.' })

    // ---------- 2) Situação da inscrição ----------
    if (corpo.acao === 'status') {
      const st = mpConfigurado() ? await conferirInscricao(admin, corpo.id) : { existe: true }
      const { data: ins } = await admin.from('interessados').select('nome, email, pago, link_pagamento, aluno_id, mentor_id').eq('id', corpo.id).maybeSingle()
      if (!ins) return responder(res, 404, { erro: 'Inscrição não encontrada.' })
      const resposta = {
        nome: ins.nome.split(' ')[0], email: ins.email, pago: ins.pago, pendente: !!st.pendente,
        link: ins.pago ? '' : ins.link_pagamento, contaCriada: !!ins.aluno_id, valor: VALOR_INSCRICAO,
      }
      if (ins.pago && !ins.aluno_id) resposta.assessores = await assessoresDisponiveis(admin)
      if (ins.mentor_id) {
        const { data: m } = await admin.from('perfis').select('nome').eq('id', ins.mentor_id).maybeSingle()
        resposta.assessor = m?.nome || ''
      }
      return responder(res, 200, resposta)
    }

    // ---------- 3) Escolher o assessor e criar a conta ----------
    if (corpo.acao === 'escolher') {
      const { data: ins } = await admin.from('interessados').select('*').eq('id', corpo.id).maybeSingle()
      if (!ins) return responder(res, 404, { erro: 'Inscrição não encontrada.' })
      if (!ins.pago) {
        const st = await conferirInscricao(admin, ins.id)
        if (!st.pago) return responder(res, 402, { erro: 'O pagamento ainda não foi confirmado.' })
      }
      if (ins.aluno_id) return responder(res, 409, { erro: 'A sua conta já foi criada. Entre pela Área do aluno com o seu e-mail.' })

      const assessores = await assessoresDisponiveis(admin)
      const escolhido = assessores.find((a) => a.id === corpo.mentor_id)
      if (!escolhido) return responder(res, 400, { erro: 'Escolha um dos assessores da lista.' })

      // marca a inscrição antes de criar a conta: se o botão for clicado duas vezes, a segunda para aqui
      const { data: travada } = await admin.from('interessados').update({ mentor_id: escolhido.id }).eq('id', ins.id).is('aluno_id', null).is('mentor_id', null).select('id')
      if (!travada?.length) return responder(res, 409, { erro: 'A escolha já foi feita. Se a conta não apareceu, fale com a gente pelo WhatsApp.' })

      const senha = senhaAleatoria()
      const { data: criado, error } = await admin.auth.admin.createUser({ email: ins.email, password: senha, email_confirm: true, user_metadata: { nome: ins.nome } })
      if (error) {
        await admin.from('interessados').update({ mentor_id: null }).eq('id', ins.id)
        const ja = /already|registered|exists/i.test(error.message)
        return responder(res, 400, { erro: ja ? 'Já existe uma conta com esse e-mail. Fale com a gente pelo WhatsApp que a gente resolve.' : 'Não foi possível criar a conta: ' + error.message })
      }
      const id = criado.user.id
      const { error: erroPerfil } = await admin.from('perfis').upsert({ id, nome: ins.nome.slice(0, 80), email: ins.email, papel: 'aluno', mentor_id: escolhido.id })
      if (erroPerfil) {
        await admin.auth.admin.deleteUser(id)
        await admin.from('interessados').update({ mentor_id: null }).eq('id', ins.id)
        return responder(res, 500, { erro: 'Não foi possível salvar o perfil: ' + erroPerfil.message })
      }
      await admin.from('interessados').update({ aluno_id: id, status: 'matriculado' }).eq('id', ins.id)
      return responder(res, 200, { ok: true, email: ins.email, senha, assessor: escolhido.nome })
    }

    return responder(res, 400, { erro: 'Ação desconhecida.' })
  } catch (e) {
    return responder(res, 500, { erro: e.message })
  }
}
