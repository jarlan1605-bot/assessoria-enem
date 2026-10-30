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

        {(perfil.papel === 'mentor' || perfil.papel === 'ceo') && 'vitrine' in perfil && (
          <VitrineMentor perfil={perfil} onAtualizado={onAtualizado} />
        )}

        <div className="linha-botoes perfil-rodape">
          <button className="botao fantasma" onClick={onTrocarSenha}>🔒 Trocar senha</button>
          <button className="botao" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

// O que aparece na página de apresentação, na seção "Conheça os mentores"
function VitrineMentor({ perfil, onAtualizado }) {
  const [f, setF] = useState({
    vitrine: perfil.vitrine ?? false,
    disponivel: perfil.disponivel ?? true,
    nascimento: perfil.nascimento ?? '',
    naturalidade: perfil.naturalidade ?? '',
    caracteristicas: (perfil.caracteristicas ?? []).join(', '),
    legenda: perfil.legenda ?? '',
  })
  const [estado, setEstado] = useState({ tipo: '', texto: '' })
  const muda = (k, v) => { setF((x) => ({ ...x, [k]: v })); setEstado({ tipo: '', texto: '' }) }

  async function salvar(e) {
    e.preventDefault()
    const caracteristicas = f.caracteristicas.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 8).map((c) => c.slice(0, 40))
    const dados = {
      vitrine: f.vitrine,
      disponivel: f.disponivel,
      nascimento: f.nascimento || null,
      naturalidade: f.naturalidade.trim().slice(0, 80),
      caracteristicas,
      legenda: f.legenda.trim().slice(0, 400),
    }
    setEstado({ tipo: 'salvando', texto: '' })
    const { error } = await supabase.from('perfis').update(dados).eq('id', perfil.id)
    if (error) return setEstado({ tipo: 'erro', texto: 'Não foi possível salvar: ' + error.message })
    onAtualizado(dados)
    setEstado({ tipo: 'ok', texto: f.vitrine ? 'Salvo! Você já aparece na página de apresentação.' : 'Salvo! (você está escondido da página)' })
  }

  return (
    <form className="vitrine-form" onSubmit={salvar}>
      <div>
        <h3>Página de mentores</h3>
        <p className="suave pequeno">O que pais e futuros alunos veem na página de apresentação, junto com a sua foto.</p>
      </div>
      <label className="caixa-marcar">
        <input type="checkbox" checked={f.vitrine} onChange={(e) => muda('vitrine', e.target.checked)} />
        <span>Aparecer na página de apresentação</span>
      </label>
      <label className="caixa-marcar">
        <input type="checkbox" checked={f.disponivel} onChange={(e) => muda('disponivel', e.target.checked)} />
        <span>Estou com vagas para novos alunos</span>
      </label>
      <div className="vitrine-duas">
        <label>Data de nascimento<input type="date" value={f.nascimento} onChange={(e) => muda('nascimento', e.target.value)} /></label>
        <label>Naturalidade<input value={f.naturalidade} maxLength={80} onChange={(e) => muda('naturalidade', e.target.value)} placeholder="Ex.: Fortaleza (CE)" /></label>
      </div>
      <p className="suave pequeno" style={{ margin: '-6px 0 0' }}>A página mostra só a sua idade, nunca a data.</p>
      <label>Características (separe por vírgula)
        <input value={f.caracteristicas} onChange={(e) => muda('caracteristicas', e.target.value)} placeholder="Ex.: Medicina na UFC, 940 na redação, Especialista em Exatas" />
      </label>
      <label>Sua legenda (escrita por você)
        <textarea rows={4} maxLength={400} value={f.legenda} onChange={(e) => muda('legenda', e.target.value)} placeholder="Conte quem você é e como você ajuda seus alunos." />
        <span className="suave pequeno" style={{ alignSelf: 'flex-end' }}>{f.legenda.length}/400</span>
      </label>
      {estado.tipo === 'erro' && <p className="erro">{estado.texto}</p>}
      {estado.tipo === 'ok' && <p className="aviso-ok" role="status">{estado.texto}</p>}
      <button className="botao primario" disabled={estado.tipo === 'salvando'}>{estado.tipo === 'salvando' ? 'Salvando…' : 'Salvar página de mentores'}</button>
    </form>
  )
}
