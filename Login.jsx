import { useState } from 'react'
import { supabase } from './supabase'
import {
  NOME_SITE, NOME_MENTOR, INSTAGRAM, FOTO_MENTOR, FOTO_PERFIL, FRASE_LOGIN, FOTOS_AULAS,
} from './constants'
import Avatar from './Avatar'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setEntrando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    })
    setEntrando(false)
    if (error) {
      setErro(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível entrar. Tente de novo em instantes.'
      )
    }
  }

  return (
    <div className="login-tela">
      <div className="login-moldura">
        <aside className="login-retrato">
          <img src={FOTO_PERFIL} alt={`${NOME_MENTOR}, mentor`} />
          <div className="login-retrato-texto">
            <span className="selo-mentor">Mentor ENEM</span>
            <p>{FRASE_LOGIN}</p>
          </div>
        </aside>

        <div className="login-cartao">
          <div className="login-topo">
            <span className="so-celular">
              <Avatar src={FOTO_MENTOR} nome={NOME_MENTOR} tamanho={84} />
            </span>
            <h1>{NOME_SITE}</h1>
            <p className="suave">
              com {NOME_MENTOR}
              {INSTAGRAM && (
                <>
                  {' · '}
                  <a href={`https://instagram.com/${INSTAGRAM}`} target="_blank" rel="noreferrer">
                    @{INSTAGRAM}
                  </a>
                </>
              )}
            </p>
          </div>

          <form onSubmit={entrar} className="form-coluna">
            <label>
              E-mail
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </label>
            {erro && <p className="erro">{erro}</p>}
            <button className="botao primario" disabled={entrando}>
              {entrando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <p className="suave pequeno centro">Use o e-mail e a senha que seu mentor enviou.</p>
        </div>
      </div>

      {FOTOS_AULAS.length > 0 && (
        <section className="faixa-aulas" aria-label="Fotos das aulas da mentoria">
          <p className="faixa-titulo">Nas aulas da mentoria</p>
          <div className="faixa-trilho">
            {[...FOTOS_AULAS, ...FOTOS_AULAS].map((src, i) => (
              <img
                key={i}
                src={src}
                alt={i < FOTOS_AULAS.length ? 'Aula da mentoria' : ''}
                aria-hidden={i >= FOTOS_AULAS.length}
                loading="lazy"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
