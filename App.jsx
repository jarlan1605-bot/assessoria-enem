import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { supabase, configurado } from './supabase'
import { NOME_SITE, NOME_MENTOR, FOTO_MENTOR } from './constants'
import Login from './Login'
import Avatar from './Avatar'
import TrocarSenha from './TrocarSenha'
import { gruposPorMentor } from './grupos'
import Landing from './Landing'
import Contagem from './Contagem'
import PagarMensalidade from './PagarMensalidade'
import XpNotificacoes from './XpNotificacoes'
import { precisaVoce } from './cobranca'
import ErrorBoundary from './ErrorBoundary'
import BotaoWhatsapp from './BotaoWhatsapp'
import MenuCelular from './MenuCelular'
import HoraDoFoco from './HoraDoFoco'

// Cada tela só é baixada quando alguém abre: a página inicial fica bem mais leve no celular.
const Horario = lazy(() => import('./Horario'))
const Simulados = lazy(() => import('./Simulados'))
const Agenda = lazy(() => import('./Agenda'))
const Aulas = lazy(() => import('./Aulas'))
const Videoaulas = lazy(() => import('./Videoaulas'))
const Pontos = lazy(() => import('./Pontos'))
const Trilha = lazy(() => import('./Trilha'))
const Perfil = lazy(() => import('./Perfil'))
const Comunidade = lazy(() => import('./Comunidade'))
const Evolucao = lazy(() => import('./Evolucao'))
const Equipe = lazy(() => import('./Equipe'))
const Mentores = lazy(() => import('./Mentores'))
const Assessoria2027 = lazy(() => import('./Assessoria2027'))
const CadernoErros = lazy(() => import('./CadernoErros'))
const Redacao = lazy(() => import('./Redacao'))
const Relatorio = lazy(() => import('./Relatorio'))
const Financeiro = lazy(() => import('./Financeiro'))
const SiteEditor = lazy(() => import('./SiteEditor'))
const BancoQuestoes = lazy(() => import('./BancoQuestoes'))
const Materiais = lazy(() => import('./Materiais'))
const Interessados = lazy(() => import('./Interessados'))
const SimuladorProva = lazy(() => import('./SimuladorProva'))
const SimuladoEnem = lazy(() => import('./SimuladoEnem'))
const Ranking = lazy(() => import('./Ranking'))
const VisaoGeral = lazy(() => import('./VisaoGeral'))
const PainelAluno = lazy(() => import('./Painel'))
const Feedback = lazy(() => import('./Feedback'))
const FeedbacksCeo = lazy(() => import('./FeedbacksCeo'))
const Hoje = lazy(() => import('./Hoje'))
const Foco = lazy(() => import('./Foco'))
const Listas = lazy(() => import('./Listas'))
const Conquistas = lazy(() => import('./Conquistas'))

