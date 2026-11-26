import { useState } from 'react'
import { supabase } from './supabase'
import { NOME_SITE, INSTAGRAM } from './constants'

const OPCOES = [['sim', 'Sim, com certeza'], ['talvez', 'Talvez'], ['nao', 'Não']]

// Página pública /feedback: rápida (menos de 2 minutos), sem login e anônima por padrão
export default function Feedback() {
  const [f, setF] = useState({ mais: '', menos: '', continuaria: '', anonimo: true, nome: '', site: '' })
  const [estado, setEstado] = useState({ tipo: '', texto: '' })
  const muda = (k, v) => { setF((x) => ({ ...x, [k]: v })); if (estado.tipo === 'erro') setEstado({ tipo: '', texto: '' }) }

  async function enviar(e) {
    e.preventDefault()
    if (f.site) return setEstado({ tipo: 'ok' }) // campo escondido: só robôs preenchem
    if (!f.mais.trim() && !f.menos.trim() && !f.continuaria) return setEstado({ tipo: 'erro', texto: 'Responda pelo menos uma pergunta.' })
    if (!f.anonimo && f.nome.trim().length < 2) return setEstado({ tipo: 'erro', texto: 'Coloque o seu nome ou marque "Prefiro ficar anônimo".' })
    setEstado({ tipo: 'enviando' })
    const { error } = await supabase.from('feedbacks').insert({
      mais_gostou: f.mais.trim().slice(0, 1500),
      menos_gostou: f.menos.trim().slice(0, 1500),
      continuaria: f.continuaria || null,
      anonimo: f.anonimo,
      nome: f.anonimo ? null : f.nome.trim().slice(0, 80),
    })
    if (error) return setEstado({ tipo: 'erro', texto: error.message.includes('Muitos envios') ? error.message : 'Não foi possível enviar agora. Tente de novo em instantes.' })
    setEstado({ tipo: 'ok' })
  }

  return (
    <div className="fb-tela">
      <main className="fb-cartao">
        <div className="fb-marca"><img src="/favicon.svg?v=2" alt="" /> <b>{NOME_SITE}</b></div>
        {estado.tipo === 'ok' ? (
          <div className="fb-obrigado" role="status">
            <span aria-hidden="true">💚</span>
            <h1>Obrigado pelo <em>feedback!</em></h1>
            <p>Cada resposta ajuda a gente a deixar a assessoria melhor para você e para quem vem depois.</p>
            {INSTAGRAM && <a className="botao" href={`https://instagram.com/${INSTAGRAM}`} target="_blank" rel="noreferrer">Seguir @{INSTAGRAM}</a>}
          </div>
        ) : (
          <form onSubmit={enviar} noValidate>
            <span className="fb-kicker">Leva menos de 2 minutos</span>
            <h1>Conta pra gente como foi a <em>assessoria</em></h1>
            <p className="suave">Pode ser sincero(a): é anônimo, a não ser que você queira se identificar.</p>

            <label className="fb-campo">
              <span>💚 O que você <b>mais gostou</b>?</span>
              <textarea rows={3} maxLength={1500} value={f.mais} onChange={(e) => muda('mais', e.target.value)} placeholder="Ex.: os simulados, o horário de estudos, o acompanhamento…" />
            </label>

            <label className="fb-campo">
              <span>🛠️ O que você <b>menos gostou</b> ou acha que <b>pode melhorar</b>?</span>
              <textarea rows={3} maxLength={1500} value={f.menos} onChange={(e) => muda('menos', e.target.value)} placeholder="Ex.: mais aulas ao vivo, mais questões de matemática…" />
            </label>

            <fieldset className="fb-campo">
              <legend>🎯 Se você não passar agora, <b>continuaria com a gente no próximo ano</b>?</legend>
              <div className="fb-opcoes">
                {OPCOES.map(([v, t]) => (
                  <label key={v} className={f.continuaria === v ? 'fb-opcao ativa' : 'fb-opcao'}>
                    <input type="radio" name="continuaria" value={v} checked={f.continuaria === v} onChange={() => muda('continuaria', v)} /> {t}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="fb-campo">
              <legend>🙈 Quer se identificar?</legend>
              <div className="fb-opcoes">
                <label className={f.anonimo ? 'fb-opcao ativa' : 'fb-opcao'}>
                  <input type="radio" name="anonimo" checked={f.anonimo} onChange={() => muda('anonimo', true)} /> Prefiro ficar anônimo
                </label>
                <label className={!f.anonimo ? 'fb-opcao ativa' : 'fb-opcao'}>
                  <input type="radio" name="anonimo" checked={!f.anonimo} onChange={() => muda('anonimo', false)} /> Quero me identificar
                </label>
              </div>
              {!f.anonimo && (
                <input className="fb-nome" value={f.nome} maxLength={80} autoComplete="name" onChange={(e) => muda('nome', e.target.value)} placeholder="Seu nome" aria-label="Seu nome" autoFocus />
              )}
            </fieldset>

            <input className="fb-robo" tabIndex={-1} autoComplete="off" value={f.site} onChange={(e) => muda('site', e.target.value)} aria-hidden="true" />

            {estado.tipo === 'erro' && <p className="erro" role="alert">{estado.texto}</p>}
            <button className="botao lima grande fb-enviar" disabled={estado.tipo === 'enviando'}>{estado.tipo === 'enviando' ? 'Enviando…' : 'Enviar feedback'}</button>
            <p className="suave pequeno centro">{f.anonimo ? 'Sem nome, sem e-mail: ninguém sabe quem respondeu.' : 'Só a coordenação da assessoria vê as respostas.'}</p>
          </form>
        )}
      </main>
    </div>
  )
}
