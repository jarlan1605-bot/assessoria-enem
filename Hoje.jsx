import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { hojeISO, somarDias } from './agenda'
import {
  saudacao, dataPorExtenso, primeiroNome, montarMissoes, minutosTexto, fortesEFracas,
  conferirTudo, soltarConfete, compartilharImagem,
} from './estudo'
import { cartaoDia, cartaoSemana } from './cartoesStory'
import { corDaMateria } from './constants'

const DIAS_SEMANA = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
const diaBR = (iso) => hojeISO(new Date(iso))

// Posição do aluno no ranking de XP e quanto falta para passar o próximo
function posicaoNoRanking(lista, alunoId) {
  const i = lista.findIndex((l) => l.aluno_id === alunoId)
  if (i < 0) return { pos: null, total: lista.length, xp: 0, top: lista.slice(0, 3) }
  const eu = lista[i]
  const acima = i > 0 ? lista[i - 1] : null
  return { pos: i + 1, total: lista.length, xp: Number(eu.xp), falta: acima ? Number(acima.xp) - Number(eu.xp) + 1 : 0, acima: acima?.nome || null, top: lista.slice(0, 3) }
}

// Números do mês: questões, acerto, foco e em quais dias estudou
function resumoDoMes(resp, foco, checks, mesIni) {
  const dias = new Set()
  const porDia = {}
  for (const r of resp) { const d = diaBR(r.criado_em); porDia[d] = (porDia[d] || 0) + 1 }
  for (const [d, n] of Object.entries(porDia)) if (n >= 10) dias.add(d)
  for (const c of checks) dias.add(c.dia)
  for (const f of foco) dias.add(diaBR(f.criado_em))
  const hoje = hojeISO()
  const ultimoDia = new Date(Number(mesIni.slice(0, 4)), Number(mesIni.slice(5, 7)), 0).getDate()
  return {
    questoes: resp.length,
    acertos: resp.filter((r) => r.correta).length,
    focoMin: foco.reduce((s, x) => s + x.minutos, 0),
    dias: [...dias].filter((d) => d.startsWith(mesIni.slice(0, 8))),
    diasPassados: Number(hoje.slice(8, 10)),
    ultimoDia,
    mesIni,
  }
}

