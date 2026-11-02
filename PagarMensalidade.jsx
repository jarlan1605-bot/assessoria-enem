import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { reais, dataBR } from './cobranca'

// Chama a função do Vercel que conversa com o Mercado Pago
export async function chamarPix(corpo) {
  const { data } = await supabase.auth.getSession()
  const r = await fetch('/api/mercadopago', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify(corpo),
  })
  const j = await r.json().catch(() => ({ erro: 'O servidor não respondeu. Tente de novo em instantes.' }))
  if (!r.ok || j.erro) throw new Error(j.erro || `Erro ${r.status}`)
  return j
}

// Aviso para o aluno quando a mensalidade está perto de vencer, com o Pix para pagar no site
export default function PagarMensalidade() {
  const [info, setInfo] = useState(null)
  const [aberto, setAberto] = useState(false)

  const carregar = useCallback(() => {
    chamarPix({ acao: 'minha' }).then(setInfo).catch(() => setInfo(null))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  if (!info?.mostrar || !info.disponivel) return null
  const atrasado = info.dias < 0
  const quando = info.dias === 0 ? 'vence hoje' : info.dias === 1 ? 'vence amanhã' : atrasado ? `venceu em ${dataBR(info.vencimento)}` : `vence em ${dataBR(info.vencimento)}`

  return (
    <>
      <button className={atrasado ? 'pix-aviso atrasado' : 'pix-aviso'} onClick={() => setAberto(true)}>
        <span className="pix-aviso-icone" aria-hidden="true">💳</span>
        <span className="pix-aviso-texto">
          <strong>Sua mensalidade {quando}</strong>
          <span>{reais(info.valor)} · pague por Pix aqui mesmo, a baixa é automática</span>
        </span>
        <span className="pix-aviso-botao">Pagar com Pix →</span>
      </button>
      {aberto && <JanelaPix info={info} onFechar={(pago) => { setAberto(false); if (pago) carregar() }} />}
    </>
  )
}

function JanelaPix({ info, onFechar }) {
  const [pix, setPix] = useState(info.pix)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [pago, setPago] = useState(false)
  const [conferindo, setConferindo] = useState(false)

  useEffect(() => {
    if (pix) return
    chamarPix({ acao: 'gerar' }).then((r) => setPix(r.pix)).catch((e) => setErro(e.message))
  }, [pix])

  // confere sozinho a cada 8 segundos enquanto a janela está aberta
  useEffect(() => {
    if (!pix || pago) return
    const t = setInterval(() => {
      chamarPix({ acao: 'conferir' }).then((r) => { if (r.pago) setPago(true) }).catch(() => {})
    }, 8000)
    return () => clearInterval(t)
  }, [pix, pago])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pix.copia_cola)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErro('Não deu para copiar. Selecione o código e copie manualmente.')
    }
  }

  async function jaPaguei() {
    setConferindo(true)
    try {
      const r = await chamarPix({ acao: 'conferir' })
      if (r.pago) setPago(true)
      else setErro('Ainda não recebemos a confirmação. Às vezes leva alguns segundos: tente de novo daqui a pouco.')
    } catch (e) {
      setErro(e.message)
    }
    setConferindo(false)
  }

  return (
    <div className="fundo-modal" onClick={(e) => { if (e.target === e.currentTarget) onFechar(pago) }}>
      <div className="cartao modal pix-modal" role="dialog" aria-modal="true" aria-label="Pagar com Pix">
        <div className="modal-topo">
          <h2>{pago ? 'Pagamento confirmado!' : 'Pagar com Pix'}</h2>
          <button className="botao fantasma pequeno" onClick={() => onFechar(pago)} aria-label="Fechar">✕</button>
        </div>
        {pago ? (
          <div className="pix-ok">
            <span aria-hidden="true">🎉</span>
            <p>Recebemos o seu Pix de <b>{reais(info.valor)}</b>. Obrigado! Não precisa mandar comprovante.</p>
            <button className="botao primario" onClick={() => onFechar(true)}>Fechar</button>
          </div>
        ) : (
          <>
            <p className="pix-valor">{reais(info.valor)} <span className="suave">· vencimento {dataBR(info.vencimento)}</span></p>
            {!pix && !erro && <p className="suave">Gerando o seu Pix…</p>}
            {pix && (
              <>
                {pix.qr_base64 && <img className="pix-qr" src={`data:image/png;base64,${pix.qr_base64}`} alt="QR Code do Pix" />}
                <p className="suave pequeno centro" style={{ margin: '4px 0 10px' }}>Abra o app do seu banco, escolha Pix e aponte a câmera, ou use o “copia e cola”:</p>
                <div className="pix-codigo"><code>{pix.copia_cola}</code></div>
                <div className="linha-botoes" style={{ justifyContent: 'center' }}>
                  <button className="botao primario" onClick={copiar}>{copiado ? '✓ Copiado!' : 'Copiar código Pix'}</button>
                  <button className="botao" onClick={jaPaguei} disabled={conferindo}>{conferindo ? 'Conferindo…' : 'Já paguei'}</button>
                </div>
                <p className="suave pequeno centro" style={{ marginBottom: 0 }}>Assim que o pagamento cair, esta tela confirma sozinha.</p>
              </>
            )}
            {erro && <p className="erro">{erro}</p>}
          </>
        )}
      </div>
    </div>
  )
}
