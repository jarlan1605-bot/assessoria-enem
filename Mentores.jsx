import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { enviarFoto } from './foto'
import Avatar from './Avatar'

// Campos que aparecem para pais e alunos (página de apresentação e escolha do assessor)
export const CAMPOS_MENTOR = ['nome', 'vitrine', 'disponivel', 'nascimento', 'naturalidade', 'aprovacao', 'questoes_feitas', 'especialidade', 'caracteristicas', 'legenda']

const idadeDe = (nascimento) => {
  if (!nascimento) return null
  const n = new Date(nascimento + 'T12:00:00')
  const h = new Date()
  let i = h.getFullYear() - n.getFullYear()
  if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) i--
  return i
}

function senhaAleatoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz'
  const nums = '23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += letras[Math.floor(Math.random() * letras.length)]
  for (let i = 0; i < 4; i++) s += nums[Math.floor(Math.random() * nums.length)]
  return s
}

// Formulário dos dados públicos de um mentor. Usado pelo CEO (aba Mentores) e pelo próprio mentor (Meu perfil).
export function FormMentor({ mentor, onSalvo, mostrarNome = true, ocupadas = null }) {
  const [f, setF] = useState({
    nome: mentor.nome ?? '',
    vitrine: mentor.vitrine ?? false,
    disponivel: mentor.disponivel ?? true,
    nascimento: mentor.nascimento ?? '',
    naturalidade: mentor.naturalidade ?? '',
    aprovacao: mentor.aprovacao ?? '',
    questoes_feitas: mentor.questoes_feitas ?? '',
    especialidade: mentor.especialidade ?? '',
    caracteristicas: mentor.caracteristicas ?? [],
    legenda: mentor.legenda ?? '',
    vagas: mentor.vagas ?? '',
  })
  const [nova, setNova] = useState('')
  const [estado, setEstado] = useState({ tipo: '', texto: '' })
  const suporta = 'aprovacao' in mentor // mentores_ceo.sql já foi rodado?
  const muda = (k, v) => { setF((x) => ({ ...x, [k]: v })); setEstado({ tipo: '', texto: '' }) }

  function addCaracteristica() {
    const c = nova.trim().slice(0, 40)
    if (!c || f.caracteristicas.includes(c) || f.caracteristicas.length >= 8) return
    muda('caracteristicas', [...f.caracteristicas, c])
    setNova('')
  }

  async function salvar(e) {
    e.preventDefault()
    if (!f.nome.trim()) return setEstado({ tipo: 'erro', texto: 'Coloque o nome.' })
    const q = f.questoes_feitas === '' ? null : Math.max(0, Math.min(1000000, Math.round(Number(f.questoes_feitas) || 0)))
    const dados = {
      nome: f.nome.trim().slice(0, 80),
      vitrine: f.vitrine,
      disponivel: f.disponivel,
      nascimento: f.nascimento || null,
      naturalidade: f.naturalidade.trim().slice(0, 80),
      caracteristicas: f.caracteristicas.slice(0, 8),
      legenda: f.legenda.trim().slice(0, 400),
      ...(ocupadas !== null && 'vagas' in mentor ? { vagas: f.vagas === '' ? null : Math.max(0, Math.min(500, Math.round(Number(f.vagas) || 0))) } : {}),
      ...(suporta ? { aprovacao: f.aprovacao.trim().slice(0, 120), questoes_feitas: q, especialidade: f.especialidade.trim().slice(0, 80) } : {}),
    }
    setEstado({ tipo: 'salvando', texto: '' })
    const { error } = await supabase.from('perfis').update(dados).eq('id', mentor.id)
    if (error) return setEstado({ tipo: 'erro', texto: 'Não foi possível salvar: ' + error.message })
    setEstado({ tipo: 'ok', texto: f.vitrine ? 'Salvo! Já aparece na página e na escolha do assessor.' : 'Salvo! (está escondido da página)' })
    onSalvo?.(dados)
  }

  const idade = idadeDe(f.nascimento)
  return (
    <form className="mentor-form" onSubmit={salvar}>
      {mostrarNome && <label>Nome que aparece<input value={f.nome} maxLength={80} onChange={(e) => muda('nome', e.target.value)} /></label>}

      <div className="mentor-chaves">
        <label className="caixa-marcar"><input type="checkbox" checked={f.vitrine} onChange={(e) => muda('vitrine', e.target.checked)} /><span>Aparecer na página e na escolha do assessor</span></label>
        <label className="caixa-marcar"><input type="checkbox" checked={f.disponivel} onChange={(e) => muda('disponivel', e.target.checked)} /><span>Com vagas para novos alunos</span></label>
      </div>

      <div className="mentor-grade">
        <label>Data de nascimento{idade !== null && <small className="suave"> · {idade} anos</small>}<input type="date" value={f.nascimento} onChange={(e) => muda('nascimento', e.target.value)} /></label>
        <label>Naturalidade<input value={f.naturalidade} maxLength={80} onChange={(e) => muda('naturalidade', e.target.value)} placeholder="Ex.: Caicó (RN)" /></label>
        {ocupadas !== null && 'vagas' in mentor && (
          <label>Vagas para 2027<small className="suave"> · {ocupadas} ocupada{ocupadas === 1 ? '' : 's'}</small>
            <input type="number" min="0" max="500" value={f.vagas} onChange={(e) => muda('vagas', e.target.value)} placeholder="Em branco = sem limite" />
          </label>
        )}
        {suporta && <label>Aprovação<input value={f.aprovacao} maxLength={120} onChange={(e) => muda('aprovacao', e.target.value)} placeholder="Ex.: Medicina UFRN 2024" /></label>}
        {suporta && <label>Área de especialidade<input value={f.especialidade} maxLength={80} onChange={(e) => muda('especialidade', e.target.value)} placeholder="Ex.: Linguagens" /></label>}
        {suporta && <label>Quantas questões já fez<input type="number" min="0" value={f.questoes_feitas} onChange={(e) => muda('questoes_feitas', e.target.value)} placeholder="Ex.: 12000" /></label>}
      </div>
      {!suporta && <p className="aviso-info pequeno">Os campos Aprovação, Área de especialidade e Questões aparecem depois que o banco for atualizado (arquivo mentores_ceo.sql).</p>}

      <div>
        <span className="rotulo-campo">Características (até 8)</span>
        <div className="mentor-tags">
          {f.caracteristicas.map((c) => (
            <span key={c} className="mentor-tag">{c}<button type="button" onClick={() => muda('caracteristicas', f.caracteristicas.filter((x) => x !== c))} aria-label={`Tirar ${c}`}>✕</button></span>
          ))}
        </div>
        <div className="linha-campo">
          <input value={nova} maxLength={40} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCaracteristica() } }} placeholder="Ex.: Aprovada direto do 3º ano" />
          <button type="button" className="botao pequeno" onClick={addCaracteristica} disabled={!nova.trim() || f.caracteristicas.length >= 8}>+ Adicionar</button>
        </div>
      </div>

      <label>Legenda (escrita pelo mentor)
        <textarea rows={3} maxLength={400} value={f.legenda} onChange={(e) => muda('legenda', e.target.value)} placeholder="Conte quem você é e como ajuda seus alunos." />
        <span className="suave pequeno" style={{ alignSelf: 'flex-end' }}>{f.legenda.length}/400</span>
      </label>

      {estado.tipo === 'erro' && <p className="erro">{estado.texto}</p>}
      {estado.tipo === 'ok' && <p className="aviso-ok" role="status">{estado.texto}</p>}
      <button className="botao primario" disabled={estado.tipo === 'salvando'}>{estado.tipo === 'salvando' ? 'Salvando…' : 'Salvar'}</button>
    </form>
  )
}

