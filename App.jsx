import { useEffect, useState, useCallback } from 'react'
import { supabase, configurado } from './supabase'
import { NOME_SITE, NOME_MENTOR, FOTO_MENTOR } from './constants'
import Login from './Login'
import Horario from './Horario'
import Simulados from './Simulados'
import Avatar from './Avatar'
import TrocarSenha from './TrocarSenha'

export default function App() {
  const [sessao, setSessao] = useState(undefined) // undefined = ainda verificando

  useEffect(() => {
    if (!configurado) return
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!configurado) return <FaltaConfigurar />
  if (sessao === undefined) return <Carregando />
  if (!sessao) return <Login />
  return <Painel usuario={sessao.user} />
}

function Painel({ usuario }) {
  const [perfil, setPerfil] = useState(null)
  const [erro, setErro] = useState('')
  const [alunos, setAlunos] = useState([])
  const [alunoId, setAlunoId] = useState(null)
  const [aba, setAba] = useState('horario')
  const [trocandoSenha, setTrocandoSenha] = useState(false)

  const ehMentor = perfil?.papel === 'mentor'

  useEffect(() => {
    supabase
      .from('perfis')
      .select('*')
      .eq('id', usuario.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setErro('Não encontramos seu cadastro. Fale com seu mentor.')
        else setPerfil(data)
      })
  }, [usuario.id])

  const carregarAlunos = useCallback(async () => {
    const { data } = await supabase
      .from('perfis')
      .select('*')
      .eq('papel', 'aluno')
      .order('nome')
    const lista = data ?? []
    setAlunos(lista)
    setAlunoId((atual) => {
      if (atual && lista.some((a) => a.id === atual)) return atual
      let salvo = null
      try { salvo = localStorage.getItem('alunoSelecionado') } catch { /* sem armazenamento */ }
      return lista.find((a) => a.id === salvo)?.id ?? lista[0]?.id ?? null
    })
  }, [])

  useEffect(() => {
    if (!perfil) return
    if (ehMentor) carregarAlunos()
    else setAlunoId(perfil.id)
  }, [perfil, ehMentor, carregarAlunos])

  function escolherAluno(id) {
    setAlunoId(id)
    try { localStorage.setItem('alunoSelecionado', id) } catch { /* sem armazenamento */ }
  }

  if (erro) {
    return (
      <div className="centro-tela">
        <p className="erro">{erro}</p>
        <button className="botao" onClick={() => supabase.auth.signOut()}>Sair</button>
      </div>
    )
  }
  if (!perfil) return <Carregando />

  const alunoAtual = ehMentor ? alunos.find((a) => a.id === alunoId) : perfil

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-marca">
          <Avatar src={FOTO_MENTOR} nome={NOME_MENTOR} tamanho={40} />
          <div>
            <strong>{NOME_SITE}</strong>
            <span className="suave pequeno">
              {ehMentor ? 'Painel do mentor' : `Olá, ${perfil.nome || 'aluno'}!`}
            </span>
          </div>
        </div>
        <div className="topo-acoes">
          <button className="botao fantasma" onClick={() => setTrocandoSenha(true)}>Trocar senha</button>
          <button className="botao fantasma" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>

      <main className="conteudo">
        {ehMentor && (
          <SeletorAluno
            alunos={alunos}
            alunoId={alunoId}
            onEscolher={escolherAluno}
            onRenomeado={carregarAlunos}
          />
        )}

        {ehMentor && alunos.length === 0 ? (
          <div className="cartao vazio">
            <h2>Nenhum aluno cadastrado ainda</h2>
            <p>
              Crie a conta do aluno no Supabase em <b>Authentication → Users → Add user</b>{' '}
              (com e-mail e senha, marcando “Auto Confirm User”). Depois clique em
              “Atualizar lista” e ele aparece aqui.
            </p>
            <button className="botao" onClick={carregarAlunos}>Atualizar lista</button>
          </div>
        ) : alunoAtual ? (
          <>
            <nav className="abas" role="tablist">
              <button
                role="tab"
                aria-selected={aba === 'horario'}
                className={aba === 'horario' ? 'aba ativa' : 'aba'}
                onClick={() => setAba('horario')}
              >
                🗓️ Horário de estudos
              </button>
              <button
                role="tab"
                aria-selected={aba === 'simulados'}
                className={aba === 'simulados' ? 'aba ativa' : 'aba'}
                onClick={() => setAba('simulados')}
              >
                📝 Simulados
              </button>
            </nav>

            {aba === 'horario' ? (
              <Horario key={alunoAtual.id} alunoId={alunoAtual.id} editavel={ehMentor} />
            ) : (
              <Simulados key={alunoAtual.id} alunoId={alunoAtual.id} />
            )}
          </>
        ) : (
          <Carregando />
        )}
      </main>

      {trocandoSenha && <TrocarSenha onFechar={() => setTrocandoSenha(false)} />}
    </div>
  )
}

function SeletorAluno({ alunos, alunoId, onEscolher, onRenomeado }) {
  const aluno = alunos.find((a) => a.id === alunoId)
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState('')

  async function salvarNome(e) {
    e.preventDefault()
    if (!nome.trim()) return
    await supabase.from('perfis').update({ nome: nome.trim() }).eq('id', alunoId)
    setEditando(false)
    onRenomeado()
  }

  if (alunos.length === 0) return null

  return (
    <section className="cartao seletor">
      <label className="seletor-rotulo">
        Aluno
        <select value={alunoId ?? ''} onChange={(e) => { onEscolher(e.target.value); setEditando(false) }}>
          {alunos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome || a.email}
            </option>
          ))}
        </select>
      </label>
      {aluno && !editando && (
        <div className="seletor-info">
          <span className="suave pequeno">{aluno.email}</span>
          <button className="botao fantasma pequeno" onClick={() => { setNome(aluno.nome); setEditando(true) }}>
            Editar nome
          </button>
          <button className="botao fantasma pequeno" onClick={onRenomeado}>
            Atualizar lista
          </button>
        </div>
      )}
      {editando && (
        <form className="seletor-info" onSubmit={salvarNome}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do aluno" autoFocus />
          <button className="botao primario pequeno">Salvar</button>
          <button type="button" className="botao fantasma pequeno" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </form>
      )}
    </section>
  )
}

function Carregando() {
  return (
    <div className="centro-tela">
      <div className="girando" aria-label="Carregando" />
    </div>
  )
}

function FaltaConfigurar() {
  return (
    <div className="centro-tela">
      <div className="cartao" style={{ maxWidth: 520 }}>
        <h2>Falta conectar ao Supabase</h2>
        <p>
          Crie o arquivo <code>.env</code> (ou as variáveis no Vercel) com{' '}
          <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>. O passo a passo
          está no arquivo <code>LEIA-ME.md</code>.
        </p>
      </div>
    </div>
  )
}
