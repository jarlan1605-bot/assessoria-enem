import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { MESES, inicioDoMes, somarMeses, hojeISO } from './agenda'
import Avatar from './Avatar'
import { reais, dataBR, dataCurta, proximoMes, situacao, mensagem, linkWhatsApp, MENSAGENS_PADRAO, diasEntre, precisaVoce } from './cobranca'
import { pixCopiaECola } from './pix'

const num = (v) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0
const ROTULO = {
  atrasado: (s) => `Atrasado há ${s.dias} ${s.dias === 1 ? 'dia' : 'dias'}`,
  hoje: () => 'Vence hoje',
  breve: (s) => `Vence em ${s.dias} ${s.dias === 1 ? 'dia' : 'dias'}`,
  'em-dia': (s) => `Em dia · faltam ${s.dias} dias`,
  'sem-data': () => 'Falta o último pagamento',
  inativo: () => 'Sem cobrança',
}
const COR = { atrasado: 'fin-atrasado', hoje: 'fin-hoje', breve: 'fin-aberto', 'em-dia': 'fin-pago', 'sem-data': 'fin-sem', inativo: 'fin-sem' }

export default function Financeiro({ meuId }) {
  const [mes, setMes] = useState(() => inicioDoMes(new Date()))
  const [pessoas, setPessoas] = useState([])
  const [contratos, setContratos] = useState({})
  const [repasses, setRepasses] = useState({})
  const [pagamentos, setPagamentos] = useState([])
  const [envios, setEnvios] = useState([])
  const [config, setConfig] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [modal, setModal] = useState(null) // { tipo: 'contrato'|'pagar'|'historico'|'config', aluno }
  const [filtro, setFiltro] = useState('todos')
  const hoje = hojeISO()

  const carregar = useCallback(async () => {
    const desde = new Date(Date.now() - 70 * 86400000).toISOString()
    const [p, c, r, m, cfg, ev] = await Promise.all([
      supabase.from('perfis').select('id, nome, email, papel, mentor_id, foto_url').order('nome'),
      supabase.from('contratos').select('*'),
      supabase.from('repasses').select('*'),
      supabase.from('mensalidades').select('*').order('vencimento', { ascending: false }),
      supabase.from('financeiro_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('envios_whatsapp').select('*').gte('criado_em', desde).order('criado_em', { ascending: false }),
    ])
    setEnvios(ev.error ? [] : ev.data ?? [])
    if (c.error || m.error) setErro('Não foi possível carregar o financeiro. O arquivo extras.sql já foi rodado no Supabase?')
    else if (cfg.error) setErro('Rode o arquivo cobrancas.sql no Supabase para usar a cobrança mensal.')
    else setErro('')
    setPessoas(p.data ?? [])
    setContratos(Object.fromEntries((c.data ?? []).map((x) => [x.aluno_id, { ativo: true, ...x }])))
    setRepasses(Object.fromEntries((r.data ?? []).map((x) => [x.mentor_id, x.percentual])))
    setPagamentos(m.data ?? [])
    setConfig(cfg.data ?? { dias_antes: 3 })
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const diasAntes = config?.dias_antes ?? 3
  const alunos = pessoas.filter((p) => p.papel === 'aluno')
  const mentores = pessoas.filter((p) => p.papel === 'mentor' || p.papel === 'ceo')
  const linhas = alunos.map((a) => ({ a, ct: contratos[a.id], s: situacao(contratos[a.id], diasAntes, hoje) }))
  const ordem = { atrasado: 0, hoje: 1, breve: 2, 'sem-data': 3, 'em-dia': 4, inativo: 5 }
  linhas.sort((x, y) => ordem[x.s.tipo] - ordem[y.s.tipo] || (x.ct?.proximo_vencimento || '').localeCompare(y.ct?.proximo_vencimento || '') || (x.a.nome || '').localeCompare(y.a.nome || ''))
  const auto = !!config?.auto_ativo
  const enviosDe = (ct) => envios.filter((e) => ct && e.aluno_id === ct.aluno_id && e.vencimento === ct.proximo_vencimento)
  const linhasCom = linhas.map((l) => ({ ...l, voce: l.ct ? precisaVoce(l.ct, config, enviosDe(l.ct).some((e) => e.status === 'erro'), hoje) : null }))
  const paraCobrar = linhasCom.filter((l) => l.voce)
  const enviosHoje = envios.filter((e) => e.criado_em && hojeISO(new Date(e.criado_em)) === hoje)

  // resumo do mês escolhido
  const ini = hojeISO(mes)
  const fim = hojeISO(somarMeses(mes, 1))
  const pagosNoMes = pagamentos.filter((p) => p.pago_em && p.pago_em >= ini && p.pago_em < fim)
  const recebido = pagosNoMes.reduce((t, p) => t + Number(p.valor), 0)
  const aReceber = linhas.filter((l) => l.ct?.proximo_vencimento && l.ct.proximo_vencimento >= ini && l.ct.proximo_vencimento < fim && l.s.tipo !== 'inativo' && l.ct.proximo_vencimento >= hoje)
  const atrasados = linhas.filter((l) => l.s.tipo === 'atrasado')
  const somaCt = (ls) => ls.reduce((t, l) => t + Number(l.ct.valor_mensal), 0)

  const porMentor = mentores.map((m) => {
    const ids = alunos.filter((a) => a.mentor_id === m.id).map((a) => a.id)
    const rec = pagosNoMes.filter((p) => ids.includes(p.aluno_id)).reduce((t, p) => t + Number(p.valor), 0)
    const pct = m.id === meuId ? 0 : Number(repasses[m.id] ?? 0)
    return { ...m, alunos: ids.length, recebido: rec, pct, repasse: (rec * pct) / 100 }
  })
  const totalRepasse = porMentor.reduce((t, m) => t + m.repasse, 0)

  async function marcarAvisado(alunoId) {
    setContratos((c) => ({ ...c, [alunoId]: { ...c[alunoId], ultimo_aviso: hoje, aviso_pessoal: hoje } }))
    const { error } = await supabase.from('contratos').update({ ultimo_aviso: hoje, aviso_pessoal: hoje }).eq('aluno_id', alunoId)
    if (error) await supabase.from('contratos').update({ ultimo_aviso: hoje }).eq('aluno_id', alunoId)
  }

  async function salvarRepasse(mentorId, valor) {
    const pct = Math.max(0, Math.min(100, num(valor)))
    const { error } = await supabase.from('repasses').upsert({ mentor_id: mentorId, percentual: pct })
    if (error) setErro(error.message)
    else carregar()
  }

  const listadas = linhasCom.filter((l) => filtro === 'todos' || (filtro === 'cobrar' ? l.voce : filtro === 'breve' ? l.s.tipo === 'breve' || l.s.tipo === 'hoje' : l.s.tipo === filtro))
  const fechar = (recarregar, msg) => {
    setModal(null)
    if (msg) setAviso(msg)
    if (recarregar) carregar()
  }

  if (carregando) return <p className="suave">Carregando…</p>

  return (
    <section className="secao">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>Financeiro</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>Cada aluno paga a cada 1 mês, contando do último pagamento. O site avisa quem cobrar e monta a mensagem do WhatsApp com o Pix.</p>
        </div>
        <button className="botao fantasma" onClick={() => setModal({ tipo: 'config' })}>⚙️ Pix e mensagens</button>
      </div>

      {erro && <p className="erro">{erro}</p>}
      {aviso && !erro && <p className="aviso-ok" role="status">✓ {aviso}</p>}
      {config && !config.pix_chave && !erro && (
        <p className="aviso-info">💡 Cadastre sua chave Pix em <button className="link" onClick={() => setModal({ tipo: 'config' })}>Pix e mensagens</button>: a mensagem de cobrança já vai com o Pix copia e cola e o valor preenchido.</p>
      )}

      <div className={paraCobrar.length ? 'cartao cobrar-hoje' : 'cartao cobrar-hoje vazio-ok'}>
        <h2 style={{ marginTop: 0 }}>
          {auto
            ? paraCobrar.length ? `👤 Sua vez: cobrar pessoalmente (${paraCobrar.length})` : '✅ Nada para você hoje: o robô está cuidando'
            : paraCobrar.length ? `💰 Cobrar hoje (${paraCobrar.length})` : '✅ Nenhuma cobrança para hoje'}
        </h2>
        {auto && (
          <p className="robo-linha">
            🤖 <b>Cobrança automática ligada.</b> Todo dia por volta das 12h o WhatsApp da mentoria manda o lembrete {diasAntes} {diasAntes === 1 ? 'dia' : 'dias'} antes, a mensagem no dia do vencimento e um aviso com {config.atraso_dias ?? 3} dias de atraso. Depois disso, o aluno aparece aqui para você.
            {enviosHoje.length > 0 && <> Hoje: {enviosHoje.filter((e) => e.status === 'enviado').length} enviadas{enviosHoje.some((e) => e.status === 'erro') ? `, ${enviosHoje.filter((e) => e.status === 'erro').length} com erro` : ''}.</>}
          </p>
        )}
        {paraCobrar.length === 0 ? (
          !auto && <p className="suave pequeno" style={{ margin: 0 }}>O site avisa {diasAntes > 0 ? `${diasAntes} ${diasAntes === 1 ? 'dia' : 'dias'} antes do vencimento, ` : ''}no dia e quando atrasar.</p>
        ) : (
          <>
            <p className="suave pequeno" style={{ marginTop: 0 }}>{auto ? 'O robô já mandou as mensagens e o aluno não pagou (ou não deu para enviar). ' : ''}Toque em <b>Cobrar no WhatsApp</b>: a conversa abre com a mensagem pronta. Depois de enviar, o aluno sai da lista por 3 dias.</p>
            {paraCobrar.map(({ a, ct, s, voce }) => {
              const texto = mensagem({ tipo: s.msg, contrato: ct, aluno: a, config })
              return (
                <div key={a.id} className="cobrar-item">
                  <Avatar src={a.foto_url} nome={a.nome || a.email} tamanho={36} />
                  <span className="cobrar-info">
                    <strong>{a.nome || a.email}</strong>
                    <span className="suave pequeno">{reais(ct.valor_mensal)} · vence {dataBR(ct.proximo_vencimento)}{ct.responsavel ? ` · ${ct.responsavel}` : ''}</span>
                  </span>
                  <span className={`fin-status ${COR[s.tipo]}`}>{ROTULO[s.tipo](s)}</span>
                  {voce?.motivo === 'erro' && <span className="fin-status fin-atrasado" title={enviosDe(ct).find((e) => e.status === 'erro')?.erro}>🤖 não conseguiu enviar</span>}
                  {voce?.motivo === 'sem-telefone' && <span className="fin-status fin-sem">sem WhatsApp cadastrado</span>}
                  <span className="cobrar-acoes">
                    <a className="botao primario pequeno botao-whats" href={linkWhatsApp(ct.telefone, texto)} target="_blank" rel="noreferrer" onClick={() => marcarAvisado(a.id)}>
                      Cobrar no WhatsApp
                    </a>
                    <button className="botao fantasma pequeno" onClick={() => setModal({ tipo: 'pagar', aluno: a })}>Já pagou</button>
                  </span>
                </div>
              )
            })}
            {paraCobrar.some(({ ct }) => !ct.telefone) && <p className="suave pequeno" style={{ marginBottom: 0 }}>Quem está sem WhatsApp cadastrado: a conversa abre para você escolher o contato.</p>}
          </>
        )}
      </div>

      <div className="navegar-mes" style={{ marginTop: 6 }}>
        <button className="botao fantasma" onClick={() => setMes((m) => somarMeses(m, -1))} aria-label="Mês anterior">‹</button>
        <h3 style={{ margin: 0 }}>{MESES[mes.getMonth()]} {mes.getFullYear()}</h3>
        <button className="botao fantasma" onClick={() => setMes((m) => somarMeses(m, 1))} aria-label="Próximo mês">›</button>
      </div>
      <div className="resumo-cartoes resumo-fin">
        <div className="cartao mini" style={{ '--cor': '#2f9e44' }}><span className="mini-titulo">Recebido</span><strong className="mini-numero fin">{reais(recebido)}</strong><span className="suave pequeno">{pagosNoMes.length} {pagosNoMes.length === 1 ? 'pagamento' : 'pagamentos'}</span></div>
        <div className="cartao mini" style={{ '--cor': '#e67700' }}><span className="mini-titulo">A receber</span><strong className="mini-numero fin">{reais(somaCt(aReceber))}</strong><span className="suave pequeno">vencem até o fim do mês</span></div>
        <div className="cartao mini" style={{ '--cor': '#c92a2a' }}><span className="mini-titulo">Atrasado hoje</span><strong className="mini-numero fin">{reais(somaCt(atrasados))}</strong><span className="suave pequeno">{atrasados.length} {atrasados.length === 1 ? 'aluno' : 'alunos'}</span></div>
        <div className="cartao mini" style={{ '--cor': '#7048e8' }}><span className="mini-titulo">Fica com você</span><strong className="mini-numero fin">{reais(recebido - totalRepasse)}</strong><span className="suave pequeno">recebido − repasses ({reais(totalRepasse)})</span></div>
      </div>

      <div className="cartao">
        <div className="alunos-topo">
          <h2 style={{ margin: 0 }}>Alunos</h2>
          <div className="filtros">
            {[['todos', 'Todos'], ['cobrar', auto ? 'Sua vez' : 'Cobrar hoje'], ['atrasado', 'Atrasados'], ['breve', 'Vencendo'], ['em-dia', 'Em dia'], ['sem-data', 'Sem data']].map(([k, n]) => (
              <button key={k} className={filtro === k ? 'filtro ativo' : 'filtro'} onClick={() => setFiltro(k)}>{n}</button>
            ))}
          </div>
        </div>
        <div className="tabela-rolagem">
          <table className="tabela tabela-alunos">
            <thead>
              <tr><th>Aluno</th><th className="num">Mensalidade</th><th>Último pagamento</th><th>Próximo vencimento</th><th>Situação</th><th></th></tr>
            </thead>
            <tbody>
              {listadas.map(({ a, ct, s }) => {
                const ultimo = pagamentos.find((p) => p.aluno_id === a.id && p.pago_em)
                return (
                  <tr key={a.id}>
                    <td>
                      <span className="atendimento-aluno">
                        <Avatar src={a.foto_url} nome={a.nome || a.email} tamanho={30} />
                        <span className="atendimento-aluno-texto">
                          <strong>{a.nome || a.email}</strong>
                          <span className="suave pequeno">{ct?.responsavel ? `Resp.: ${ct.responsavel}` : ct?.telefone || a.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="num">{ct && Number(ct.valor_mensal) ? reais(ct.valor_mensal) : '—'}</td>
                    <td>{ultimo ? dataBR(ultimo.pago_em) : '—'}</td>
                    <td>{ct?.proximo_vencimento ? dataBR(ct.proximo_vencimento) : '—'}</td>
                    <td>
                      <span className={`fin-status ${COR[s.tipo]}`}>{ROTULO[s.tipo](s)}</span>
                      {enviosDe(ct).map((e) => (
                        <span key={e.id} className={`robo-env ${e.status}`} title={e.erro || ''}>
                          🤖 {e.tipo === 'lembrete' ? 'lembrete' : e.tipo === 'hoje' ? 'no dia' : 'atraso'} {e.status === 'erro' ? '✗ erro' : '✓'} {dataCurta(hojeISO(new Date(e.criado_em)))}
                        </span>
                      ))}
                    </td>
                    <td className="acoes-tabela">
                      {ct?.proximo_vencimento && s.tipo !== 'inativo' && <button className="link" onClick={() => setModal({ tipo: 'pagar', aluno: a })}>registrar pagamento</button>}
                      {ct?.proximo_vencimento && s.tipo !== 'inativo' && (
                        <a className="link" href={linkWhatsApp(ct.telefone, mensagem({ tipo: s.msg || 'lembrete', contrato: ct, aluno: a, config }))} target="_blank" rel="noreferrer" onClick={() => marcarAvisado(a.id)}>cobrar</a>
                      )}
                      <button className="link" onClick={() => setModal({ tipo: 'contrato', aluno: a })}>{ct && Number(ct.valor_mensal) ? (ct.proximo_vencimento ? 'contrato' : 'definir data') : 'configurar'}</button>
                      {pagamentos.some((p) => p.aluno_id === a.id) && <button className="link" onClick={() => setModal({ tipo: 'historico', aluno: a })}>histórico</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {listadas.length === 0 && <p className="suave" style={{ marginBottom: 0 }}>Nenhum aluno nesta situação.</p>}
      </div>

      <div className="cartao">
        <h2>Repasse aos mentores · {MESES[mes.getMonth()].toLowerCase()}</h2>
        <p className="suave pequeno">Percentual do valor <b>recebido</b> no mês dos alunos de cada mentor.</p>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Mentor</th><th className="num">Alunos</th><th className="num">Recebido</th><th className="num">% repasse</th><th className="num">A pagar</th></tr></thead>
            <tbody>
              {porMentor.map((m) => (
                <tr key={m.id}>
                  <td><span className="atendimento-aluno"><Avatar src={m.foto_url} nome={m.nome || m.email} tamanho={28} /><strong>{m.id === meuId ? 'Você (CEO)' : m.nome || m.email}</strong></span></td>
                  <td className="num">{m.alunos}</td>
                  <td className="num">{reais(m.recebido)}</td>
                  <td className="num">
                    {m.id === meuId ? '—' : (
                      <input className="input-pct" defaultValue={String(m.pct).replace('.', ',')} inputMode="decimal" onBlur={(e) => { if (num(e.target.value) !== m.pct) salvarRepasse(m.id, e.target.value) }} aria-label={`Percentual de ${m.nome}`} />
                    )}
                  </td>
                  <td className="num"><b>{m.id === meuId ? '—' : reais(m.repasse)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal?.tipo === 'contrato' && <FormContrato aluno={modal.aluno} contrato={contratos[modal.aluno.id]} onFechar={fechar} />}
      {modal?.tipo === 'pagar' && <RegistrarPagamento aluno={modal.aluno} contrato={contratos[modal.aluno.id]} onFechar={fechar} />}
      {modal?.tipo === 'historico' && (
        <Historico aluno={modal.aluno} contrato={contratos[modal.aluno.id]} pagamentos={pagamentos.filter((p) => p.aluno_id === modal.aluno.id)} onFechar={fechar} />
      )}
      {modal?.tipo === 'config' && <Configuracoes config={config} onFechar={fechar} />}
    </section>
  )
}

function Modal({ titulo, onFechar, children, largo }) {
  return (
    <div className="fundo-modal" onClick={() => onFechar()}>
      <div className={largo ? 'cartao modal modal-largo' : 'cartao modal'} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button className="botao fantasma pequeno" onClick={() => onFechar()} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormContrato({ aluno, contrato, onFechar }) {
  const hoje = hojeISO()
  const [valor, setValor] = useState(contrato && Number(contrato.valor_mensal) ? String(contrato.valor_mensal).replace('.', ',') : '')
  const [ultimo, setUltimo] = useState('')
  const [proximo, setProximo] = useState(contrato?.proximo_vencimento || '')
  const [responsavel, setResponsavel] = useState(contrato?.responsavel ?? '')
  const [telefone, setTelefone] = useState(contrato?.telefone ?? '')
  const [observacoes, setObservacoes] = useState(contrato?.observacoes ?? '')
  const [ativo, setAtivo] = useState(contrato?.ativo !== false)
  const [registrar, setRegistrar] = useState(true)
  const [erro, setErro] = useState('')

  function mudarUltimo(v) {
    setUltimo(v)
    if (v) setProximo(proximoMes(v))
  }

  async function salvar(e) {
    e.preventDefault()
    if (!num(valor)) return setErro('Coloque o valor da mensalidade.')
    if (ativo && !proximo) return setErro('Coloque a data do último pagamento (ou do próximo vencimento).')
    const { error } = await supabase.from('contratos').upsert({
      aluno_id: aluno.id,
      valor_mensal: num(valor),
      dia_vencimento: proximo ? Number(proximo.slice(8, 10)) : contrato?.dia_vencimento || 10,
      proximo_vencimento: proximo || null,
      responsavel: responsavel.trim(),
      telefone: telefone.trim(),
      observacoes: observacoes.trim(),
      ativo,
    })
    if (error) return setErro(/proximo_vencimento|ativo/.test(error.message) ? 'Rode o arquivo cobrancas.sql no Supabase.' : 'Não foi possível salvar: ' + error.message)
    if (ultimo && registrar) {
      await supabase.from('mensalidades').upsert({ aluno_id: aluno.id, competencia: ultimo, vencimento: ultimo, valor: num(valor), pago_em: ultimo, forma: '' }, { onConflict: 'aluno_id,competencia' })
    }
    onFechar(true, `Contrato de ${(aluno.nome || '').split(' ')[0]} salvo.`)
  }

  return (
    <Modal titulo={`Cobrança — ${aluno.nome || aluno.email}`} onFechar={onFechar}>
      <form onSubmit={salvar}>
        <div className="grade-form">
          <label>Mensalidade (R$)<input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Ex.: 350,00" autoFocus /></label>
          <label>Data do último pagamento<input type="date" value={ultimo} max={hoje} onChange={(e) => mudarUltimo(e.target.value)} /></label>
          <label>Próximo vencimento<input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} /></label>
        </div>
        <p className="suave pequeno" style={{ marginTop: 0 }}>
          Coloque o último pagamento e o próximo vencimento é calculado sozinho: 1 mês depois. Depois disso, a cada pagamento registrado, o vencimento anda mais 1 mês.
        </p>
        {ultimo && (
          <label className="caixa-marcar" style={{ marginTop: 0 }}>
            <input type="checkbox" checked={registrar} onChange={(e) => setRegistrar(e.target.checked)} />
            Guardar esse pagamento de {dataBR(ultimo)} no histórico
          </label>
        )}
        <div className="grade-form">
          <label>Quem paga (responsável)<input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Ex.: Ana (mãe). Vazio = o próprio aluno" /></label>
          <label>WhatsApp de quem paga<input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="(84) 99999-9999" /></label>
          <label className="largo">Observações<input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: desconto de irmão" /></label>
        </div>
        <label className="caixa-marcar">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Cobrança ativa (desmarque se o aluno saiu ou está com bolsa)
        </label>
        {erro && <p className="erro">{erro}</p>}
        <div className="linha-botoes">
          <button type="button" className="botao fantasma" onClick={() => onFechar()}>Cancelar</button>
          <button className="botao primario">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

function RegistrarPagamento({ aluno, contrato, onFechar }) {
  const hoje = hojeISO()
  const venc = contrato.proximo_vencimento
  const [data, setData] = useState(hoje)
  const [valor, setValor] = useState(String(contrato.valor_mensal).replace('.', ','))
  const [forma, setForma] = useState('Pix')
  const [novo, setNovo] = useState(proximoMes(venc, contrato.dia_vencimento))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase.from('mensalidades').upsert(
      { aluno_id: aluno.id, competencia: venc, vencimento: venc, valor: num(valor), pago_em: data, forma },
      { onConflict: 'aluno_id,competencia' }
    )
    if (error) {
      setSalvando(false)
      return setErro('Não foi possível registrar: ' + error.message)
    }
    await supabase.from('contratos').update({ proximo_vencimento: novo, ultimo_aviso: null }).eq('aluno_id', aluno.id)
    onFechar(true, `Pagamento de ${(aluno.nome || '').split(' ')[0]} registrado. Próximo vencimento: ${dataBR(novo)}.`)
  }

  const atraso = diasEntre(venc, data)
  return (
    <Modal titulo={`Registrar pagamento — ${(aluno.nome || aluno.email).split(' ')[0]}`} onFechar={onFechar} largo>
      <form onSubmit={salvar}>
        <p className="suave pequeno" style={{ marginTop: 0 }}>Mensalidade com vencimento em <b>{dataBR(venc)}</b>{atraso > 0 ? ` (paga com ${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso)` : ''}.</p>
        <div className="grade-form">
          <label>Pago em<input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} /></label>
          <label>Valor (R$)<input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" /></label>
          <label>Forma
            <select value={forma} onChange={(e) => setForma(e.target.value)}>
              {['Pix', 'Dinheiro', 'Cartão', 'Transferência', 'Outro'].map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label>Próximo vencimento<input type="date" value={novo} onChange={(e) => setNovo(e.target.value)} /></label>
        </div>
        <p className="suave pequeno">O próximo vencimento fica no mesmo dia do mês ({Number(contrato.dia_vencimento) || Number(venc.slice(8, 10))}), mesmo se o aluno pagar atrasado. Mude a data acima se combinou outra.</p>
        {erro && <p className="erro">{erro}</p>}
        <div className="linha-botoes">
          <button type="button" className="botao fantasma" onClick={() => onFechar()}>Cancelar</button>
          <button className="botao primario" disabled={salvando}>✓ Confirmar pagamento</button>
        </div>
      </form>
    </Modal>
  )
}

function Historico({ aluno, contrato, pagamentos, onFechar }) {
  const ultimoPago = pagamentos.find((p) => p.pago_em)
  async function desfazer() {
    if (!confirm(`Desfazer o pagamento de ${dataBR(ultimoPago.pago_em)}? O vencimento volta para ${dataBR(ultimoPago.vencimento)}.`)) return
    await supabase.from('mensalidades').delete().eq('id', ultimoPago.id)
    await supabase.from('contratos').update({ proximo_vencimento: ultimoPago.vencimento }).eq('aluno_id', aluno.id)
    onFechar(true, 'Pagamento desfeito.')
  }
  const total = pagamentos.filter((p) => p.pago_em).reduce((t, p) => t + Number(p.valor), 0)
  return (
    <Modal titulo={`Histórico — ${aluno.nome || aluno.email}`} onFechar={onFechar}>
      <p className="suave pequeno" style={{ marginTop: 0 }}>{pagamentos.filter((p) => p.pago_em).length} pagamentos · {reais(total)} no total{contrato?.proximo_vencimento ? ` · próximo vencimento ${dataBR(contrato.proximo_vencimento)}` : ''}</p>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead><tr><th>Vencimento</th><th>Pago em</th><th className="num">Valor</th><th>Forma</th></tr></thead>
          <tbody>
            {pagamentos.map((p) => (
              <tr key={p.id}>
                <td>{dataBR(p.vencimento)}</td>
                <td>{p.pago_em ? dataBR(p.pago_em) : <span className="fin-status fin-aberto">em aberto</span>}</td>
                <td className="num">{reais(p.valor)}</td>
                <td>{p.forma || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="linha-botoes">
        {ultimoPago && <button className="botao fantasma perigo" onClick={desfazer} style={{ marginRight: 'auto' }}>Desfazer último pagamento</button>}
        <button className="botao primario" onClick={() => onFechar()}>Fechar</button>
      </div>
    </Modal>
  )
}

function Configuracoes({ config, onFechar }) {
  const [c, setC] = useState({
    pix_chave: '', pix_tipo: 'telefone', pix_nome: '', pix_cidade: '', dias_antes: 3, msg_lembrete: '', msg_hoje: '', msg_atraso: '',
    auto_ativo: false, atraso_dias: 3, tpl_lembrete: 'lembrete_mensalidade', tpl_hoje: 'mensalidade_vence_hoje', tpl_atraso: 'mensalidade_em_aberto', tpl_idioma: 'pt_BR',
    ...config,
  })
  const [teste, setTeste] = useState({ telefone: '', tipo: 'lembrete' })
  const [resposta, setResposta] = useState(null) // { ok, texto }
  const [ocupado, setOcupado] = useState(false)
  const temAuto = config && 'auto_ativo' in config

  async function chamar(corpo) {
    setOcupado(true)
    setResposta(null)
    try {
      const { data } = await supabase.auth.getSession()
      const r = await fetch('/api/cobranca-automatica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify(corpo),
      })
      const j = await r.json().catch(() => ({ erro: 'A função não respondeu. Ela já está no GitHub (api/cobranca-automatica.js)?' }))
      if (!r.ok || j.erro) setResposta({ ok: false, texto: j.erro || `Erro ${r.status}` })
      else if (corpo.acao === 'teste') setResposta({ ok: true, texto: 'Mensagem de teste enviada! Confira o WhatsApp.' })
      else {
        const linhas = [
          ...(j.enviados || []).map((x) => `${x.simulado ? '→ vai receber' : '✓ enviado'}: ${x.aluno} (${x.tipo === 'hoje' ? 'no dia' : x.tipo})`),
          ...(j.erros || []).map((x) => `✗ erro: ${x.aluno}: ${x.erro}`),
          ...(j.pulados || []).map((x) => `– ${x.aluno}: ${x.motivo}`),
        ]
        setResposta({ ok: !(j.erros || []).length, texto: linhas.length ? linhas.join('\n') : 'Ninguém para cobrar hoje.' })
      }
    } catch (e) {
      setResposta({ ok: false, texto: 'Não deu para chamar a função: ' + e.message })
    }
    setOcupado(false)
  }
  const [erro, setErro] = useState('')
  const mudar = (k) => (e) => setC({ ...c, [k]: e.target.value })
  const exemplo = useMemo(() => {
    const ct = { valor_mensal: 350, proximo_vencimento: hojeISO(), responsavel: '' }
    return mensagem({ tipo: 'hoje', contrato: ct, aluno: { nome: 'Maria Eduarda' }, config: c })
  }, [c])
  const pixTeste = c.pix_chave ? pixCopiaECola({ chave: c.pix_chave, tipo: c.pix_tipo, nome: c.pix_nome, cidade: c.pix_cidade, valor: 1 }) : ''

  async function salvar(e) {
    e.preventDefault()
    const dados = {
      id: 1, pix_chave: c.pix_chave.trim(), pix_tipo: c.pix_tipo, pix_nome: c.pix_nome.trim(), pix_cidade: c.pix_cidade.trim(),
      dias_antes: Math.max(0, Math.min(15, Number(c.dias_antes) || 0)),
      msg_lembrete: c.msg_lembrete.trim(), msg_hoje: c.msg_hoje.trim(), msg_atraso: c.msg_atraso.trim(),
    }
    if (temAuto) {
      if (c.auto_ativo && !c.pix_chave.trim()) return setErro('Para ligar a cobrança automática, cadastre a chave Pix (ela vai na mensagem).')
      Object.assign(dados, {
        auto_ativo: !!c.auto_ativo, atraso_dias: Math.max(1, Math.min(30, Number(c.atraso_dias) || 3)),
        tpl_lembrete: c.tpl_lembrete.trim(), tpl_hoje: c.tpl_hoje.trim(), tpl_atraso: c.tpl_atraso.trim(), tpl_idioma: (c.tpl_idioma || 'pt_BR').trim(),
      })
    }
    const { error } = await supabase.from('financeiro_config').upsert(dados)
    if (error) return setErro(/financeiro_config|pix_tipo/.test(error.message) ? 'Rode o arquivo cobrancas.sql no Supabase.' : error.message)
    onFechar(true, 'Configurações da cobrança salvas.')
  }

  return (
    <Modal titulo="Pix e mensagens de cobrança" onFechar={onFechar} largo>
      <form onSubmit={salvar}>
        <h3 className="sp-sub" style={{ marginTop: 0 }}>Seu Pix</h3>
        <div className="grade-form">
          <label>Tipo de chave
            <select value={c.pix_tipo} onChange={mudar('pix_tipo')}>
              <option value="telefone">Celular</option>
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option>
              <option value="aleatoria">Chave aleatória</option>
            </select>
          </label>
          <label className="largo-2">Chave Pix<input value={c.pix_chave} onChange={mudar('pix_chave')} placeholder="Ex.: (84) 99999-9999" /></label>
          <label>Nome do recebedor<input value={c.pix_nome} onChange={mudar('pix_nome')} placeholder="Como está no banco" maxLength={25} /></label>
          <label>Cidade<input value={c.pix_cidade} onChange={mudar('pix_cidade')} placeholder="Ex.: Caicó" maxLength={15} /></label>
        </div>
        {pixTeste && <p className="suave pequeno">Para testar: copie este Pix de R$ 1,00 e cole no app do seu banco. Se aparecer seu nome, está certo.<br /><code className="pix-codigo">{pixTeste}</code></p>}

        <h3 className="sp-sub">Quando avisar</h3>
        <label className="sp-linha">Dias antes do vencimento para lembrar<input type="number" min="0" max="15" value={c.dias_antes} onChange={mudar('dias_antes')} /></label>
        <p className="suave pequeno">O aluno aparece em <b>Cobrar hoje</b> nesse dia, no dia do vencimento e, se atrasar, de 3 em 3 dias até você registrar o pagamento.</p>

        <h3 className="sp-sub">🤖 Cobrança automática pelo WhatsApp</h3>
        {!temAuto ? (
          <p className="aviso-info">Para ligar, rode o arquivo <code>cobranca_auto.sql</code> no Supabase e siga o passo a passo do LEIA-ME (WhatsApp oficial da Meta).</p>
        ) : (
          <div className="robo-config">
            <label className="caixa-marcar" style={{ marginTop: 0 }}>
              <input type="checkbox" checked={!!c.auto_ativo} onChange={(e) => setC({ ...c, auto_ativo: e.target.checked })} />
              <span><b>Ligar a cobrança automática.</b> Todo dia por volta das 12h, manda sozinho o lembrete, a mensagem no dia e o aviso de atraso.</span>
            </label>
            <label className="sp-linha">Mandar o aviso de atraso com quantos dias de atraso<input type="number" min="1" max="30" value={c.atraso_dias} onChange={mudar('atraso_dias')} /></label>
            <p className="suave pequeno">Depois desse aviso, o robô para e o aluno aparece para você em <b>Sua vez</b>.</p>
            <div className="grade-form">
              <label>Modelo do lembrete<input value={c.tpl_lembrete} onChange={mudar('tpl_lembrete')} /></label>
              <label>Modelo do dia<input value={c.tpl_hoje} onChange={mudar('tpl_hoje')} /></label>
              <label>Modelo do atraso<input value={c.tpl_atraso} onChange={mudar('tpl_atraso')} /></label>
            </div>
            <p className="suave pequeno" style={{ marginTop: 0 }}>Nomes dos modelos aprovados na Meta (o texto deles está no LEIA-ME). As variáveis são: {'{{1}}'} nome, {'{{2}}'} valor, {'{{3}}'} vencimento, {'{{4}}'} Pix copia e cola.</p>
            <div className="robo-teste">
              <input value={teste.telefone} onChange={(e) => setTeste({ ...teste, telefone: e.target.value })} placeholder="Seu WhatsApp para o teste" inputMode="tel" />
              <select value={teste.tipo} onChange={(e) => setTeste({ ...teste, tipo: e.target.value })}>
                <option value="lembrete">lembrete</option><option value="hoje">no dia</option><option value="atraso">atraso</option>
              </select>
              <button type="button" className="botao fantasma pequeno" disabled={ocupado} onClick={() => chamar({ acao: 'teste', ...teste })}>Enviar teste</button>
              <button type="button" className="botao fantasma pequeno" disabled={ocupado} onClick={() => chamar({ acao: 'simular' })}>Quem recebe hoje?</button>
              <button type="button" className="botao fantasma pequeno" disabled={ocupado || !config.auto_ativo} onClick={() => { if (confirm('Enviar agora as cobranças de hoje?')) chamar({ acao: 'rodar' }) }} title={config.auto_ativo ? '' : 'Salve com a cobrança automática ligada primeiro'}>Enviar as de hoje agora</button>
            </div>
            {ocupado && <p className="suave pequeno">Aguarde…</p>}
            {resposta && <pre className={resposta.ok ? 'robo-resposta ok' : 'robo-resposta erro'}>{resposta.texto}</pre>}
          </div>
        )}

        <h3 className="sp-sub">Mensagens do botão "Cobrar no WhatsApp"</h3>
        <p className="suave pequeno" style={{ marginTop: 0 }}>Deixe em branco para usar a mensagem padrão. Pode usar: <code>{'{nome}'}</code> (responsável ou aluno), <code>{'{aluno}'}</code>, <code>{'{valor}'}</code>, <code>{'{vencimento}'}</code>, <code>{'{pix}'}</code> (Pix copia e cola) e <code>{'{mentoria}'}</code>. *negrito* funciona no WhatsApp.</p>
        {[['msg_lembrete', 'Lembrete (antes de vencer)', 'lembrete'], ['msg_hoje', 'No dia do vencimento', 'hoje'], ['msg_atraso', 'Atrasado', 'atraso']].map(([k, rot, t]) => (
          <label key={k}>{rot}<textarea rows="4" value={c[k]} onChange={mudar(k)} placeholder={MENSAGENS_PADRAO[t]} /></label>
        ))}
        <p className="rotulo-campo">Prévia (no dia do vencimento)</p>
        <pre className="exportar-texto">{exemplo}</pre>
        {erro && <p className="erro">{erro}</p>}
        <div className="linha-botoes">
          <button type="button" className="botao fantasma" onClick={() => onFechar()}>Cancelar</button>
          <button className="botao primario">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}