export default function App() {
  const [sessao, setSessao] = useState(undefined) // undefined = ainda verificando
  const [recuperando, setRecuperando] = useState(false) // chegou pelo link do e-mail de "esqueci minha senha"
  const [verLogin, setVerLogin] = useState(() => window.location.hash === '#entrar')
  const busca = new URLSearchParams(window.location.search)
  // ?site mostra a página de apresentação; ?vagas abre direto no formulário de 2027 (link do Instagram)
  const forcarSite = busca.has('site') || busca.has('vagas') || busca.has('inscricao')

  useEffect(() => {
    if (!configurado) return
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      setSessao(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const aoMudar = () => setVerLogin(window.location.hash === '#entrar')
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])

  const irParaLogin = () => {
    if (forcarSite) window.location.href = '/#entrar'
    else window.location.hash = 'entrar'
  }

  // página pública com tudo o que a assessoria oferece (não depende de login)
  if (window.location.pathname.replace(/\/$/, '') === '/assessoria') return <Suspense fallback={<Carregando />}><Assessoria2027 /></Suspense>
  if (!configurado) return <FaltaConfigurar />
  // formulário público de feedback (não precisa de login)
  if (window.location.pathname.replace(/\/$/, '') === '/feedback') return <Suspense fallback={<Carregando />}><Feedback /></Suspense>
  if (forcarSite) return <Landing onEntrar={irParaLogin} />
  if (sessao === undefined) return <Carregando />
  if (!sessao) return verLogin ? <Login onVoltar={() => { window.location.hash = '' }} /> : <Landing onEntrar={irParaLogin} />
  return (
    <>
      <Painel usuario={sessao.user} />
      {recuperando && <TrocarSenha onFechar={() => setRecuperando(false)} />}
    </>
  )
}

// Abas que mostram os dados de um aluno (o mentor escolhe o aluno no seletor)
// Abas com partes: tudo de simulado num lugar só, e o progresso do aluno num lugar só
const SUBABAS = {
  simulados: [
    ['fazer', '🏁', 'Fazer simulado'],
    ['notas', '📝', 'Notas e desempenho'],
    ['provas', '📚', 'Provas e gabaritos'],
    ['cronometro', '⏱️', 'Cronômetro de prova'],
  ],
  progresso: [
    ['resumo', '📊', 'Resumo geral'],
    ['evolucao', '📈', 'Evolução nos simulados'],
  ],
}
// abas antigas que agora são partes de outra aba
const ABAS_ANTIGAS = {
  'simulado-enem': ['simulados', 'fazer'], materiais: ['simulados', 'provas'], cronometro: ['simulados', 'cronometro'],
  painel: ['progresso', 'resumo'], evolucao: ['progresso', 'evolucao'],
}

const POR_ALUNO = ['hoje', 'foco', 'conquistas', 'progresso', 'trilha', 'pontos', 'horario', 'simulados', 'erros', 'redacao', 'relatorio']

function Painel({ usuario }) {
  const [perfil, setPerfil] = useState(null)
  const [erro, setErro] = useState('')
  const [alunos, setAlunos] = useState([])
  const [erroAlunos, setErroAlunos] = useState('')
  const [alunoId, setAlunoId] = useState(null)
  // Cada vez que entra no site, começa pela tela Hoje; dentro da mesma visita, lembra a aba aberta
  const [aba, setAbaEstado] = useState(() => {
    try {
      if (!sessionStorage.getItem('visitaIniciada')) { sessionStorage.setItem('visitaIniciada', '1'); return 'hoje' }
      return localStorage.getItem('abaAtual') || 'hoje'
    } catch { return 'hoje' }
  })
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [senhaObrigatoria, setSenhaObrigatoria] = useState(!!usuario.user_metadata?.trocar_senha)
  const [editandoPerfil, setEditandoPerfil] = useState(false)
  const [fotoMentor, setFotoMentor] = useState(null)
  const [equipe, setEquipe] = useState([]) // mentores e CEO (nome e foto)
  const [config, setConfig] = useState(null) // data do ENEM etc.
  const [aCobrar, setACobrar] = useState(0) // CEO: cobranças para fazer hoje
  const [novosInteressados, setNovosInteressados] = useState(0) // CEO: inscrições ainda sem contato

  const ehCeo = perfil?.papel === 'ceo'
  const ehMentor = perfil?.papel === 'mentor' || ehCeo

  // Aluno: conta o tempo na plataforma (1 minuto por vez, só com a aba aberta, visível e com atividade nos últimos 2 minutos)
  const ehAluno = perfil?.papel === 'aluno'
  useEffect(() => {
    if (!ehAluno) return
    let ultimaAtividade = Date.now()
    const marcar = () => { ultimaAtividade = Date.now() }
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }))
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaAtividade < 120000) {
        supabase.rpc('registrar_tempo', { p_segundos: 60 }).then(() => {}, () => {})
      }
    }, 60000)
    return () => { clearInterval(t); eventos.forEach((e) => window.removeEventListener(e, marcar)) }
  }, [ehAluno])

  // CEO: quantos alunos precisam ser cobrados hoje (aparece no menu e num aviso)
  useEffect(() => {
    if (!ehCeo) return
    Promise.all([
      supabase.from('contratos').select('*'),
      supabase.from('financeiro_config').select('*').eq('id', 1).maybeSingle(),
    ]).then(([c, cfg]) => {
      if (c.error || cfg.error) return
      setACobrar((c.data ?? []).filter((x) => precisaVoce({ ativo: true, ...x }, cfg.data || { dias_antes: 3 })).length)
    })
  }, [ehCeo, aba])

  // CEO: inscrições novas (status "novo") — aparecem no menu e num aviso no topo; atualiza a cada minuto
  useEffect(() => {
    if (!ehCeo) return
    const contar = () => supabase.from('interessados').select('id', { count: 'exact', head: true }).eq('status', 'novo')
      .then(({ count, error }) => { if (!error) setNovosInteressados(count ?? 0) })
    contar()
    const t = setInterval(contar, 60000)
    return () => clearInterval(t)
  }, [ehCeo, aba])

  // parte aberta em cada aba com partes (o site lembra)
  const [subs, setSubs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('subAbas') || '{}') } catch { return {} }
  })
  function setSub(abaDaParte, sub) {
    setSubs((x) => {
      const novo = { ...x, [abaDaParte]: sub }
      try { localStorage.setItem('subAbas', JSON.stringify(novo)) } catch { /* sem armazenamento */ }
      return novo
    })
  }

  // aceita 'simulados:notas' (abre direto numa parte) e os nomes antigos ('simulado-enem', 'painel', 'evolucao'...)
  function setAba(id) {
    let [abaNova, sub] = String(id).split(':')
    if (ABAS_ANTIGAS[abaNova]) [abaNova, sub] = ABAS_ANTIGAS[abaNova]
    if (SUBABAS[abaNova] && sub) setSub(abaNova, sub)
    setAbaEstado(abaNova)
    try { localStorage.setItem('abaAtual', abaNova) } catch { /* sem armazenamento */ }
    window.scrollTo({ top: 0 })
  }

  // Foto que o mentor enviou pelo site (se não houver, usa a foto padrão do site)
  useEffect(() => {
    supabase.rpc('foto_do_mentor').then(({ data }) => setFotoMentor(data || null))
    supabase.from('site_config').select('data_enem_1, data_enem_2').eq('id', 1).maybeSingle().then(({ data }) => setConfig(data || null))
  }, [])

  const carregarEquipe = useCallback(async () => {
    const { data, error } = await supabase.rpc('equipe_publica')
    if (!error) setEquipe(data ?? [])
  }, [])
  useEffect(() => {
    carregarEquipe()
  }, [carregarEquipe])

  // No celular, o menu rola até a aba aberta
  useEffect(() => {
    document.querySelector('.menu-item.ativo')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [aba, perfil?.id])

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
    const { data, error } = await supabase
      .from('perfis')
      .select('*')
      .eq('papel', 'aluno')
      .order('nome')
    if (error) { setErroAlunos('Não foi possível carregar os alunos. Verifique a internet e recarregue a página.'); return }
    setErroAlunos('')
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
  }, [perfil?.id, ehMentor, carregarAlunos]) // eslint-disable-line react-hooks/exhaustive-deps

  function escolherAluno(id) {
    setAlunoId(id)
    try { localStorage.setItem('alunoSelecionado', id) } catch { /* sem armazenamento */ }
  }

  async function alterarContagem(mostrar) {
    setPerfil((p) => ({ ...p, mostrar_contagem: mostrar }))
    await supabase.from('perfis').update({ mostrar_contagem: mostrar }).eq('id', perfil.id)
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
  if (perfil.papel === 'aluno' && perfil.suspenso) return <AcessoSuspenso perfil={perfil} />

  // Menu em poucos grupos curtos, na ordem do dia do aluno: começar → planejar → praticar → ver o progresso → falar com a mentoria
  const sufixo = (aluno, mentor) => (ehMentor ? mentor : aluno)
  const grupos = [
    {
      titulo: 'Início',
      itens: [
        ...(ehMentor ? [['visao-geral', '👀', 'Todos os alunos']] : []),
        ['hoje', '☀️', sufixo('Hoje', 'Hoje do aluno')],
      ],
    },
    {
      titulo: 'Planejar',
      itens: [
        ['horario', '🗓️', 'Horário'],
        ['trilha', '🧭', sufixo('Minha trilha', 'Trilha de estudos')],
        ['foco', '⏱️', sufixo('Foco', 'Foco do aluno')],
      ],
    },
    {
      titulo: 'Praticar',
      itens: [
        ['questoes', '🧠', 'Banco de questões'],
        ['listas', '📋', 'Listas de questões'],
        ['simulados', '🏁', 'Simulados'],
        ['erros', '📕', 'Caderno de erros'],
        ['redacao', '✍️', 'Redação'],
      ],
    },
    {
      titulo: 'Acompanhar',
      itens: [
        ['progresso', '📊', sufixo('Meu progresso', 'Progresso do aluno')],
        ['pontos', '🎯', 'Onde estão os pontos'],
        ['ranking', '🏆', 'Ranking'],
        ['conquistas', '🎖️', sufixo('Conquistas', 'Conquistas do aluno')],
      ],
    },
    {
      titulo: 'Mentoria',
      itens: [
        ['comunidade', '📣', 'Comunidade'],
        ['videoaulas', '🎬', 'Aulas e mentorias'],
        ehMentor ? ['agenda', '📅', 'Agenda'] : ['aulas', '🎓', 'Marcar aula'],
        ['relatorio', '📄', 'Relatório'],
      ],
    },
    ...(ehCeo
      ? [{ titulo: 'Gestão', itens: [['equipe', '🏢', 'Equipe'], ['mentores', '🧑‍🏫', 'Mentores'], ['financeiro', '💰', 'Financeiro'], ['site', '🌐', 'Página de vendas'], ['interessados', '📝', 'Interessados 2027'], ['feedbacks', '💬', 'Feedbacks']] }]
      : ehMentor
        ? [{ titulo: 'Gestão', itens: [['equipe', '👥', 'Meus alunos']] }]
        : []),
  ]
  const abasValidas = grupos.flatMap((g) => g.itens.map((i) => i[0]))
  const abaAtual = abasValidas.includes(aba) ? aba : ABAS_ANTIGAS[aba] ? ABAS_ANTIGAS[aba][0] : 'hoje'
  const partes = SUBABAS[abaAtual] || null
  const subAtual = partes ? (partes.some((x) => x[0] === subs[abaAtual]) ? subs[abaAtual] : (ABAS_ANTIGAS[aba]?.[1] || partes[0][0])) : null

  const alunoAtual = ehMentor ? alunos.find((a) => a.id === alunoId) : perfil
  const meuMentor = !ehMentor ? equipe.find((m) => m.id === perfil.mentor_id) : null
  const fotoDaMarca = (ehMentor ? perfil.foto_url : meuMentor?.foto_url || fotoMentor) || FOTO_MENTOR
  const primeiroNome = (perfil.nome || '').split(' ')[0] || 'Perfil'
  const subtitulo = ehCeo
    ? 'Painel do CEO'
    : ehMentor
      ? 'Painel do mentor'
      : `Olá, ${primeiroNome}!${meuMentor ? ` · Mentor: ${(meuMentor.nome || '').split(' ')[0]}` : ''}`
  const porAluno = POR_ALUNO.includes(abaAtual) && !(abaAtual === 'simulados' && subAtual !== 'notas')
  const grupoAtual = grupos.find((g) => g.itens.some((i) => i[0] === abaAtual))
  const itemAtual = grupoAtual?.itens.find((i) => i[0] === abaAtual)

  let conteudo
  if (abaAtual === 'comunidade') {
    conteudo = <Comunidade ehMentor={ehMentor} ehCeo={ehCeo} meuId={perfil.id} equipe={equipe} fotoPadrao={fotoDaMarca} />
  } else if (abaAtual === 'videoaulas') {
    conteudo = <Videoaulas ehMentor={ehMentor} ehCeo={ehCeo} meuId={perfil.id} equipe={equipe} />
  } else if (abaAtual === 'simulados' && subAtual === 'cronometro') {
    conteudo = <SimuladorProva />
  } else if (abaAtual === 'ranking') {
    conteudo = <Ranking perfil={perfil} ehMentor={ehMentor} irPara={setAba} />
  } else if (abaAtual === 'listas') {
    conteudo = <Listas perfil={perfil} ehMentor={ehMentor} alunos={alunos} />
  } else if (abaAtual === 'simulados' && subAtual === 'fazer') {
    conteudo = <SimuladoEnem perfil={perfil} ehMentor={ehMentor} />
  } else if (abaAtual === 'feedbacks') {
    conteudo = <FeedbacksCeo />
  } else if (abaAtual === 'interessados') {
    conteudo = <Interessados equipe={equipe} />
  } else if (abaAtual === 'simulados' && subAtual === 'provas') {
    conteudo = <Materiais ehCeo={ehCeo} />
  } else if (abaAtual === 'questoes') {
    conteudo = <BancoQuestoes perfil={perfil} ehMentor={ehMentor} alunos={alunos} />
  } else if (abaAtual === 'mentores') {
    conteudo = <Mentores onMudou={carregarEquipe} />
  } else if (abaAtual === 'visao-geral') {
    conteudo = <VisaoGeral equipe={equipe} onAbrir={(id, a) => { escolherAluno(id); setAba(a) }} />
  } else if (abaAtual === 'equipe') {
    conteudo = <Equipe meuId={perfil.id} ehCeo={ehCeo} onMudou={() => { carregarAlunos(); carregarEquipe() }} />
  } else if (abaAtual === 'financeiro') {
    conteudo = <Financeiro meuId={perfil.id} />
  } else if (abaAtual === 'site') {
    conteudo = <SiteEditor />
  } else if (abaAtual === 'agenda') {
    conteudo = <Agenda alunos={alunos} ehCeo={ehCeo} meuId={perfil.id} equipe={equipe} />
  } else if (abaAtual === 'aulas') {
    conteudo = <Aulas perfil={perfil} />
  } else if (ehMentor && erroAlunos) {
    conteudo = (
      <div className="cartao vazio" role="alert">
        <h2>Não deu para carregar os alunos</h2>
        <p>{erroAlunos}</p>
        <button className="botao primario" onClick={carregarAlunos}>Tentar de novo</button>
      </div>
    )
  } else if (ehMentor && alunos.length === 0) {
    conteudo = (
      <div className="cartao vazio">
        <h2>Nenhum aluno cadastrado ainda</h2>
        {ehCeo ? (
          <>
            <p>Cadastre alunos e mentores na aba <b>Equipe</b>.</p>
            <button className="botao primario" onClick={() => setAba('equipe')}>Ir para Equipe</button>
          </>
        ) : (
          <>
            <p>Cadastre seus alunos na aba <b>Meus alunos</b>. Os que o CEO vincular a você também aparecem aqui.</p>
            <button className="botao primario" onClick={() => setAba('equipe')}>Ir para Meus alunos</button>
          </>
        )}
      </div>
    )
  } else if (!alunoAtual) {
    conteudo = <Carregando />
  } else {
    const k = alunoAtual.id
    conteudo = {
      hoje: <Hoje key={k} alunoId={k} aluno={alunoAtual} ehMentor={ehMentor} irPara={setAba} config={config} />,
      foco: <Foco key={k} alunoId={k} ehMentor={ehMentor} irPara={setAba} />,
      conquistas: <Conquistas key={k} alunoId={k} aluno={alunoAtual} ehMentor={ehMentor} />,
      simulados: <Simulados key={k} alunoId={k} onVerEvolucao={() => setAba('progresso:evolucao')} />,
      horario: <Horario key={k} alunoId={k} editavel={ehMentor} aluno={alunoAtual} />,
      erros: <CadernoErros key={k} alunoId={k} ehMentor={ehMentor} />,
      redacao: <Redacao key={k} alunoId={k} ehMentor={ehMentor} alunos={alunos} />,
      progresso: subAtual === 'evolucao'
        ? <Evolucao key={k} alunoId={k} ehMentor={ehMentor} onLancar={() => setAba('simulados:notas')} />
        : <PainelAluno key={k} alunoId={k} aluno={alunoAtual} ehMentor={ehMentor} irPara={setAba} />,
      trilha: <Trilha key={k} alunoId={k} aluno={alunoAtual} ehMentor={ehMentor} />,
      pontos: <Pontos key={k} alunoId={k} aluno={alunoAtual} ehMentor={ehMentor} onIrCaderno={() => setAba('erros')} />,
      relatorio: <Relatorio key={k} aluno={alunoAtual} ehMentor={ehMentor} equipe={equipe} />,
    }[abaAtual]
  }

  return (
    <div className="app">
      <header className="topo nao-imprimir">
        <div className="topo-marca">
          <Avatar src={fotoDaMarca} nome={meuMentor?.nome || NOME_MENTOR} tamanho={40} />
          <div>
            <strong>{NOME_SITE}</strong>
            <span className="suave pequeno">{subtitulo}</span>
          </div>
        </div>
        <div className="topo-acoes">
          {perfil.papel === 'aluno' && <HoraDoFoco />}
          {perfil.papel === 'aluno' && <XpNotificacoes perfil={perfil} onAbrir={() => setAba('ranking')} />}
          <button className="botao-perfil" onClick={() => setEditandoPerfil(true)} aria-label="Meu perfil">
            <Avatar src={perfil.foto_url} nome={perfil.nome || perfil.email} tamanho={32} />
            <span className="botao-perfil-texto">Meu perfil</span>
          </button>
          <button className="botao fantasma topo-sair" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>

      <div className="layout">
        <nav className="menu nao-imprimir" aria-label="Seções">
          {grupos.map((g) => (
            <div key={g.titulo} className="menu-grupo">
              <span className="menu-titulo">{g.titulo}</span>
              {g.itens.map(([id, icone, nome]) => (
                <button
                  key={id}
                  className={abaAtual === id ? 'menu-item ativo' : 'menu-item'}
                  aria-current={abaAtual === id ? 'page' : undefined}
                  onClick={() => setAba(id)}
                >
                  <span aria-hidden="true">{icone}</span> {nome}
                  {id === 'financeiro' && aCobrar > 0 && <span className="menu-badge" aria-label={`${aCobrar} para cobrar`}>{aCobrar}</span>}
                  {id === 'interessados' && novosInteressados > 0 && <span className="menu-badge" aria-label={`${novosInteressados} novos`}>{novosInteressados}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="conteudo">
          <div className="nao-imprimir">
            <Contagem config={config} visivel={perfil.mostrar_contagem !== false} onAlterar={alterarContagem} />
            {perfil.papel === 'aluno' && <PagarMensalidade />}
            {ehCeo && novosInteressados > 0 && abaAtual !== 'interessados' && (
              <button className="aviso-cobranca aviso-interessados" onClick={() => setAba('interessados')}>
                📝 <b>{novosInteressados === 1 ? '1 nova pessoa interessada' : `${novosInteressados} novas pessoas interessadas`} na assessoria!</b> <span>Ver e chamar no WhatsApp →</span>
              </button>
            )}
            {ehCeo && aCobrar > 0 && abaAtual !== 'financeiro' && (
              <button className="aviso-cobranca" onClick={() => setAba('financeiro')}>
                💰 <b>{aCobrar} {aCobrar === 1 ? 'aluno para você cobrar' : 'alunos para você cobrar'} hoje.</b> <span>Abrir o financeiro →</span>
              </button>
            )}
          </div>

          {itemAtual && (
            <header className="pagina-titulo nao-imprimir">
              <span className="pagina-icone" aria-hidden="true">{itemAtual[1]}</span>
              <div>
                <span className="pagina-kicker">{grupoAtual.titulo}</span>
                <h1>{itemAtual[2]}</h1>
              </div>
            </header>
          )}

          {partes && (
            <div className="abas sub-abas nao-imprimir" role="tablist" aria-label={`Partes de ${itemAtual?.[2] || ''}`}>
              {partes.map(([id, icone, nome]) => (
                <button key={id} role="tab" aria-selected={subAtual === id} className={subAtual === id ? 'aba ativa' : 'aba'} onClick={() => setSub(abaAtual, id)}>
                  <span aria-hidden="true">{icone}</span> {nome}
                </button>
              ))}
            </div>
          )}

          {ehMentor && porAluno && (
            <div className="nao-imprimir">
              <SeletorAluno
                alunos={alunos}
                equipe={equipe}
                meuId={perfil.id}
                ehCeo={ehCeo}
                alunoId={alunoId}
                onEscolher={escolherAluno}
                onRenomeado={carregarAlunos}
              />
            </div>
          )}

          <ErrorBoundary chave={`${abaAtual}-${alunoId}`}>
            <Suspense fallback={<Carregando />}>{conteudo}</Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <MenuCelular
        grupos={grupos}
        atalhos={ehMentor ? ['visao-geral', 'hoje', 'progresso', 'agenda'] : ['hoje', 'questoes', 'simulados', 'progresso']}
        abaAtual={abaAtual}
        onIr={setAba}
        badges={{ financeiro: aCobrar, interessados: novosInteressados }}
        onSair={() => supabase.auth.signOut()}
      />

      {editandoPerfil && (
        <Suspense fallback={null}><Perfil
          perfil={perfil}
          onAtualizado={(mudancas) => setPerfil((p) => ({ ...p, ...mudancas }))}
          onTrocarSenha={() => { setEditandoPerfil(false); setTrocandoSenha(true) }}
          onFechar={() => setEditandoPerfil(false)}
        /></Suspense>
      )}
      {trocandoSenha && <TrocarSenha onFechar={() => setTrocandoSenha(false)} />}
      {senhaObrigatoria && !trocandoSenha && <TrocarSenha obrigatoria onFechar={() => setSenhaObrigatoria(false)} />}
      {perfil.papel === 'aluno' && <BotaoWhatsapp perfil={perfil} />}
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
                    <option key={a.id} value={a.id}>{a.nome || a.email}{a.suspenso ? ' (suspenso)' : ''}</option>
                  ))}
                </optgroup>
              ))
            : alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome || a.email}{a.suspenso ? ' (suspenso)' : ''}
                </option>
              ))}
        </select>
      </label>
      {aluno && !editando && (
        <div className="seletor-info">
          <span className="suave pequeno">{aluno.email}</span>
          {aluno.suspenso && <span className="selo selo-suspenso">⛔ Acesso suspenso</span>}
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

// O que o aluno suspenso vê: o login funciona, mas o resto da plataforma fica fechado
function AcessoSuspenso({ perfil }) {
  const [whatsapp, setWhatsapp] = useState('')

  useEffect(() => {
    supabase.from('site_config').select('whatsapp').eq('id', 1).maybeSingle().then(({ data }) => setWhatsapp((data?.whatsapp || '').replace(/\D/g, '')))
  }, [])

  const primeiroNome = (perfil.nome || '').split(' ')[0]
  const mensagem = `Olá! Aqui é ${perfil.nome || perfil.email}. Meu acesso à ${NOME_SITE} está suspenso e quero regularizar.`

  return (
    <div className="centro-tela">
      <div className="cartao suspenso-cartao">
        <span className="suspenso-icone" aria-hidden="true">⛔</span>
        <h1>Acesso suspenso</h1>
        <p>
          {primeiroNome ? `${primeiroNome}, seu` : 'Seu'} acesso à {NOME_SITE} está suspenso no momento, normalmente por causa de um pagamento em aberto.
        </p>
        <p className="suave">
          Nada foi apagado: seu horário, seus simulados e seu caderno de erros continuam guardados. Assim que o pagamento for regularizado, é só entrar de novo.
        </p>
        <div className="linha-botoes" style={{ justifyContent: 'center' }}>
          {whatsapp && (
            <a className="botao primario" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer">
              Falar no WhatsApp
            </a>
          )}
          <button className="botao fantasma" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </div>
    </div>
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
