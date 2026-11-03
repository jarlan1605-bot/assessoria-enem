import { useState } from 'react'

export const SITUACOES = ['Estou no 2º ano', 'Estou no 3º ano', 'Já terminei o ensino médio', 'Faço cursinho', 'Outro']
const CURSOS = ['Medicina', 'Direito', 'Engenharias', 'Odontologia', 'Psicologia', 'Outro curso']
const DIFICULDADES = ['Matemática', 'Natureza', 'Redação', 'Linguagens', 'Humanas', 'Organizar a rotina']
const CANAIS = ['Instagram', 'Indicação de amigo', 'TikTok', 'Google', 'Outro']

const VAZIO = { nome: '', whatsapp: '', email: '', idade: '', cidade: '', situacao: '', curso: '', dificuldade: [], como_conheceu: '', responsavel: '', mensagem: '', site: '' }

// Formulário da página de apresentação: inscrição de 2027 com pagamento pelo Mercado Pago
export default function FormInteresse() {
  const [f, setF] = useState(VAZIO)
  const [estado, setEstado] = useState({ tipo: '', texto: '' })
  const muda = (k, v) => { setF((x) => ({ ...x, [k]: v })); if (estado.tipo === 'erro') setEstado({ tipo: '', texto: '' }) }
  const alterna = (v) => muda('dificuldade', f.dificuldade.includes(v) ? f.dificuldade.filter((x) => x !== v) : [...f.dificuldade, v])

  async function enviar(e) {
    e.preventDefault()
    if (f.site) return setEstado({ tipo: 'erro', texto: 'Não foi possível enviar.' }) // campo escondido: só robôs preenchem
    const zap = f.whatsapp.replace(/\D/g, '')
    if (f.nome.trim().length < 2) return setEstado({ tipo: 'erro', texto: 'Coloque o seu nome.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setEstado({ tipo: 'erro', texto: 'Coloque um e-mail válido. É com ele que você vai entrar na plataforma.' })
    if (zap.length < 10 || zap.length > 13) return setEstado({ tipo: 'erro', texto: 'Coloque um WhatsApp com DDD, por exemplo (84) 99999-9999.' })
    if (!f.situacao) return setEstado({ tipo: 'erro', texto: 'Conte em que fase dos estudos você está.' })
    setEstado({ tipo: 'enviando', texto: '' })
    try {
      const r = await fetch('/api/inscricao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'criar', ...f, dificuldade: f.dificuldade.join(', ') }),
      })
      const j = await r.json().catch(() => ({ erro: 'O servidor não respondeu. Tente de novo em instantes.' }))
      if (!r.ok || j.erro || !j.link) return setEstado({ tipo: 'erro', texto: j.erro || 'Não foi possível abrir o pagamento.' })
      try { localStorage.setItem('inscricaoJC', j.id) } catch { /* sem armazenamento */ }
      setEstado({ tipo: 'indo', texto: '' })
      window.location.href = j.link // página de pagamento do Mercado Pago
    } catch {
      setEstado({ tipo: 'erro', texto: 'Sem conexão. Tente de novo em instantes.' })
    }
  }

  return (
    <section className="lp-secao lp-interesse" id="interesse">
      <div className="lp-interesse-caixa">
        <div className="lp-interesse-lado">
          <span className="lp-etiqueta">✦ Inscrições 2027</span>
          <h2>Garanta seu lugar na mentoria <em>de 2027</em></h2>
          <p>As vagas são limitadas porque o acompanhamento é de perto. Preencha, pague com segurança pelo Mercado Pago e, assim que o pagamento for confirmado, escolha o seu assessor e receba o acesso à plataforma.</p>
          <p className="lp-interesse-preco"><strong>R$ 1.800</strong> <span>pagamento único · Pix, cartão ou boleto</span></p>
          <ul className="lp-interesse-lista">
            <li>🗓️ Horário de estudos sob medida</li>
            <li>📈 Simulados acompanhados</li>
            <li>🤝 Mentor individual até o ENEM</li>
            <li>🎯 Você escolhe o seu assessor</li>
          </ul>
        </div>

        {estado.tipo === 'ok' ? (
          <div className="lp-interesse-ok" role="status">
            <span aria-hidden="true">🎉</span>
            <h3>Você está na lista!</h3>
            <p>Recebemos o seu interesse. Assim que as vagas de 2027 abrirem, a gente te chama no WhatsApp.</p>
            <button className="lp-botao lp-botao-contorno" onClick={() => setEstado({ tipo: '', texto: '' })}>Enviar outro cadastro</button>
          </div>
        ) : (
          <form className="lp-form" onSubmit={enviar} noValidate>
            <div className="lp-form-duas">
              <label>Seu nome*<input value={f.nome} onChange={(e) => muda('nome', e.target.value)} maxLength={100} autoComplete="name" placeholder="Como podemos te chamar?" /></label>
              <label>WhatsApp com DDD*<input value={f.whatsapp} onChange={(e) => muda('whatsapp', e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(84) 99999-9999" /></label>
              <label>E-mail* (vai ser o seu login)<input type="email" value={f.email} onChange={(e) => muda('email', e.target.value)} maxLength={120} autoComplete="email" placeholder="voce@email.com" /></label>
              <label>Idade<input type="number" min="10" max="80" value={f.idade} onChange={(e) => muda('idade', e.target.value)} placeholder="17" /></label>
              <label>Cidade<input value={f.cidade} onChange={(e) => muda('cidade', e.target.value)} maxLength={80} placeholder="Caicó (RN)" /></label>
              <label>Curso dos sonhos
                <input value={f.curso} onChange={(e) => muda('curso', e.target.value)} maxLength={80} list="lp-cursos" placeholder="Medicina" />
                <datalist id="lp-cursos">{CURSOS.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
            </div>

            <fieldset className="lp-chips-campo">
              <legend>Em que fase você está?*</legend>
              <div className="lp-chips">
                {SITUACOES.map((s) => (
                  <button type="button" key={s} className={f.situacao === s ? 'lp-chip ativo' : 'lp-chip'} aria-pressed={f.situacao === s} onClick={() => muda('situacao', s)}>{s}</button>
                ))}
              </div>
            </fieldset>

            <fieldset className="lp-chips-campo">
              <legend>Onde você mais precisa de ajuda?</legend>
              <div className="lp-chips">
                {DIFICULDADES.map((d) => (
                  <button type="button" key={d} className={f.dificuldade.includes(d) ? 'lp-chip ativo' : 'lp-chip'} aria-pressed={f.dificuldade.includes(d)} onClick={() => alterna(d)}>{d}</button>
                ))}
              </div>
            </fieldset>

            <fieldset className="lp-chips-campo">
              <legend>Como conheceu a mentoria?</legend>
              <div className="lp-chips">
                {CANAIS.map((c) => (
                  <button type="button" key={c} className={f.como_conheceu === c ? 'lp-chip ativo' : 'lp-chip'} aria-pressed={f.como_conheceu === c} onClick={() => muda('como_conheceu', f.como_conheceu === c ? '' : c)}>{c}</button>
                ))}
              </div>
            </fieldset>

            <label>Nome do responsável (se for menor de idade)<input value={f.responsavel} onChange={(e) => muda('responsavel', e.target.value)} maxLength={100} placeholder="Opcional" /></label>
            <label>Quer contar algo? (opcional)<textarea rows={3} value={f.mensagem} onChange={(e) => muda('mensagem', e.target.value)} maxLength={600} placeholder="Sua meta, sua rotina, suas dúvidas…" /></label>
            <label className="lp-escondido" aria-hidden="true">Site<input tabIndex={-1} autoComplete="off" value={f.site} onChange={(e) => muda('site', e.target.value)} /></label>

            {estado.tipo === 'erro' && <p className="lp-form-erro" role="alert">{estado.texto}</p>}
            <button className="lp-botao lp-botao-cheio lp-form-enviar" disabled={estado.tipo === 'enviando' || estado.tipo === 'indo'}>
              {estado.tipo === 'enviando' ? 'Preparando o pagamento…' : estado.tipo === 'indo' ? 'Abrindo o Mercado Pago…' : 'Inscrever e pagar R$ 1.800 →'}
            </button>
            <p className="lp-form-nota">🔒 O pagamento é feito no site do Mercado Pago. Seus dados ficam só com a equipe da assessoria.</p>
          </form>
        )}
      </div>
    </section>
  )
}
