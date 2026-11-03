import { useCallback, useEffect, useState } from 'react'

async function chamar(corpo) {
  const r = await fetch('/api/inscricao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({ erro: 'O servidor não respondeu. Tente de novo em instantes.' }))
  if (!r.ok || j.erro) throw new Error(j.erro || `Erro ${r.status}`)
  return j
}

// Tela que aparece quando o aluno volta do Mercado Pago (?inscricao=...):
// confere o pagamento, deixa escolher o assessor e mostra o acesso à plataforma.
export default function InscricaoRetorno({ id, onEntrar, onFechar }) {
  const [info, setInfo] = useState(null)
  const [erro, setErro] = useState('')
  const [escolhendo, setEscolhendo] = useState('')
  const [conta, setConta] = useState(null)
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(() => {
    chamar({ acao: 'status', id }).then((r) => { setInfo(r); setErro('') }).catch((e) => setErro(e.message))
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  // enquanto o pagamento não confirma (Pix ou boleto), confere de novo a cada 6 segundos
  useEffect(() => {
    if (!info || info.pago) return
    const t = setInterval(carregar, 6000)
    return () => clearInterval(t)
  }, [info, carregar])

  async function escolher(m) {
    if (!confirm(`Confirmar ${m.nome.split(' ')[0]} como seu assessor? Essa escolha não pode ser trocada por aqui.`)) return
    setEscolhendo(m.id)
    setErro('')
    try {
      setConta(await chamar({ acao: 'escolher', id, mentor_id: m.id }))
      try { localStorage.removeItem('inscricaoJC') } catch { /* sem armazenamento */ }
    } catch (e) {
      setErro(e.message)
    }
    setEscolhendo('')
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`Login: ${conta.email}\nSenha: ${conta.senha}`)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch { /* o aluno pode copiar à mão */ }
  }

  let corpo
  if (conta) {
    corpo = (
      <div className="insc-ok">
        <span className="insc-emoji" aria-hidden="true">🎉</span>
        <h2>Bem-vindo(a) à <em>Assessoria J&C!</em></h2>
        <p>Sua conta foi criada e o seu assessor é <b>{conta.assessor}</b>. Guarde o seu acesso:</p>
        <div className="insc-acesso">
          <div><small>Login (e-mail)</small><strong>{conta.email}</strong></div>
          <div><small>Senha</small><strong className="insc-senha">{conta.senha}</strong></div>
        </div>
        <p className="insc-aviso">📸 Tire um print desta tela. Depois de entrar, você pode trocar a senha em <b>Meu perfil → Trocar senha</b>.</p>
        <div className="insc-botoes">
          <button className="lp-botao lp-botao-contorno" onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar login e senha'}</button>
          <button className="lp-botao lp-botao-cheio" onClick={onEntrar}>Entrar na plataforma →</button>
        </div>
      </div>
    )
  } else if (!info && !erro) {
    corpo = <p className="insc-carregando">Conferindo o seu pagamento…</p>
  } else if (!info) {
    corpo = <p className="lp-form-erro">{erro}</p>
  } else if (info.contaCriada) {
    corpo = (
      <div className="insc-ok">
        <span className="insc-emoji" aria-hidden="true">✅</span>
        <h2>Sua inscrição já está <em>completa</em></h2>
        <p>{info.assessor ? <>Seu assessor é <b>{info.assessor}</b>. </> : null}Entre na plataforma com o e-mail <b>{info.email}</b>.</p>
        <p className="insc-aviso">Esqueceu a senha? Fale com a gente pelo WhatsApp que a gente redefine.</p>
        <div className="insc-botoes"><button className="lp-botao lp-botao-cheio" onClick={onEntrar}>Entrar na plataforma →</button></div>
      </div>
    )
  } else if (!info.pago) {
    corpo = (
      <div className="insc-ok">
        <span className="insc-emoji" aria-hidden="true">⏳</span>
        <h2>{info.pendente ? <>Pagamento <em>em análise</em></> : <>Falta só o <em>pagamento</em></>}</h2>
        <p>
          {info.pendente
            ? 'Recebemos o seu pedido. Assim que o Mercado Pago confirmar (no Pix leva poucos segundos; no boleto, até 3 dias úteis), esta tela libera a escolha do assessor sozinha.'
            : `${info.nome}, a sua inscrição está salva, mas ainda não encontramos o pagamento.`}
        </p>
        <div className="insc-botoes">
          {info.link && <a className="lp-botao lp-botao-cheio" href={info.link}>{info.pendente ? 'Ver o pagamento' : `Pagar R$ ${Number(info.valor).toLocaleString('pt-BR')} →`}</a>}
          <button className="lp-botao lp-botao-contorno" onClick={carregar}>Já paguei, conferir</button>
        </div>
        <p className="insc-aviso">Pode fechar e voltar depois por este mesmo link.</p>
      </div>
    )
  } else {
    corpo = (
      <div>
        <div className="insc-topo">
          <span className="insc-emoji" aria-hidden="true">💚</span>
          <h2>Pagamento confirmado, {info.nome}! Agora <em>escolha seu assessor</em></h2>
          <p>Ele(a) vai montar o seu plano e acompanhar você até a prova.</p>
        </div>
        <div className="insc-assessores">
          {(info.assessores ?? []).map((m) => (
            <button key={m.id} className="insc-assessor" onClick={() => escolher(m)} disabled={!!escolhendo}>
              <span className="insc-foto">
                {m.foto_url ? <img src={m.foto_url} alt="" /> : <span>{(m.nome || '?').slice(0, 1)}</span>}
              </span>
              <strong>{m.nome}</strong>
              {m.caracteristicas?.length > 0 && <span className="insc-tags">{m.caracteristicas.slice(0, 3).join(' · ')}</span>}
              {m.legenda && <span className="insc-legenda">“{m.legenda}”</span>}
              <span className="lp-botao lp-botao-cheio insc-escolher">{escolhendo === m.id ? 'Criando sua conta…' : `Quero ${m.nome.split(' ')[0]}`}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="insc-fundo" role="dialog" aria-modal="true" aria-label="Sua inscrição">
      <div className="insc-caixa">
        {!conta && <button className="insc-fechar" onClick={onFechar} aria-label="Fechar">✕</button>}
        {corpo}
        {erro && info && <p className="lp-form-erro" role="alert">{erro}</p>}
      </div>
    </div>
  )
}