function FotoMentor({ mentor, onTrocou }) {
  const seletor = useRef(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  async function escolher(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setEnviando(true)
    setErro('')
    try { onTrocou(await enviarFoto(mentor.id, arquivo)) } catch (err) { setErro(err.message) }
    setEnviando(false)
  }
  return (
    <div className="mentor-foto">
      <Avatar src={mentor.foto_url} nome={mentor.nome || mentor.email} tamanho={96} />
      <input ref={seletor} type="file" accept="image/*" hidden onChange={escolher} />
      <button type="button" className="botao pequeno" onClick={() => seletor.current?.click()} disabled={enviando}>{enviando ? 'Enviando…' : mentor.foto_url ? 'Trocar foto' : 'Colocar foto'}</button>
      {erro && <p className="erro pequeno">{erro}</p>}
    </div>
  )
}

function NovoMentor({ onCriado, onFechar }) {
  const [f, setF] = useState({ nome: '', email: '', senha: senhaAleatoria() })
  const [estado, setEstado] = useState({ tipo: '', texto: '' })
  async function criar(e) {
    e.preventDefault()
    setEstado({ tipo: 'salvando', texto: '' })
    try {
      const { data } = await supabase.auth.getSession()
      const r = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ acao: 'criar', papel: 'mentor', nome: f.nome.trim(), email: f.email.trim(), senha: f.senha }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.erro || 'Não foi possível cadastrar.')
      setEstado({ tipo: 'ok', texto: `Mentor cadastrado! Login: ${f.email.trim()} · Senha: ${f.senha}. Mande para ele e peça para trocar a senha.` })
      onCriado(j.id)
    } catch (err) {
      setEstado({ tipo: 'erro', texto: err.message })
    }
  }
  return (
    <form className="cartao mentor-novo" onSubmit={criar}>
      <div className="modal-topo"><h2>Adicionar mentor</h2><button type="button" className="botao fantasma pequeno" onClick={onFechar}>✕</button></div>
      <p className="suave pequeno" style={{ marginTop: 0 }}>Cria a conta de mentor. Depois é só preencher os dados que aparecem na página.</p>
      <div className="mentor-grade">
        <label>Nome<input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={80} required /></label>
        <label>E-mail (login)<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
        <label>Senha inicial<input value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} minLength={6} required /></label>
      </div>
      {estado.tipo === 'erro' && <p className="erro">{estado.texto}</p>}
      {estado.tipo === 'ok' && <p className="aviso-ok">{estado.texto}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao fantasma" onClick={onFechar}>Fechar</button>
        <button className="botao primario" disabled={estado.tipo === 'salvando' || estado.tipo === 'ok'}>{estado.tipo === 'salvando' ? 'Cadastrando…' : 'Cadastrar mentor'}</button>
      </div>
    </form>
  )
}

