import { useState } from 'react'
import { supabase } from './supabase'

export default function TrocarSenha({ onFechar, obrigatoria = false }) {
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e) {
    e.preventDefault()
    if (senha.length < 6) return setMsg('A senha precisa ter pelo menos 6 caracteres.')
    if (senha !== confirma) return setMsg('As duas senhas não são iguais.')
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha, data: { trocar_senha: false } })
    setSalvando(false)
    if (error) return setMsg('Não foi possível trocar a senha: ' + error.message)
    setOk(true)
    setMsg('Senha trocada com sucesso!')
  }

  return (
    <div className="fundo-modal" onClick={obrigatoria ? undefined : onFechar}>
      <div className="cartao modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>{obrigatoria ? 'Crie a sua senha' : 'Trocar senha'}</h2>
        {obrigatoria && !ok && <p className="suave">Por segurança, troque a senha que chegou por e-mail por uma só sua antes de continuar.</p>}
        {ok ? (
          <>
            <p>{msg}</p>
            <button className="botao primario" onClick={onFechar}>Fechar</button>
          </>
        ) : (
          <form className="form-coluna" onSubmit={salvar}>
            <label>
              Nova senha
              <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </label>
            <label>
              Repita a nova senha
              <input type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
            </label>
            {msg && <p className="erro">{msg}</p>}
            <div className="linha-botoes">
              {!obrigatoria && <button type="button" className="botao fantasma" onClick={onFechar}>Cancelar</button>}
              <button className="botao primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