// Tela "Hoje": a tela inicial do aluno (o mentor também vê a do aluno escolhido)
export default function Hoje({ alunoId, aluno, ehMentor, irPara, config }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [bonus, setBonus] = useState(false)

  const carregar = useCallback(async () => {
    const segunda = (() => { const h = hojeISO(); const d = new Date(h + 'T12:00:00'); return somarDias(h, -((d.getDay() + 6) % 7)) })()
    const desdeSeg = new Date(segunda + 'T00:00:00-03:00').toISOString()
    const hoje = hojeISO()
    const mesIni = hoje.slice(0, 8) + '01'
    const desdeMes = new Date(mesIni + 'T00:00:00-03:00').toISOString()
    const diaSemana = (new Date(hoje + 'T12:00:00').getDay() + 6) % 7 // 0 = segunda
    const [resumo, ofensiva, desemp, lista, semQ, semF, semM, rkSem, rkMes, mesResp, mesFoco, mesCheck, blocosHoje, checkHoje, estudo] = await Promise.all([
      supabase.rpc('resumo_dia', { p_aluno: alunoId }),
      supabase.rpc('ofensiva', { p_aluno: alunoId }),
      supabase.rpc('desempenho_materias', { p_aluno: alunoId }),
      supabase.from('lista_alunos').select('lista_id, ultima_em, listas(titulo)').eq('aluno_id', alunoId).is('concluida_em', null).not('ultima_em', 'is', null).order('ultima_em', { ascending: false }).limit(1),
      supabase.from('respostas').select('id', { count: 'exact', head: true }).eq('aluno_id', alunoId).gte('criado_em', desdeSeg),
      supabase.from('sessoes_foco').select('minutos').eq('aluno_id', alunoId).gte('criado_em', desdeSeg),
      supabase.from('missoes_dia').select('dia').eq('aluno_id', alunoId).eq('completo', true).gte('dia', segunda),
      supabase.rpc('ranking_xp', { p_desde: desdeSeg }),
      supabase.rpc('ranking_xp', { p_desde: desdeMes }),
      supabase.from('respostas').select('criado_em, correta').eq('aluno_id', alunoId).gte('criado_em', desdeMes).limit(10000),
      supabase.from('sessoes_foco').select('minutos, criado_em').eq('aluno_id', alunoId).gte('criado_em', desdeMes),
      supabase.from('checkins').select('dia').eq('aluno_id', alunoId).gte('dia', mesIni).in('status', ['feito', 'parcial']),
      supabase.from('horarios').select('id, inicio, fim, materia, conteudo, conta_estudo').eq('aluno_id', alunoId).eq('mes', mesIni).eq('dia', diaSemana).order('inicio'),
      supabase.from('checkins').select('horario_id, status').eq('aluno_id', alunoId).eq('dia', hoje),
      supabase.rpc('estudo_hoje', { p_aluno: alunoId }),
    ])
    if (resumo.error || !resumo.data) {
      setErro(resumo.error?.message?.includes('resumo_dia') || resumo.error?.code === 'PGRST202'
        ? 'A tela Hoje ainda não foi ativada no banco (arquivo gamificacao.sql).'
        : 'Não foi possível carregar o seu dia. Verifique a internet e tente de novo.')
      return
    }
    setErro('')
    setDados({
      resumo: resumo.data,
      ofensiva: ofensiva.data || { atual: 0, recorde: 0, hoje_contou: false, semana: [] },
      desempenho: desemp.data ?? [],
      ultimaLista: lista.data?.[0] || null,
      semana: { questoes: semQ.count ?? 0, focoMin: (semF.data ?? []).reduce((s, x) => s + x.minutos, 0), completos: (semM.data ?? []).length },
      estudoMin: estudo.data?.minutos ?? null,
      ranking: { semana: posicaoNoRanking(rkSem.data ?? [], alunoId), mes: posicaoNoRanking(rkMes.data ?? [], alunoId) },
      mes: resumoDoMes(mesResp.data ?? [], mesFoco.data ?? [], mesCheck.data ?? [], mesIni),
      horario: (() => {
        const st = Object.fromEntries((checkHoje.data ?? []).map((c) => [c.horario_id, c.status]))
        return (blocosHoje.data ?? []).map((b) => ({ ...b, inicio: b.inicio.slice(0, 5), fim: b.fim.slice(0, 5), status: st[b.id] || null }))
      })(),
    })
  }, [alunoId])

  useEffect(() => { carregar() }, [carregar])

  async function marcarBloco(m) {
    if (ehMentor) return
    const dia = hojeISO()
    const { error } = m.feita
      ? await supabase.from('checkins').delete().eq('horario_id', m.horarioId).eq('dia', dia)
      : await supabase.from('checkins').upsert({ aluno_id: alunoId, horario_id: m.horarioId, dia, status: 'feito' }, { onConflict: 'horario_id,dia' })
    if (error) return setErro('Não foi possível marcar: ' + error.message)
    await depoisDeAgir()
  }

  async function depoisDeAgir() {
    const r = await conferirTudo(alunoId)
    if (r.fim?.bonus_novo) { setBonus(true); soltarConfete() }
    await carregar()
  }

  async function salvarMetas(meta_questoes_dia, meta_foco_min) {
    const { error } = await supabase.from('perfis').update({ meta_questoes_dia, meta_foco_min }).eq('id', alunoId)
    if (error) return setErro('Não foi possível salvar as metas: ' + error.message)
    carregar()
  }

  if (erro && !dados) return <div className="cartao vazio" role="alert"><h2>Ops</h2><p>{erro}</p><button className="botao primario" onClick={carregar}>Tentar de novo</button></div>
  if (!dados) return <div className="hoje-esqueleto" aria-label="Carregando o seu dia"><div /><div /><div /></div>

  return (
    <HojeVisao
      dados={dados} aluno={aluno} ehMentor={ehMentor} config={config} erro={erro} bonus={bonus}
      onMarcarBloco={marcarBloco} irPara={irPara} onSalvarMetas={salvarMetas}
    />
  )
}

