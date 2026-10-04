import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { NOME_SITE } from './constants'
import { MESES, inicioDoMes, somarMeses } from './agenda'
import Avatar from './Avatar'

// Chama a função do servidor (api/usuarios.js) que cria contas e troca senhas
async function api(acao, dados) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  let resp
  try {
    resp = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ acao, ...dados }),
    })
  } catch {
    throw new Error('Sem conexão. Tente de novo.')
  }
  if (resp.status === 404) throw new Error('A função de cadastro ainda não foi instalada no Vercel (arquivo api/usuarios.js).')
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(json.erro || 'Não foi possível concluir.')
  return json
}

function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyz'
  const nums = '23456789'
  let s = ''
  for (let i = 0; i < 5; i++) s += letras[Math.floor(Math.random() * letras.length)]
  for (let i = 0; i < 3; i++) s += nums[Math.floor(Math.random() * nums.length)]
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')

export default function Equipe({ meuId, onMudou }) {
  const [pessoas, setPessoas] = useState([])
  const [atendimentos, setAtendimentos] = useState([])
  const [simulados, setSimulados] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [cadastrando, setCadastrando] = useState(null) // null | 'aluno' | 'mentor'
  const [credenciais, setCredenciais] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtroMentor, setFiltroMentor] = useState('todos')

  const mes = inicioDoMes(new Date())

  const carregar = useCallback(async () => {
    const [p, a, s] = await Promise.all([
      supabase.from('perfis').select('*').order('nome'),
      supabase
        .from('atendimentos')
        .select('mentor_id, aluno_id, inicio')
        .gte('inicio', mes.toISOString())
        .lt('inicio', somarMeses(mes, 1).toISOString()),
      supabase.from('simulados').select('aluno_id, data').order('data', { ascending: false }).limit(5000),
    ])
    if (p.error) setErro('Não foi possível carregar a equipe. Você já rodou o arquivo equipe.sql no Supabase?')
    else setErro('')
    setPessoas(p.data ?? [])
    setAtendimentos(a.data ?? [])
    setSimulados(s.data ?? [])
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const mentores = useMemo(
    () => pessoas.filter((p) => p.papel === 'mentor' || p.papel === 'ceo').sort((a, b) => (a.id === meuId ? -1 : b.id === meuId ? 1 : (a.nome || '').localeCompare(b.nome || ''))),
    [pessoas, meuId]
  )
  const alunos = useMemo(() => pessoas.filter((p) => p.papel === 'aluno'), [pessoas])

  const inicioMesISO = mes.toISOString().slice(0, 10)
  const simuladosDoMes = simulados.filter((s) => s.data >= inicioMesISO)
  const ultimoSimulado = useMemo(() => {
    const m = {}
    for (const s of simulados) if (!m[s.aluno_id]) m[s.aluno_id] = s.data
    return m
  }, [simulados])

  const statsMentor = (id) => {
    const seus = alunos.filter((a) => a.mentor_id === id).map((a) => a.id)
    return {
      alunos: seus.length,
      atendimentos: atendimentos.filter((a) => a.mentor_id === id && a.aluno_id).length,
      simulados: simuladosDoMes.filter((s) => seus.includes(s.aluno_id)).length,
    }
  }
  const nomeMentor = (id) => {
    const m = mentores.find((x) => x.id === id)
    return m ? (m.id === meuId ? 'Você' : m.nome || m.email) : 'Sem mentor'
  }

  const alunosVisiveis = alunos.filter((a) => {
    if (filtroMentor === 'sem' && a.mentor_id && mentores.some((m) => m.id === a.mentor_id)) return false
    if (filtroMentor !== 'todos' && filtroMentor !== 'sem' && a.mentor_id !== filtroMentor) return false
    const t = busca.trim().toLowerCase()
    return !t || (a.nome || '').toLowerCase().includes(t) || (a.email || '').toLowerCase().includes(t)
  })

  async function trocarMentor(aluno, novoMentor) {
    const { error } = await supabase.from('perfis').update({ mentor_id: novoMentor || null }).eq('id', aluno.id)
    if (error) return setErro('Não foi possível trocar o mentor: ' + error.message)
    setAviso(`${aluno.nome || aluno.email} agora é aluno de ${nomeMentor(novoMentor)}.`)
    carregar()
    onMudou()
  }

  async function redefinirSenha(p) {
    const nova = window.prompt(`Nova senha para ${p.nome || p.email} (mínimo 6 caracteres):`, gerarSenha())
    if (nova === null) return
    try {
      await api('senha', { id: p.id, senha: nova })
      setErro('')
      setCredenciais({ nome: p.nome, email: p.email, senha: nova, papel: p.papel, novaSenha: true })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setErro(e.message)
    }
  }

  async function remover(p) {
    const ehMentorAlvo = p.papel === 'mentor'
    const seus = alunos.filter((a) => a.mentor_id === p.id).length
    const msg = ehMentorAlvo
      ? `Remover o mentor ${p.nome || p.email}?\n\nA agenda dele será apagada.${seus ? ` Os ${seus} alunos dele ficarão sem mentor até você escolher outro.` : ''}`
      : `Remover o aluno ${p.nome || p.email}?\n\nO horário e os simulados dele serão apagados para sempre.`
    if (!confirm(msg)) return
    try {
      await api('excluir', { id: p.id })
      setErro('')
      setAviso(`${p.nome || p.email} foi removido.`)
      carregar()
      onMudou()
    } catch (e) {
      setErro(e.message)
    }
  }

  if (carregando) return <p className="suave">Carregando…</p>

  return (
    <section className="secao equipe">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>Equipe</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>Mentores, alunos e o que está acontecendo em {MESES[mes.getMonth()].toLowerCase()}.</p>
        </div>
        {!cadastrando && (
          <div className="linha-botoes" style={{ marginTop: 0 }}>
            <button className="botao" onClick={() => { setCadastrando('mentor'); setCredenciais(null) }}>+ Mentor</button>
            <button className="botao primario" onClick={() => { setCadastrando('aluno'); setCredenciais(null) }}>+ Aluno</button>
          </div>
        )}
      </div>

      {erro && <p className="erro">{erro}</p>}
      {aviso && !erro && <p className="aviso-ok" role="status">✓ {aviso}</p>}

      {credenciais && <CartaoCredenciais dados={credenciais} onFechar={() => setCredenciais(null)} />}

      {cadastrando && (
        <FormCadastro
          tipoInicial={cadastrando}
          mentores={mentores}
          meuId={meuId}
          onFechar={() => setCadastrando(null)}
          onCriado={(dados) => {
            setCadastrando(null)
            setCredenciais(dados)
            setAviso('')
            carregar()
            onMudou()
          }}
        />
      )}

      <div className="resumo-cartoes resumo-agenda">
        <div className="cartao mini" style={{ '--cor': '#7048e8' }}>
          <span className="mini-titulo">Mentores</span>
          <strong className="mini-numero">{mentores.length}</strong>
          <span className="suave pequeno">contando você</span>
        </div>
        <div className="cartao mini" style={{ '--cor': 'var(--primaria)' }}>
          <span className="mini-titulo">Alunos</span>
          <strong className="mini-numero">{alunos.length}</strong>
          <span className="suave pequeno">ativos na plataforma</span>
        </div>
        <div className="cartao mini" style={{ '--cor': '#e67700' }}>
          <span className="mini-titulo">Atendimentos</span>
          <strong className="mini-numero">{atendimentos.filter((a) => a.aluno_id).length}</strong>
          <span className="suave pequeno">marcados no mês (todos)</span>
        </div>
        <div className="cartao mini" style={{ '--cor': '#c2255c' }}>
          <span className="mini-titulo">Simulados</span>
          <strong className="mini-numero">{simuladosDoMes.length}</strong>
          <span className="suave pequeno">lançados no mês</span>
        </div>
      </div>

      <div className="cartao">
        <h2>Mentores</h2>
        <div className="mentores-grade">
          {mentores.map((m) => {
            const st = statsMentor(m.id)
            return (
              <div key={m.id} className="mentor-cartao">
                <div className="mentor-topo">
                  <Avatar src={m.foto_url} nome={m.nome || m.email} tamanho={44} />
                  <div className="mentor-nome">
                    <strong>
                      {m.nome || m.email}
                      {m.papel === 'ceo' && <span className="selo selo-ceo">CEO</span>}
                    </strong>
                    <span className="suave pequeno">{m.email}</span>
                  </div>
                </div>
                <div className="mentor-numeros">
                  <button className="link-num" onClick={() => setFiltroMentor(m.id)} title="Ver alunos">
                    <strong>{st.alunos}</strong><span>alunos</span>
                  </button>
                  <div><strong>{st.atendimentos}</strong><span>aulas no mês</span></div>
                  <div><strong>{st.simulados}</strong><span>simulados no mês</span></div>
                </div>
                {m.id !== meuId && (
                  <div className="mentor-acoes">
                    <button className="link" onClick={() => redefinirSenha(m)}>redefinir senha</button>
                    {m.papel !== 'ceo' && <button className="link perigo" onClick={() => remover(m)}>remover</button>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="cartao">
        <div className="alunos-topo">
          <h2 style={{ margin: 0 }}>Alunos</h2>
          <div className="alunos-filtros">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" />
            <select value={filtroMentor} onChange={(e) => setFiltroMentor(e.target.value)}>
              <option value="todos">Todos os mentores</option>
              {mentores.map((m) => <option key={m.id} value={m.id}>{m.id === meuId ? 'Seus alunos' : `Alunos de ${m.nome || m.email}`}</option>)}
              <option value="sem">Sem mentor</option>
            </select>
          </div>
        </div>
        {alunosVisiveis.length === 0 ? (
          <p className="suave" style={{ margin: '12px 0 0' }}>{alunos.length ? 'Nenhum aluno encontrado com esse filtro.' : 'Nenhum aluno ainda. Clique em “+ Aluno”.'}</p>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela tabela-alunos">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Mentor</th>
                  <th className="num">Aulas/mês</th>
                  <th>Último simulado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {alunosVisiveis.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="atendimento-aluno">
                        <Avatar src={a.foto_url} nome={a.nome || a.email} tamanho={32} />
                        <span className="atendimento-aluno-texto">
                          <strong>{a.nome || '—'}</strong>
                          <span className="suave pequeno">{a.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <select className="select-mentor" value={a.mentor_id ?? ''} onChange={(e) => trocarMentor(a, e.target.value)}>
                        {!a.mentor_id && <option value="">Sem mentor</option>}
                        {mentores.map((m) => <option key={m.id} value={m.id}>{m.id === meuId ? 'Você' : m.nome || m.email}</option>)}
                      </select>
                    </td>
                    <td className="num">{a.limite_mensal ?? '—'}</td>
                    <td>{dataBR(ultimoSimulado[a.id])}</td>
                    <td className="acoes-tabela">
                      <button className="link" onClick={() => redefinirSenha(a)}>senha</button>
                      <button className="link perigo" onClick={() => remover(a)}>remover</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function FormCadastro({ tipoInicial, mentores, meuId, onFechar, onCriado }) {
  const [papel, setPapel] = useState(tipoInicial)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState(gerarSenha())
  const [mentorId, setMentorId] = useState(meuId)
  const [limite, setLimite] = useState(4)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar(e) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      await api('criar', {
        papel,
        nome: nome.trim(),
        email: email.trim(),
        senha,
        mentor_id: papel === 'aluno' ? mentorId : undefined,
        limite_mensal: papel === 'aluno' ? Number(limite) : undefined,
      })
      onCriado({ nome: nome.trim(), email: email.trim().toLowerCase(), senha, papel })
    } catch (err) {
      setErro(err.message)
    }
    setSalvando(false)
  }

  return (
    <form className="cartao" onSubmit={salvar}>
      <div className="tipos-escolha" role="radiogroup" aria-label="Tipo de conta">
        <button type="button" role="radio" aria-checked={papel === 'aluno'} className={papel === 'aluno' ? 'tipo-op ativo' : 'tipo-op'} style={{ '--cor': 'var(--primaria)' }} onClick={() => setPapel('aluno')}>🎓 Aluno</button>
        <button type="button" role="radio" aria-checked={papel === 'mentor'} className={papel === 'mentor' ? 'tipo-op ativo' : 'tipo-op'} style={{ '--cor': '#7048e8' }} onClick={() => setPapel('mentor')}>🧑‍🏫 Mentor</button>
      </div>
      <h2>{papel === 'aluno' ? 'Cadastrar aluno' : 'Cadastrar mentor'}</h2>
      <div className="grade-form">
        <label className="largo-2">
          Nome completo
          <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} />
        </label>
        <label className="largo-2">
          E-mail de acesso
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Pode ser um e-mail criado por você" />
        </label>
        <label className="largo-2">
          Senha inicial
          <div className="linha-campo">
            <input value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} />
            <button type="button" className="botao fantasma pequeno" onClick={() => setSenha(gerarSenha())}>gerar outra</button>
          </div>
        </label>
        {papel === 'aluno' && (
          <>
            <label>
              Mentor responsável
              <select value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
                {mentores.map((m) => <option key={m.id} value={m.id}>{m.id === meuId ? 'Você' : m.nome || m.email}</option>)}
              </select>
            </label>
            <label>
              Aulas por mês
              <input type="number" min="0" max="60" value={limite} onChange={(e) => setLimite(e.target.value)} />
            </label>
          </>
        )}
      </div>
      {papel === 'mentor' && (
        <p className="suave pequeno">O mentor entra no mesmo site, vê só os alunos que você vincular a ele, monta os horários deles e abre a própria agenda.</p>
      )}
      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao fantasma" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button className="botao primario" disabled={salvando}>{salvando ? 'Criando…' : papel === 'aluno' ? 'Criar aluno' : 'Criar mentor'}</button>
      </div>
    </form>
  )
}

function CartaoCredenciais({ dados, onFechar }) {
  const [copiado, setCopiado] = useState(false)
  const site = window.location.origin
  const mensagem =
    `Olá, ${(dados.nome || '').split(' ')[0]}! ${dados.novaSenha ? 'Sua senha foi redefinida.' : `Seu acesso à ${NOME_SITE} está pronto.`}\n\n` +
    `🔗 Site: ${site}\n📧 E-mail: ${dados.email}\n🔑 Senha: ${dados.senha}\n\n` +
    'Depois de entrar, você pode trocar a senha em "Meu perfil".'

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      window.prompt('Copie a mensagem:', mensagem)
    }
  }

  return (
    <div className="cartao credenciais">
      <div className="modal-topo">
        <h2>{dados.novaSenha ? '🔑 Senha redefinida' : `✅ ${dados.papel === 'mentor' ? 'Mentor' : 'Aluno'} cadastrado`}</h2>
        <button className="botao fantasma pequeno" onClick={onFechar} aria-label="Fechar">✕</button>
      </div>
      <p className="suave pequeno">Envie estes dados para {dados.nome || 'a pessoa'}. A senha não aparece de novo depois que você fechar.</p>
      <pre className="credenciais-texto">{mensagem}</pre>
      <div className="linha-botoes">
        <a className="botao" href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer">Enviar no WhatsApp</a>
        <button className="botao primario" onClick={copiar}>{copiado ? '✓ Copiado!' : 'Copiar mensagem'}</button>
      </div>
    </div>
  )
}