// CEO: lista de mentores, com edição de tudo o que aparece para pais e alunos
export default function Mentores({ onMudou }) {
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState(null)
  const [novo, setNovo] = useState(false)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('perfis').select('*').in('papel', ['mentor', 'ceo']).order('criado_em')
    const { data: ocup } = await supabase.from('interessados').select('mentor_id').not('mentor_id', 'is', null)
    const conta = {}
    for (const o of ocup ?? []) conta[o.mentor_id] = (conta[o.mentor_id] || 0) + 1
    setLista((data ?? []).map((m) => ({ ...m, ocupadas: conta[m.id] || 0 })))
    setCarregando(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const atualizar = (id, dados) => { setLista((l) => l.map((m) => (m.id === id ? { ...m, ...dados } : m))); onMudou?.() }

  return (
    <section className="secao mentores-ceo">
      <div className="comunidade-topo">
        <p className="suave" style={{ margin: 0 }}>Quem marcar <b>“Aparecer”</b> entra na página de apresentação e na escolha do assessor depois do pagamento. Defina as <b>vagas para 2027</b> de cada um: quando elas acabam, o assessor aparece como <b>Esgotado</b> e não pode mais ser escolhido.</p>
        {!novo && <button className="botao primario" onClick={() => setNovo(true)}>+ Adicionar mentor</button>}
      </div>

      {novo && <NovoMentor onFechar={() => setNovo(false)} onCriado={(id) => { carregar(); setAberto(id) }} />}

      {carregando ? <p className="suave">Carregando…</p> : (
        <div className="mentores-lista">
          {lista.map((m) => {
            const idade = idadeDe(m.nascimento)
            return (
              <article key={m.id} className={aberto === m.id ? 'cartao mentor-cartao aberto' : 'cartao mentor-cartao'}>
                <button className="mentor-resumo" onClick={() => setAberto(aberto === m.id ? null : m.id)} aria-expanded={aberto === m.id}>
                  <Avatar src={m.foto_url} nome={m.nome || m.email} tamanho={52} />
                  <span className="mentor-resumo-texto">
                    <strong>{m.nome || m.email}{m.papel === 'ceo' && <span className="selo selo-ceo">CEO</span>}</strong>
                    <span className="suave pequeno">{[m.aprovacao, idade && `${idade} anos`, m.naturalidade, m.especialidade].filter(Boolean).join(' · ') || 'Dados ainda não preenchidos'}</span>
                  </span>
                  <span className="mentor-status">
                    <span className={m.vitrine ? 'selo selo-ativo' : 'selo'}>{m.vitrine ? 'Aparece' : 'Escondido'}</span>
                    {m.vitrine && (() => {
                      const esg = !m.disponivel || (m.vagas != null && m.ocupadas >= m.vagas)
                      return <span className={esg ? 'selo selo-suspenso' : 'selo selo-novo'}>{esg ? 'Esgotado' : m.vagas != null ? `${m.ocupadas}/${m.vagas} vagas` : 'Com vagas'}</span>
                    })()}
                  </span>
                </button>
                {aberto === m.id && (
                  <div className="mentor-editar">
                    <FotoMentor mentor={m} onTrocou={(url) => atualizar(m.id, { foto_url: url })} />
                    <FormMentor key={m.id + (m.aprovacao ?? '')} mentor={m} ocupadas={m.ocupadas} onSalvo={(dados) => atualizar(m.id, dados)} />
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
