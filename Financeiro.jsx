import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { NOME_SITE } from './constants'
import { MESES, inicioDoMes, somarMeses, hojeISO } from './agenda'
import Avatar from './Avatar'

const reais = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '')
const num = (v) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0

export default function Financeiro({ meuId }) {
  const [mes, setMes] = useState(() => inicioDoMes(new Date()))
  const [pessoas, setPessoas] = useState([])
  const [contratos, setContratos] = useState({})
  const [repasses, setRepasses] = useState({})
  const [cobrancas, setCobrancas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [editando, setEditando] = useState(null) // aluno com contrato em edição
  const [filtro, setFiltro] = useState('todos')

  const competencia = hojeISO(mes)
  const hoje = hojeISO()

  const carregar = useCallback(async () => {
    const [p, c, r, m] = await Promise.all([
      supabase.from('perfis').select('id, nome, email, papel, mentor_id, foto_url').order('nome'),
      supabase.from('contratos').select('*'),
      supabase.from('repasses').select('*'),
      supabase.from('mensalidades').select('*').eq('competencia', competencia),
    ])
    if (c.error || m.error) setErro('Não foi possível carregar o financeiro. O arquivo extras.sql já foi rodado no Supabase?')
    else setErro('')
    setPessoas(p.data ?? [])
    setContratos(Object.fromEntries((c.data ?? []).map((x) => [x.aluno_id, x])))
    setRepasses(Object.fromEntries((r.data ?? []).map((x) => [x.mentor_id, x.percentual])))
    setCobrancas(m.data ?? [])
    setCarregando(false)
  }, [competencia])

  useEffect(() => {
    setCarregando(true)
    carregar()
  }, [carregar])

  const alunos = pessoas.filter((p) => p.papel === 'aluno')
  const mentores = pessoas.filter((p) => p.papel === 'mentor' || p.papel === 'ceo')
  const cobrancaDe = (id) => cobrancas.find((c) => c.aluno_id === id)
  const status = (c) => (!c ? 'sem' : c.pago_em ? 'pago' : c.vencimento < hoje ? 'atrasado' : 'aberto')

  const totais = useMemo(() => {
    const t = { previsto: 0, recebido: 0, aberto: 0, atrasado: 0 }
    for (const c of cobrancas) {
      t.previsto += Number(c.valor)
      const s = status(c)
      if (s === 'pago') t.recebido += Number(c.valor)
      if (s === 'aberto') t.aberto += Number(c.valor)
      if (s === 'atrasado') t.atrasado += Number(c.valor)
    }
    return t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobrancas, hoje])

  const porMentor = mentores.map((m) => {
    const ids = alunos.filter((a) => a.mentor_id === m.id).map((a) => a.id)
    const recebido = cobrancas.filter((c) => ids.includes(c.aluno_id) && c.pago_em).reduce((t, c) => t + Number(c.valor), 0)
    const pct = m.id === meuId ? 0 : Number(repasses[m.id] ?? 0)
    return { ...m, alunos: ids.length, recebido, pct, repasse: (recebido * pct) / 100 }
  })
  const totalRepasse = porMentor.reduce((t, m) => t + m.repasse, 0)

  async function gerarCobrancas() {
    const novas = alunos
      .filter((a) => contratos[a.id] && Number(contratos[a.id].valor_mensal) > 0 && !cobrancaDe(a.id))
      .map((a) => {
        const dia = contratos[a.id].dia_vencimento || 10
        return { aluno_id: a.id, competencia, valor: contratos[a.id].valor_mensal, vencimento: hojeISO(new Date(mes.getFullYear(), mes.getMonth(), dia)) }
      })
    if (!novas.length) return setAviso('Nenhuma cobrança nova: todos os alunos com valor definido já têm cobrança neste mês.')
    const { error } = await supabase.from('mensalidades').insert(novas)
    if (error) return setErro('Não foi possível gerar: ' + error.message)
    setAviso(`${novas.length} ${novas.length === 1 ? 'cobrança criada' : 'cobranças criadas'} para ${MESES[mes.getMonth()].toLowerCase()}.`)
    carregar()
  }

  async function marcarPago(c, pago) {
    const { error } = await supabase.from('mensalidades').update({ pago_em: pago ? hoje : null }).eq('id', c.id)
    if (error) setErro(error.message)
    else carregar()
  }

  async function apagarCobranca(c, nome) {
    if (!confirm(`Apagar a cobrança de ${nome} deste mês?`)) return
    await supabase.from('mensalidades').delete().eq('id', c.id)
    carregar()
  }

  async function salvarRepasse(mentorId, valor) {
    const pct = Math.max(0, Math.min(100, num(valor)))
    const { error } = await supabase.from('repasses').upsert({ mentor_id: mentorId, percentual: pct })
    if (error) setErro(error.message)
    else carregar()
  }

  function linkCobranca(aluno, c) {
    const ct = contratos[aluno.id]
    const tel = (ct?.telefone || '').replace(/\D/g, '')
    if (!tel) return null
    const numero = tel.length <= 11 ? '55' + tel : tel
    const quem = ct.responsavel || (aluno.nome || '').split(' ')[0]
    const msg = `Olá, ${quem}! Tudo bem? Passando para lembrar da mensalidade da ${NOME_SITE} referente a ${MESES[mes.getMonth()].toLowerCase()}: ${reais(c.valor)}, com vencimento em ${dataBR(c.vencimento)}. Qualquer dúvida, estou à disposição!`
    return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`
  }

  const listados = alunos.filter((a) => filtro === 'todos' || status(cobrancaDe(a.id)) === filtro)
  const semValor = alunos.filter((a) => !contratos[a.id] || !Number(contratos[a.id].valor_mensal)).length

  if (carregando) return <p className="suave">Carregando…</p>

  return (
    <section className="secao">
      <div className="comunidade-topo">
        <div className="navegar-mes">
          <button className="botao fantasma" onClick={() => setMes((m) => somarMeses(m, -1))} aria-label="Mês anterior">‹</button>
          <h2>Financeiro · {MESES[mes.getMonth()]} {mes.getFullYear()}</h2>
          <button className="botao fantasma" onClick={() => setMes((m) => somarMeses(m, 1))} aria-label="Próximo mês">›</button>
        </div>
        <button className="botao primario" onClick={gerarCobrancas}>Gerar cobranças do mês</button>
      </div>
      <p className="suave pequeno" style={{ marginTop: -6 }}>Só você (CEO) vê esta aba. Defina o valor de cada aluno uma vez e gere as cobranças todo mês com um clique.</p>

      {erro && <p className="erro">{erro}</p>}
      {aviso && !erro && <p className="aviso-ok" role="status">✓ {aviso}</p>}
      {semValor > 0 && <p className="aviso-info">ℹ️ {semValor} {semValor === 1 ? 'aluno ainda não tem' : 'alunos ainda não têm'} valor de mensalidade. Clique em “definir valor” na lista abaixo.</p>}

      <div className="resumo-cartoes resumo-fin">
        <div className="cartao mini" style={{ '--cor': '#495057' }}><span className="mini-titulo">Previsto</span><strong className="mini-numero fin">{reais(totais.previsto)}</strong><span className="suave pequeno">{cobrancas.length} cobranças</span></div>
        <div className="cartao mini" style={{ '--cor': '#2f9e44' }}><span className="mini-titulo">Recebido</span><strong className="mini-numero fin">{reais(totais.recebido)}</strong><span className="suave pequeno">{totais.previsto ? Math.round((totais.recebido / totais.previsto) * 100) : 0}% do previsto</span></div>
        <div className="cartao mini" style={{ '--cor': '#e67700' }}><span className="mini-titulo">Em aberto</span><strong className="mini-numero fin">{reais(totais.aberto)}</strong><span className="suave pequeno">ainda no prazo</span></div>
        <div className="cartao mini" style={{ '--cor': '#c92a2a' }}><span className="mini-titulo">Atrasado</span><strong className="mini-numero fin">{reais(totais.atrasado)}</strong><span className="suave pequeno">vencimento passou</span></div>
        <div className="cartao mini" style={{ '--cor': '#7048e8' }}><span className="mini-titulo">Fica com você</span><strong className="mini-numero fin">{reais(totais.recebido - totalRepasse)}</strong><span className="suave pequeno">recebido − repasses ({reais(totalRepasse)})</span></div>
      </div>

      {editando && (
        <FormContrato
          aluno={editando}
          contrato={contratos[editando.id]}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }}
        />
      )}

      <div className="cartao">
        <div className="alunos-topo">
          <h2 style={{ margin: 0 }}>Mensalidades</h2>
          <div className="filtros">
            {[['todos', 'Todos'], ['pago', 'Pagos'], ['aberto', 'Em aberto'], ['atrasado', 'Atrasados'], ['sem', 'Sem cobrança']].map(([k, n]) => (
              <button key={k} className={filtro === k ? 'filtro ativo' : 'filtro'} onClick={() => setFiltro(k)}>{n}</button>
            ))}
          </div>
        </div>
        <div className="tabela-rolagem">
          <table className="tabela tabela-alunos">
            <thead>
              <tr><th>Aluno</th><th className="num">Valor</th><th>Vencimento</th><th>Situação</th><th></th></tr>
            </thead>
            <tbody>
              {listados.map((a) => {
                const c = cobrancaDe(a.id)
                const s = status(c)
                const ct = contratos[a.id]
                const wpp = c && !c.pago_em ? linkCobranca(a, c) : null
                return (
                  <tr key={a.id}>
                    <td>
                      <span className="atendimento-aluno">
                        <Avatar src={a.foto_url} nome={a.nome || a.email} tamanho={30} />
                        <span className="atendimento-aluno-texto">
                          <strong>{a.nome || a.email}</strong>
                          <span className="suave pequeno">{ct?.responsavel ? `Resp.: ${ct.responsavel}` : a.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="num">{c ? reais(c.valor) : ct && Number(ct.valor_mensal) ? <span className="suave">{reais(ct.valor_mensal)}</span> : '—'}</td>
                    <td>{c ? dataBR(c.vencimento) : ct ? <span className="suave">dia {ct.dia_vencimento}</span> : '—'}</td>
                    <td>
                      <span className={`fin-status fin-${s}`}>
                        {s === 'pago' && `✓ Pago ${dataBR(c.pago_em)}`}
                        {s === 'aberto' && 'Em aberto'}
                        {s === 'atrasado' && 'Atrasado'}
                        {s === 'sem' && 'Sem cobrança'}
                      </span>
                    </td>
                    <td className="acoes-tabela">
                      {c && !c.pago_em && <button className="link" onClick={() => marcarPago(c, true)}>marcar pago</button>}
                      {c && c.pago_em && <button className="link" onClick={() => marcarPago(c, false)}>desfazer</button>}
                      {wpp && <a className="link" href={wpp} target="_blank" rel="noreferrer">cobrar no WhatsApp</a>}
                      <button className="link" onClick={() => setEditando(a)}>{ct && Number(ct.valor_mensal) ? 'contrato' : 'definir valor'}</button>
                      {c && <button className="link perigo" onClick={() => apagarCobranca(c, a.nome)}>apagar</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {listados.length === 0 && <p className="suave" style={{ marginBottom: 0 }}>Nenhum aluno nesta situação.</p>}
      </div>

      <div className="cartao">
        <h2>Repasse aos mentores</h2>
        <p className="suave pequeno">Percentual do valor <b>recebido</b> dos alunos de cada mentor neste mês.</p>
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
    </section>
  )
}

function FormContrato({ aluno, contrato, onFechar, onSalvo }) {
  const [valor, setValor] = useState(contrato ? String(contrato.valor_mensal).replace('.', ',') : '')
  const [dia, setDia] = useState(contrato?.dia_vencimento ?? 10)
  const [responsavel, setResponsavel] = useState(contrato?.responsavel ?? '')
  const [telefone, setTelefone] = useState(contrato?.telefone ?? '')
  const [observacoes, setObservacoes] = useState(contrato?.observacoes ?? '')
  const [erro, setErro] = useState('')

  async function salvar(e) {
    e.preventDefault()
    const { error } = await supabase.from('contratos').upsert({
      aluno_id: aluno.id,
      valor_mensal: num(valor),
      dia_vencimento: Math.max(1, Math.min(28, Number(dia) || 10)),
      responsavel: responsavel.trim(),
      telefone: telefone.trim(),
      observacoes: observacoes.trim(),
    })
    if (error) return setErro('Não foi possível salvar: ' + error.message)
    onSalvo()
  }

  return (
    <form className="cartao" onSubmit={salvar}>
      <h2>Contrato — {aluno.nome || aluno.email}</h2>
      <div className="grade-form">
        <label>Mensalidade (R$)<input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Ex.: 350,00" required /></label>
        <label>Dia do vencimento<input type="number" min="1" max="28" value={dia} onChange={(e) => setDia(e.target.value)} /></label>
        <label>Responsável (quem paga)<input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Ex.: Ana (mãe)" /></label>
        <label>WhatsApp do responsável<input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="(84) 99999-9999" /></label>
        <label className="largo">Observações<input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: plano único até o ENEM, pago no Pix" /></label>
      </div>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao fantasma" onClick={onFechar}>Cancelar</button>
        <button className="botao primario">Salvar contrato</button>
      </div>
    </form>
  )
}
