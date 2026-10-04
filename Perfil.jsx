import { useRef, useState } from 'react'
import { supabase } from './supabase'
import { enviarFoto, removerFoto } from './foto'
import Avatar from './Avatar'

export default function Perfil({ perfil, onAtualizado, onTrocarSenha, onFechar }) {
  const [nome, setNome] = useState(perfil.nome || '')
  const [foto, setFoto] = useState(perfil.foto_url || null)
  const [enviando, setEnviando] = useState(false)
  const [salvandoNome, setSalvandoNome] = useState(false)
  const [msg, setMsg] = useState({ tipo: '', texto: '' })
  const seletor = useRef(null)

  const suporta = 'foto_url' in perfil // perfil.sql já foi rodado?

  async function escolherFoto(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setEnviando(true)
    setMsg({ tipo: '', texto: '' })
    try {
      const url = await enviarFoto(perfil.id, arquivo)
      setFoto(url)
      onAtualizado({ foto_url: url })
      setMsg({ tipo: 'ok', texto: 'Foto atualizada!' })
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message })
    }
    setEnviando(false)
  }

  async function tirarFoto() {
    if (!confirm('Remover sua foto de perfil?')) return
    setEnviando(true)
    try {
      await removerFoto(perfil.id)
      setFoto(null)
      onAtualizado({ foto_url: null })
      setMsg({ tipo: 'ok', texto: 'Foto removida.' })
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message })
    }
    setEnviando(false)
  }

  async function salvarNome(e) {
    e.preventDefault()
    const limpo = nome.trim()
    if (!limpo) return setMsg({ tipo: 'erro', texto: 'O nome não pode ficar vazio.' })
    setSalvandoNome(true)
    const { error } = await supabase.from('perfis').update({ nome: limpo }).eq('id', perfil.id)
    setSalvandoNome(false)
    if (error) return setMsg({ tipo: 'erro', texto: 'Não foi possível salvar o nome: ' + error.message })
    onAtualizado({ nome: limpo })
    setMsg({ tipo: 'ok', texto: 'Nome salvo!' })
  }

  return (
    <div className="fundo-modal" onClick={onFechar}>
      <div className="cartao modal modal-perfil" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="titulo-perfil">
        <div className="modal-topo">
          <h2 id="titulo-perfil">Meu perfil</h2>
          <button className="botao fantasma pequeno" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="perfil-foto">
          <div className={enviando ? 'perfil-avatar enviando' : 'perfil-avatar'}>
            <Avatar src={foto} nome={nome || perfil.email} tamanho={112} />
          </div>
          {suporta ? (
            <div className="perfil-foto-acoes">
              <input ref={seletor} type="file" accept="image/*" onChange={escolherFoto} hidden />
              <button className="botao primario pequeno" onClick={() => seletor.current?.click()} disabled={enviando}>
                {enviando ? 'Enviando…' : foto ? 'Trocar foto' : 'Colocar foto'}
              </button>
              {foto && !enviando && (
                <button className="botao fantasma pequeno" onClick={tirarFoto}>Remover</button>
              )}
            </div>
          ) : (
            <p className="suave pequeno centro">A troca de foto ainda não foi ativada pelo mentor.</p>
          )}
        </div>

        <form className="form-coluna" onSubmit={salvarNome}>
          <label>
            Nome
            <div className="linha-campo">
              <input value={nome} maxLength={80} onChange={(e) => { setNome(e.target.value); setMsg({ tipo: '', texto: '' }) }} />
              {nome.trim() !== (perfil.nome || '') && (
                <button className="botao primario pequeno" disabled={salvandoNome}>{salvandoNome ? 'Salvando…' : 'Salvar'}</button>
              )}
            </div>
          </label>
        </form>

        <p className="suave pequeno perfil-email">E-mail de acesso: {perfil.email}</p>

        {'mostrar_contagem' in perfil && (
          <label className="caixa-marcar">
            <input
              type="checkbox"
              checked={perfil.mostrar_contagem !== false}
              onChange={async (e) => {
                const v = e.target.checked
                onAtualizado({ mostrar_contagem: v })
                await supabase.from('perfis').update({ mostrar_contagem: v }).eq('id', perfil.id)
              }}
            />
            <span>Mostrar a contagem regressiva do ENEM</span>
          </label>
        )}

        {msg.texto && <p className={msg.tipo === 'erro' ? 'erro' : 'aviso-ok'} role="status">{msg.texto}</p>}

        <div className="linha-botoes perfil-rodape">
          <button className="botao fantasma" onClick={onTrocarSenha}>🔒 Trocar senha</button>
          <button className="botao" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
