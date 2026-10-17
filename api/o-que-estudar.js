// Função do Vercel: "Pergunte ao Claude: o que estudar?"
// Junta o caderno de erros (cruzado com a incidência no ENEM), o horário e os simulados
// do aluno e pede ao Claude uma resposta personalizada.
// Precisa da variável ANTHROPIC_API_KEY no Vercel (chave criada em console.anthropic.com).
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { FONTE, QUADRANTES, analisarErros, assuntoDoErro, normalizar, porProvaLegivel } from '../incidencia.js'

const URL_SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const CHAVE_PUBLICA = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const LIMITE_POR_DIA = 5 // perguntas por aluno a cada 24 horas
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const MOTIVOS = { descuido: 'descuido', conteudo: 'conteúdo', lacuna: 'lacuna (nunca estudou)', atencao: 'atenção', tempo: 'tempo', interpretacao: 'interpretação', chute: 'chute' }

const INSTRUCOES = `Você é o assistente de estudos de uma mentoria para o ENEM. Um aluno (ou o mentor dele) faz uma pergunta sobre o que estudar, e você responde usando os dados do aluno que vêm junto.

Como decidir:
- A base é o custo-benefício: assunto que cai muito no ENEM e que o aluno erra muito vem primeiro. Assunto que o aluno erra mas cai pouco pode esperar. Assunto que cai muito e ele erra pouco merece manutenção.
- Considere o tipo de erro: "conteúdo" e "lacuna" pedem teoria + questões; "descuido" pede treino de atenção e questões, não teoria.
- Se houver horário de estudos, encaixe as sugestões nos blocos que já existem (diga o dia e a matéria do bloco). Se faltar pouco para o ENEM, priorize revisão e questões em vez de conteúdo novo.
- Use só os dados recebidos. Não invente notas, erros ou datas. A incidência é uma média histórica, não uma garantia do que vai cair.

Como responder:
- Português do Brasil, direto, num tom de mentor que motiva sem exagerar. Fale com o aluno (ou, se quem pergunta é o mentor, fale com o mentor sobre o aluno).
- Use títulos curtos com "## ", listas com "- " e **negrito** só no essencial. Nada de tabelas.
- Seja concreto: assunto, o que fazer (ex.: "revise a teoria de X e faça 10 questões do ENEM de X") e por quê, em uma linha.
- Até umas 250 palavras. Um plano de semana pode ser um pouco maior.`

const responder = (res, status, corpo) => res.status(status).json(corpo)

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não permitido.' })
  if (!process.env.ANTHROPIC_API_KEY) {
    return responder(res, 500, { erro: 'Falta configurar a variável ANTHROPIC_API_KEY no Vercel.' })
  }
  if (!URL_SUPABASE || !CHAVE_PUBLICA) return responder(res, 500, { erro: 'Falta configurar o Supabase no Vercel.' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return responder(res, 401, { erro: 'Faça login de novo.' })

  // Cliente com o login de quem pergunta: as regras do banco decidem o que ele pode ver
  const db = createClient(URL_SUPABASE, CHAVE_PUBLICA, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: dadosUsuario, error: erroUsuario } = await db.auth.getUser(token)
  const quem = dadosUsuario?.user
  if (erroUsuario || !quem) return responder(res, 401, { erro: 'Sessão expirada. Faça login de novo.' })

  let corpo = req.body
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo) } catch { corpo = {} }
  }
  corpo = corpo || {}
  const alunoId = String(corpo.aluno_id || quem.id)
  const pergunta = String(corpo.pergunta || '').trim().slice(0, 500) || 'O que eu estudo hoje?'

  const [{ data: eu }, { data: aluno }] = await Promise.all([
    db.from('perfis').select('papel, nome').eq('id', quem.id).single(),
    db.from('perfis').select('id, nome').eq('id', alunoId).maybeSingle(),
  ])
  if (!aluno) return responder(res, 403, { erro: 'Você não tem acesso a este aluno.' })
  const ehMentor = eu?.papel === 'mentor' || eu?.papel === 'ceo'

  const umDiaAtras = new Date(Date.now() - 86400000).toISOString()
  const { count } = await db
    .from('sugestoes_estudo')
    .select('id', { count: 'exact', head: true })
    .eq('aluno_id', alunoId)
    .gte('criado_em', umDiaAtras)
  if ((count ?? 0) >= LIMITE_POR_DIA) {
    return responder(res, 429, { erro: `Limite de ${LIMITE_POR_DIA} perguntas por dia atingido. Amanhã tem mais!` })
  }

  const [erros, horario, simulados, config] = await Promise.all([
    db.from('erros').select('area, materia, assunto, motivo, dominado').eq('aluno_id', alunoId),
    db.from('horarios').select('dia, inicio, fim, materia, conteudo').eq('aluno_id', alunoId).order('dia').order('inicio'),
    db.from('simulados').select('data, nome, linguagens, humanas, natureza, matematica, redacao').eq('aluno_id', alunoId).order('data', { ascending: false }).limit(5),
    db.from('site_config').select('data_enem_1').eq('id', 1).maybeSingle(),
  ])

  const contexto = montarContexto({
    aluno,
    ehMentor,
    erros: erros.data ?? [],
    horario: horario.data ?? [],
    simulados: simulados.data ?? [],
    dataEnem: config.data?.data_enem_1,
  })

  const claude = new Anthropic({ timeout: 55_000, maxRetries: 1 })
  let resposta
  try {
    const msg = await claude.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: INSTRUCOES,
      messages: [{ role: 'user', content: `${contexto}\n\n<pergunta>\n${pergunta}\n</pergunta>` }],
    })
    if (msg.stop_reason === 'refusal') {
      return responder(res, 422, { erro: 'O Claude não conseguiu responder essa pergunta. Tente escrever de outro jeito.' })
    }
    resposta = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return responder(res, 500, { erro: 'A chave ANTHROPIC_API_KEY do Vercel é inválida.' })
    if (e instanceof Anthropic.RateLimitError) return responder(res, 503, { erro: 'O Claude está ocupado agora. Tente de novo em 1 minuto.' })
    if (e instanceof Anthropic.APIConnectionTimeoutError) return responder(res, 504, { erro: 'O Claude demorou demais. Tente de novo.' })
    if (e instanceof Anthropic.APIError) return responder(res, 502, { erro: `Erro ao falar com o Claude (${e.status ?? 'sem resposta'}). Tente de novo.` })
    throw e
  }
  if (!resposta) return responder(res, 502, { erro: 'O Claude não devolveu resposta. Tente de novo.' })

  const { error } = await db.from('sugestoes_estudo').insert({ aluno_id: alunoId, pergunta, resposta })
  if (error) return responder(res, 500, { erro: 'Não foi possível salvar a resposta: ' + error.message })
  return responder(res, 200, { resposta })
}

