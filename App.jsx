import { useEffect, useState, useCallback } from 'react'
import { supabase, configurado } from './supabase'
import { NOME_SITE, NOME_MENTOR, FOTO_MENTOR } from './constants'
import Login from './Login'
import Horario from './Horario'
import Simulados from './Simulados'
import Avatar from './Avatar'
import TrocarSenha from './TrocarSenha'
import Agenda from './Agenda'
import Aulas from './Aulas'
import Perfil from './Perfil'
import Comunidade from './Comunidade'
import Evolucao from './Evolucao'
import Equipe from './Equipe'
import { gruposPorMentor } from './grupos'

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
  const [aba, setAba] = useState('comunidade')
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [editandoPerfil, setEditandoPerfil] = useState(false)
  const [fotoMentor, setFotoMentor] = useState(null)
  const [equipe, setEquipe] = useState([]) // mentores e CEO (nome e foto)

  const ehCeo = perfil?.papel === 'ceo'
  const ehMentor = perfil?.papel === 'mentor' || ehCeo

  // Foto que o mentor enviou pelo site (se não houver, usa a foto padrão do site)
  useEffect(() => {
    supabase.rpc('foto_do_mentor').then(({ data }) => setFotoMentor(data || null))
  }, [])

  const carregarEquipe = useCallback(async () => {
    const { data, error } = await supabase.rpc('equipe_publica')
    if (!error) setEquipe(data ?? [])
  }, [])
  useEffect(() => {
    carregarEquipe()
  }, [carregarEquipe])

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
  const meuMentor = !ehMentor ? equipe.find((m) => m.id === perfil.mentor_id) : null
  const fotoDaMarca = (ehMentor ? perfil.foto_url : meuMentor?.foto_url || fotoMentor) || FOTO_MENTOR
  const primeiroNome = (perfil.nome || '').split(' ')[0] || 'Perfil'
  const subtitulo = ehCeo
    ? 'Painel do CEO'
    : ehMentor
      ? 'Painel do mentor'
      : `Olá, ${primeiroNome}!${meuMentor ? ` · Mentor: ${(meuMentor.nome || '').split(' ')[0]}` : ''}`

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-marca">
          <Avatar src={fotoDaMarca} nome={meuMentor?.nome || NOME_MENTOR} tamanho={40} />
          <div>
            <strong>{NOME_SITE}</strong>
            <span className="suave pequeno">
              {subtitulo}
            </span>
          </div>
        </div>
        <div className="topo-acoes">
          <button className="botao-perfil" onClick={() => setEditandoPerfil(true)} aria-label="Meu perfil">
            <Avatar src={perfil.foto_url} nome={perfil.nome || perfil.email} tamanho={32} />
            <span className="botao-perfil-texto">Meu perfil</span>
          </button>
          <button className="botao fantasma" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>

      <main className="conteudo">
        <nav className="abas" role="tablist">
          {[
            ['comunidade', '📣', 'Comunidade'],
            ['evolucao', '📈', 'Evolução'],
            ['horario', '🗓️', 'Horário'],
            ['simulados', '📝', 'Simulados'],
            ehMentor ? ['agenda', '📅', 'Agenda'] : ['aulas', '🎓', 'Marcar aula'],
            ...(ehCeo ? [['equipe', '🏢', 'Equipe']] : []),
          ].map(([id, icone, nome]) => (
            <button
              key={id}
              role="tab"
              aria-selected={aba === id}
              className={aba === id ? 'aba ativa' : 'aba'}
              onClick={() => setAba(id)}
            >
              {icone} {nome}
            </button>
          ))}
        </nav>

        {ehMentor && !['agenda', 'comunidade', 'equipe'].includes(aba) && (
          <SeletorAluno
            alunos={alunos}
            equipe={equipe}
            meuId={perfil.id}
            ehCeo={ehCeo}
            alunoId={alunoId}
            onEscolher={escolherAluno}
            onRenomeado={carregarAlunos}
          />
        )}

        {aba === 'comunidade' ? (
          <Comunidade ehMentor={ehMentor} ehCeo={ehCeo} meuId={perfil.id} equipe={equipe} fotoPadrao={fotoDaMarca} />
        ) : aba === 'equipe' && ehCeo ? (
          <Equipe meuId={perfil.id} onMudou={() => { carregarAlunos(); carregarEquipe() }} />
        ) : aba === 'agenda' && ehMentor ? (
          <Agenda alunos={alunos} ehCeo={ehCeo} meuId={perfil.id} equipe={equipe} />
        ) : aba === 'aulas' && !ehMentor ? (
          <Aulas perfil={perfil} />
        ) : ehMentor && alunos.length === 0 ? (
          <div className="cartao vazio">
            <h2>Nenhum aluno cadastrado ainda</h2>
            {ehCeo ? (
              <>
                <p>Cadastre alunos e mentores na aba <b>Equipe</b>.</p>
                <button className="botao primario" onClick={() => setAba('equipe')}>Ir para Equipe</button>
              </>
            ) : (
              <>
                <p>Seus alunos aparecem aqui assim que o CEO cadastrar e vincular eles a você.</p>
                <button className="botao" onClick={carregarAlunos}>Atualizar lista</button>
              </>
            )}
          </div>
        ) : alunoAtual ? (
          aba === 'simulados' ? (
            <Simulados key={alunoAtual.id} alunoId={alunoAtual.id} onVerEvolucao={() => setAba('evolucao')} />
          ) : aba === 'evolucao' ? (
            <Evolucao key={alunoAtual.id} alunoId={alunoAtual.id} ehMentor={ehMentor} onLancar={() => setAba('simulados')} />
          ) : (
            <Horario key={alunoAtual.id} alunoId={alunoAtual.id} editavel={ehMentor} />
          )
        ) : (
          <Carregando />
        )}
      </main>

      {editandoPerfil && (
        <Perfil
          perfil={perfil}
          onAtualizado={(mudancas) => setPerfil((p) => ({ ...p, ...mudancas }))}
          onTrocarSenha={() => { setEditandoPerfil(false); setTrocandoSenha(true) }}
          onFechar={() => setEditandoPerfil(false)}
        />
      )}
      {trocandoSenha && <TrocarSenha onFechar={() => setTrocandoSenha(false)} />}
    </div>
  )
}