// Só a tela (recebe os dados prontos)
export function HojeVisao({ dados, aluno, ehMentor, config, erro, bonus, onMarcarBloco, irPara, onSalvarMetas, domingo }) {
  const r = dados.resumo
  const missoes = montarMissoes(r)
  const feitas = missoes.filter((m) => m.feita).length
  const nome = primeiroNome(aluno?.nome)
  const enem = config?.data_enem_1 ? Math.ceil((new Date(config.data_enem_1) - new Date()) / 864e5) : null
  const proximo = missoes.find((m) => m.tipo === 'bloco' && !m.feita)
  const ehDomingo = domingo ?? new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' }) === 'Sun'
  const [gerando, setGerando] = useState('')

  async function compartilhar(tipo) {
    setGerando(tipo)
    try {
      const o = dados.ofensiva
      const blob = tipo === 'semana'
        ? await cartaoSemana({ nome: aluno?.nome, focoMin: dados.semana.focoMin, questoes: dados.semana.questoes, dias: o.semana, ofensiva: o.atual, completos: dados.semana.completos })
        : await cartaoDia({ nome: aluno?.nome, feitas, total: missoes.length, focoMin: r.foco_min, questoes: r.questoes, ofensiva: o.atual, dataTexto: dataPorExtenso() })
      await compartilharImagem(blob, tipo === 'semana' ? 'minha-semana-jc.png' : 'meu-dia-jc.png', '#AssessoriaJC')
    } finally { setGerando('') }
  }

  return (
    <section className="secao hoje">
      <header className="hoje-ola">
        <h1>{ehMentor ? 'O dia de ' : `${saudacao()}, `}<em>{nome}</em></h1>
        <p className="suave">
          {dataPorExtenso()}
          {enem !== null && enem > 0 && <> · <b className="hoje-enem">faltam {enem} dias para o ENEM</b></>}
        </p>
      </header>
      {erro && <p className="erro" role="alert">{erro}</p>}

      {bonus && (
        <div className="hoje-bonus" role="status">
          <span aria-hidden="true">🎉</span>
          <div><strong>Todas as missões de hoje!</strong><span>+40 XP de bônus. Que dia!</span></div>
          <button className="botao pequeno" onClick={() => compartilhar('dia')} disabled={!!gerando}>Postar no story</button>
        </div>
      )}

      <ResumoRapido o={dados.ofensiva} rk={dados.ranking?.semana} feitas={feitas} total={missoes.length} xp={r.xp} estudoMin={dados.estudoMin} irPara={irPara} />

      <ContinuarCartao proximo={proximo} lista={dados.ultimaLista} irPara={irPara} ehMentor={ehMentor} />

      <div className="cartao hoje-missoes">
        <div className="hoje-missoes-topo">
          <div>
            <span className="hoje-kicker">Missões do dia</span>
            <h2><b>{feitas}</b> de {missoes.length} missões</h2>
          </div>
          <span className="hoje-xp">⚡ +{r.xp} XP hoje</span>
        </div>
        <div className="hoje-barra" role="progressbar" aria-valuemin={0} aria-valuemax={missoes.length} aria-valuenow={feitas}>
          <i style={{ width: `${(feitas / Math.max(1, missoes.length)) * 100}%` }} />
        </div>
        {!r.blocos.length && <p className="suave pequeno">Sem blocos no horário de hoje. {ehMentor ? 'Monte o horário na aba Horário.' : 'Seu mentor monta o horário; enquanto isso, cumpra as missões fixas.'}</p>}
        <ul className="missoes">
          {missoes.map((m) => (
            <li key={m.id} className={m.feita ? 'missao feita' : 'missao'}>
              {m.tipo === 'bloco' ? (
                <button className="missao-check" onClick={() => onMarcarBloco?.(m)} disabled={ehMentor} aria-pressed={m.feita} aria-label={m.feita ? `Desmarcar ${m.titulo}` : `Marcar ${m.titulo} como feito`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
                </button>
              ) : (
                <span className={m.feita ? 'missao-check auto feita' : 'missao-check auto'} aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
                </span>
              )}
              <div className="missao-texto">
                <strong>{m.titulo}</strong>
                <span>{m.detalhe}</span>
                {m.pct !== undefined && !m.feita && <i className="missao-mini"><b style={{ width: `${Math.min(100, m.pct * 100)}%` }} /></i>}
              </div>
              {!ehMentor && !m.feita && m.tipo !== 'bloco' && (
                <button className="botao pequeno" onClick={() => irPara?.({ questoes: 'questoes', foco: 'foco', revisao: 'erros' }[m.tipo])}>
                  {{ questoes: 'Resolver', foco: 'Focar', revisao: 'Revisar' }[m.tipo]}
                </button>
              )}
            </li>
          ))}
        </ul>
        {ehMentor && onSalvarMetas && <MetasDoAluno r={r} onSalvar={onSalvarMetas} />}
      </div>

      {dados.horario && <HorarioHoje blocos={dados.horario} irPara={irPara} />}

      <OfensivaCartao o={dados.ofensiva} />

      <div className="hoje-duplo">
        {dados.ranking && <RankingCartao rk={dados.ranking} irPara={irPara} ehMentor={ehMentor} />}
        {dados.mes && <MesCartao m={dados.mes} xpMes={dados.ranking?.mes?.xp ?? 0} />}
      </div>

      <AnelQuestoes linhas={dados.desempenho} />

      {!ehMentor && (
        <div className="hoje-compartilhar">
          <button className="botao primario" onClick={() => compartilhar('dia')} disabled={!!gerando}>{gerando === 'dia' ? 'Gerando…' : '📲 Compartilhar meu dia'}</button>
          {ehDomingo && <button className="botao" onClick={() => compartilhar('semana')} disabled={!!gerando}>{gerando === 'semana' ? 'Gerando…' : '🗓️ Resumo da semana'}</button>}
        </div>
      )}
    </section>
  )
}

function ContinuarCartao({ proximo, lista, irPara, ehMentor }) {
  const abrirFoco = () => {
    try { sessionStorage.setItem('focoMateria', proximo?.materia || '') } catch { /* ok */ }
    irPara?.('foco')
  }
  const abrirLista = () => {
    try { sessionStorage.setItem('abrirLista', lista.lista_id) } catch { /* ok */ }
    irPara?.('listas')
  }
  if (!proximo && !lista) {
    return (
      <div className="hoje-destaque">
        <span className="hoje-kicker">Continuar de onde parou</span>
        <h2>Horário de hoje <em>em dia</em> ✓</h2>
        <p>Que tal uma sessão de foco ou algumas questões extras?</p>
        {!ehMentor && <button className="botao lima" onClick={() => irPara?.('foco')}>Começar foco</button>}
      </div>
    )
  }
  return (
    <div className="hoje-destaque">
      <span className="hoje-kicker">Continuar de onde parou</span>
      {proximo ? (
        <>
          <h2>{proximo.titulo}</h2>
          <p>{proximo.detalhe}</p>
          {!ehMentor && <button className="botao lima" onClick={abrirFoco}>▶ Começar foco nesse bloco</button>}
        </>
      ) : (
        <>
          <h2>{lista.listas?.titulo || 'Sua lista'}</h2>
          <p>Lista de questões em andamento</p>
          {!ehMentor && <button className="botao lima" onClick={abrirLista}>▶ Continuar a lista</button>}
        </>
      )}
    </div>
  )
}

export function OfensivaCartao({ o }) {
  const hojeIdx = (new Date(hojeISO() + 'T12:00:00').getDay() + 6) % 7
  return (
    <div className={o.atual > 0 ? 'cartao ofensiva ativa' : 'cartao ofensiva'}>
      <div className="ofensiva-chama" aria-hidden="true">🔥</div>
      <div className="ofensiva-texto">
        <strong><b>{o.atual}</b> {o.atual === 1 ? 'dia seguido' : 'dias seguidos'}</strong>
        <span>Recorde: {o.recorde} {o.recorde === 1 ? 'dia' : 'dias'}</span>
      </div>
      <ol className="ofensiva-semana" aria-label="Dias estudados nesta semana">
        {DIAS_SEMANA.map((d, i) => (
          <li key={i} className={[o.semana?.[i] ? 'ok' : '', i === hojeIdx ? 'hoje' : ''].join(' ')} aria-label={`${d}: ${o.semana?.[i] ? 'estudou' : 'não estudou'}`}>{d}</li>
        ))}
      </ol>
      {!o.hoje_contou && <p className="ofensiva-alerta">⚠️ Hoje ainda não contou. Faça uma missão ou 10 questões para não perder sua ofensiva!</p>}
    </div>
  )
}

// Anel de questões + 3 matérias mais fortes e 3 mais fracas
export function AnelQuestoes({ linhas }) {
  const total = linhas.reduce((s, x) => s + Number(x.total), 0)
  const acertos = linhas.reduce((s, x) => s + Number(x.acertos), 0)
  const pct = total ? Math.round((acertos / total) * 100) : 0
  const { fortes, fracas } = fortesEFracas(linhas.map((x) => ({ ...x, total: Number(x.total), acertos: Number(x.acertos) })))
  const R = 52
  const C = 2 * Math.PI * R
  return (
    <div className="cartao anel-cartao">
      <span className="hoje-kicker">Painel de questões</span>
      <div className="anel-linha">
        <svg className="anel" viewBox="0 0 128 128" role="img" aria-label={`${pct}% de acerto em ${total} questões`}>
          <circle cx="64" cy="64" r={R} className="anel-fundo" />
          <circle cx="64" cy="64" r={R} className="anel-valor" style={{ strokeDasharray: C, '--fim': C - (C * pct) / 100 }} />
          <text x="64" y="62" textAnchor="middle" className="anel-pct">{pct}%</text>
          <text x="64" y="82" textAnchor="middle" className="anel-legenda">de acerto</text>
        </svg>
        <dl className="anel-numeros">
          <div><dt>Feitas</dt><dd>{total.toLocaleString('pt-BR')}</dd></div>
          <div className="certo"><dt>Acertos</dt><dd>{acertos.toLocaleString('pt-BR')}</dd></div>
          <div className="errado"><dt>Erros</dt><dd>{(total - acertos).toLocaleString('pt-BR')}</dd></div>
        </dl>
      </div>
      {total > 0 && (fortes.length > 0 || fracas.length > 0) ? (
        <div className="anel-materias">
          <div>
            <h3>💪 Mais fortes</h3>
            <ul>{fortes.map((m) => <li key={m.materia}><span>{m.materia}</span><b>{m.pct}%</b></li>)}</ul>
          </div>
          <div>
            <h3>🎯 Para reforçar</h3>
            <ul>{fracas.map((m) => <li key={m.materia}><span>{m.materia}</span><b>{m.pct}%</b></li>)}</ul>
          </div>
        </div>
      ) : (
        <p className="suave pequeno">Resolva pelo menos 3 questões de uma matéria para ver suas mais fortes e as que precisam de reforço.</p>
      )}
    </div>
  )
}

function MetasDoAluno({ r, onSalvar }) {
  const [q, setQ] = useState(r.meta_questoes)
  const [f, setF] = useState(r.meta_foco)
  return (
    <form className="hoje-metas" onSubmit={(e) => { e.preventDefault(); onSalvar(Number(q), Number(f)) }}>
      <span className="hoje-kicker">Metas diárias deste aluno</span>
      <label>Questões por dia<input type="number" min="1" max="500" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <label>Minutos de foco<input type="number" min="5" max="600" step="5" value={f} onChange={(e) => setF(e.target.value)} /></label>
      <button className="botao primario pequeno">Salvar metas</button>
    </form>
  )
}

// Olhada rápida: os 4 números que mais importam hoje
function ResumoRapido({ o, rk, feitas, total, xp, estudoMin, irPara }) {
  const itens = [
    { k: 'ofensiva', icone: '🔥', valor: o.atual, rotulo: o.atual === 1 ? 'dia seguido' : 'dias seguidos', alerta: !o.hoje_contou },
    { k: 'missoes', icone: '🎯', valor: `${feitas}/${total}`, rotulo: 'missões hoje' },
    { k: 'ranking', icone: '🏆', valor: rk?.pos ? `${rk.pos}º` : '–', rotulo: 'na semana', ir: 'ranking' },
    estudoMin !== null && estudoMin !== undefined
      ? { k: 'estudo', icone: '⏱️', valor: minutosTexto(estudoMin), rotulo: 'estudo hoje' }
      : { k: 'xp', icone: '⚡', valor: `+${xp}`, rotulo: 'XP hoje' },
  ]
  return (
    <ul className="resumo-rapido" aria-label="Resumo de hoje">
      {itens.map((i) => (
        <li key={i.k} className={i.alerta ? 'alerta' : ''}>
          {i.ir ? (
            <button onClick={() => irPara?.(i.ir)}><span aria-hidden="true">{i.icone}</span><b>{i.valor}</b><small>{i.rotulo}</small></button>
          ) : (
            <div><span aria-hidden="true">{i.icone}</span><b>{i.valor}</b><small>{i.rotulo}</small></div>
          )}
        </li>
      ))}
    </ul>
  )
}

// Horário de hoje em linha do tempo, com o "agora" marcado
export function HorarioHoje({ blocos, irPara, agora = new Date() }) {
  const min = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
  const hora = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const atual = hora.getHours() * 60 + hora.getMinutes()
  return (
    <div className="cartao horario-hoje">
      <div className="hoje-missoes-topo">
        <div><span className="hoje-kicker">Horário de hoje</span><h2>{blocos.length ? `${blocos.length} ${blocos.length === 1 ? 'bloco' : 'blocos'} no seu dia` : 'Dia livre no horário'}</h2></div>
        <button className="botao pequeno" onClick={() => irPara?.('horario')}>Ver semana</button>
      </div>
      {!blocos.length ? (
        <p className="suave pequeno">Seu mentor ainda não colocou blocos para hoje. Aproveite para fazer questões ou uma sessão de foco.</p>
      ) : (
        <ol className="linha-tempo">
          {blocos.map((b) => {
            const estado = b.status === 'feito' ? 'feito' : atual >= min(b.inicio) && atual < min(b.fim) ? 'agora' : atual >= min(b.fim) ? 'passou' : 'depois'
            return (
              <li key={b.id} className={`lt-item ${estado}`} style={{ '--cor': corDaMateria(b.materia) }}>
                <span className="lt-hora">{b.inicio}<small>{b.fim}</small></span>
                <span className="lt-ponto" aria-hidden="true" />
                <div className="lt-texto">
                  <strong>{b.materia}{estado === 'agora' && <em className="lt-agora">agora</em>}{estado === 'feito' && <em className="lt-feito">✓ feito</em>}</strong>
                  {b.conteudo && <span>{b.conteudo}</span>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

// Ranking: posição na semana, quanto falta para subir e posição no mês
export function RankingCartao({ rk, irPara, ehMentor }) {
  const s = rk.semana
  return (
    <div className="cartao ranking-cartao">
      <span className="hoje-kicker">Ranking de XP</span>
      {s.pos ? (
        <>
          <h2 className="ranking-pos"><b>{s.pos}º</b> <span>de {s.total} na semana</span></h2>
          <p className="suave pequeno">
            {s.pos === 1 ? (ehMentor ? 'Lidera a semana! 👑' : 'Você lidera a semana! Segure a coroa 👑') : `Faltam ${s.falta} XP para passar ${s.acima}.`}
            {rk.mes.pos ? ` · ${rk.mes.pos}º no mês` : ''}
          </p>
        </>
      ) : <p className="suave">Ainda sem pontos nesta semana.</p>}
      <ol className="ranking-mini">
        {s.top.map((l, i) => (
          <li key={l.aluno_id}><span>{['🥇', '🥈', '🥉'][i]}</span><span className="rm-nome">{l.nome}</span><b>{Number(l.xp).toLocaleString('pt-BR')} XP</b></li>
        ))}
      </ol>
      <button className="link" onClick={() => irPara?.('ranking')}>Ver ranking completo →</button>
    </div>
  )
}

// O mês: números e um calendário com os dias em que estudou
export function MesCartao({ m, xpMes }) {
  const nome = new Date(m.mesIni + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long' })
  const pct = m.questoes ? Math.round((m.acertos / m.questoes) * 100) : null
  const primeiroDiaSemana = (new Date(m.mesIni + 'T12:00:00').getDay() + 6) % 7
  const estudou = new Set(m.dias)
  const hoje = hojeISO()
  return (
    <div className="cartao mes-cartao">
      <span className="hoje-kicker">Seu mês · {nome}</span>
      <h2><b>{m.dias.length}</b> de {m.diasPassados} dias estudados</h2>
      <dl className="mes-numeros">
        <div><dt>Questões</dt><dd>{m.questoes}</dd></div>
        <div><dt>Acerto</dt><dd>{pct === null ? '–' : `${pct}%`}</dd></div>
        <div><dt>Foco</dt><dd>{minutosTexto(m.focoMin)}</dd></div>
        <div><dt>XP</dt><dd>{Number(xpMes).toLocaleString('pt-BR')}</dd></div>
      </dl>
      <div className="mes-calendario" role="img" aria-label={`Estudou em ${m.dias.length} dias deste mês`}>
        {DIAS_SEMANA.map((d, i) => <span key={'c' + i} className="mc-cab">{d}</span>)}
        {Array.from({ length: primeiroDiaSemana }, (_, i) => <span key={'v' + i} />)}
        {Array.from({ length: m.ultimoDia }, (_, i) => {
          const dia = m.mesIni.slice(0, 8) + String(i + 1).padStart(2, '0')
          return <span key={dia} className={['mc-dia', estudou.has(dia) ? 'ok' : '', dia === hoje ? 'hoje' : '', dia > hoje ? 'futuro' : ''].join(' ')}>{i + 1}</span>
        })}
      </div>
    </div>
  )
}