export function montarContexto({ aluno, ehMentor, erros, horario, simulados, dataEnem }) {
  const linhas = []
  const nome = (aluno.nome || 'aluno').split(' ')[0]
  linhas.push(`<aluno>${nome}</aluno>`)
  linhas.push(`<quem_pergunta>${ehMentor ? 'o mentor do aluno' : 'o próprio aluno'}</quem_pergunta>`)
  const hoje = new Date()
  linhas.push(`<hoje>${hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })}</hoje>`)
  if (dataEnem) {
    const dias = Math.ceil((new Date(dataEnem) - hoje) / 86400000)
    if (dias > 0) linhas.push(`<faltam_para_o_enem>${dias} dias</faltam_para_o_enem>`)
  }

  const { itens, semErro } = analisarErros(erros)
  linhas.push(`\n<caderno_de_erros fonte_incidencia="${FONTE}" total_de_erros="${erros.length}">`)
  if (!itens.length) linhas.push('Nenhum erro registrado ainda.')
  // Tipos de erro (descuido, conteúdo, lacuna) de cada assunto, só dos erros ainda abertos
  const motivosPorAssunto = {}
  for (const e of erros) {
    if (e.dominado || !e.motivo) continue
    const id = assuntoDoErro(e)?.id ?? `fora|${normalizar(e.assunto || e.materia).trim() || 'sem assunto'}`
    motivosPorAssunto[id] ??= {}
    motivosPorAssunto[id][e.motivo] = (motivosPorAssunto[id][e.motivo] || 0) + 1
  }
  for (const i of itens.slice(0, 25)) {
    const textoMotivos = Object.entries(motivosPorAssunto[i.id] || {}).map(([k, n]) => `${MOTIVOS[k] || k}: ${n}`).join(', ')
    linhas.push(
      `- [${QUADRANTES[i.quadrante].nome}] ${i.nome} (${i.materia}) · incidência: ${porProvaLegivel(i.porProva)} · erros abertos: ${i.abertos} · dominados: ${i.dominados}` +
        (textoMotivos ? ` · tipos: ${textoMotivos}` : '') +
        (i.exemplos.length ? ` · como o aluno escreveu: ${i.exemplos.join('; ')}` : '')
    )
  }
  linhas.push('</caderno_de_erros>')
  if (semErro.length) {
    linhas.push(`\n<caem_muito_sem_erro_registrado>\n${semErro.slice(0, 12).map((a) => `- ${a.nome} (${a.materia}) · ${porProvaLegivel(a.porProva)}`).join('\n')}\n</caem_muito_sem_erro_registrado>`)
  }

  linhas.push('\n<horario_de_estudos>')
  if (!horario.length) linhas.push('O aluno ainda não tem horário montado.')
  for (const h of horario) {
    linhas.push(`- ${DIAS[h.dia]} ${h.inicio.slice(0, 5)}–${h.fim.slice(0, 5)}: ${h.materia}${h.conteudo ? ` (${h.conteudo})` : ''}`)
  }
  linhas.push('</horario_de_estudos>')

  linhas.push('\n<ultimos_simulados acertos_de_0_a_45_por_area>')
  if (!simulados.length) linhas.push('Nenhum simulado lançado.')
  for (const s of simulados) {
    const partes = [['Linguagens', s.linguagens], ['Humanas', s.humanas], ['Natureza', s.natureza], ['Matemática', s.matematica]]
      .filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`)
    if (s.redacao != null) partes.push(`Redação ${s.redacao}`)
    linhas.push(`- ${s.data}${s.nome ? ` ${s.nome}` : ''}: ${partes.join(', ')}`)
  }
  linhas.push('</ultimos_simulados>')
  return linhas.join('\n')
}