function SeletorAluno({ alunos, equipe, meuId, ehCeo, alunoId, onEscolher, onRenomeado }) {
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
      {aluno && (
        <span className="seletor-avatar">
          <Avatar src={aluno.foto_url} nome={aluno.nome || aluno.email} tamanho={44} />
        </span>
      )}
      <label className="seletor-rotulo">
        Aluno
        <select value={alunoId ?? ''} onChange={(e) => { onEscolher(e.target.value); setEditando(false) }}>
          {ehCeo
            ? gruposPorMentor(alunos, equipe, meuId).map((g) => (
                <optgroup key={g.id} label={g.rotulo}>
                  {g.alunos.map((a) => (
                    <option key={a.id} value={a.id}>{a.nome || a.email}</option>
                  ))}
                </optgroup>
              ))
            : alunos.map((a) => (
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
          <LimiteAulas key={aluno.id} aluno={aluno} onSalvo={onRenomeado} />
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

function LimiteAulas({ aluno, onSalvo }) {
  const atual = aluno.limite_mensal
  const [valor, setValor] = useState(atual ?? 4)
  const [estado, setEstado] = useState('') // '', 'salvando', 'ok', 'erro'

  if (atual === undefined) return null // agenda.sql ainda não foi rodado

  async function salvar(e) {
    e.preventDefault()
    const n = Math.max(0, Math.min(60, Number(valor) || 0))
    setEstado('salvando')
    const { error } = await supabase.from('perfis').update({ limite_mensal: n }).eq('id', aluno.id)
    setEstado(error ? 'erro' : 'ok')
    if (!error) onSalvo()
  }

  return (
    <form className="limite-aulas" onSubmit={salvar}>
      <label htmlFor="limite">Aulas/mês</label>
      <input
        id="limite"
        type="number"
        min="0"
        max="60"
        value={valor}
        onChange={(e) => { setValor(e.target.value); setEstado('') }}
      />
      {Number(valor) !== atual && (
        <button className="botao primario pequeno" disabled={estado === 'salvando'}>Salvar</button>
      )}
      {estado === 'ok' && Number(valor) === atual && <span className="suave pequeno">✓ salvo</span>}
      {estado === 'erro' && <span className="erro pequeno">não salvou</span>}
    </form>
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
