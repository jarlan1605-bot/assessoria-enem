// Só em desenvolvimento (npm run dev, ?demo=...): telas novas com dados de exemplo para conferir e tirar prints.
import { useEffect, useState } from 'react'
import { HojeVisao } from './Hoje'
import { Pomodoro, GraficoSemana } from './Foco'
import { ConquistasVisao } from './Conquistas'
import { ResolverLista, ImpressaoLista } from './Listas'
import { cartaoDia, cartaoConquista, cartaoLista, cartaoSemana } from './cartoesStory'
import { CONQUISTAS } from './estudo'
import MenuCelular from './MenuCelular'

const aluno = { id: 'demo', nome: 'Ana Beatriz Souza', papel: 'aluno' }
const resumo = {
  meta_questoes: 30, meta_foco: 50, questoes: 18, acertos: 13, foco_min: 25, revisoes: 5, xp: 92,
  blocos: [
    { id: 'b1', materia: 'Química', conteudo: 'Estequiometria', inicio: '08:00', fim: '09:00', minutos: 60, status: 'feito' },
    { id: 'b2', materia: 'Biologia', conteudo: 'Introdução à Célula', inicio: '09:15', fim: '10:15', minutos: 60, status: null },
  ],
}
const desempenho = [
  { area: 'natureza', materia: 'Biologia', total: 64, acertos: 52 }, { area: 'humanas', materia: 'História', total: 40, acertos: 31 },
  { area: 'linguagens', materia: 'Português', total: 55, acertos: 41 }, { area: 'matematica', materia: 'Matemática', total: 70, acertos: 32 },
  { area: 'natureza', materia: 'Física', total: 38, acertos: 15 }, { area: 'natureza', materia: 'Química', total: 33, acertos: 17 },
]
const ofensiva = { atual: 12, recorde: 19, hoje_contou: false, semana: [true, true, true, true, false, false, false] }
const hojeD = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const mesIni = hojeD.slice(0, 8) + '01'
const diasMes = Array.from({ length: Number(hojeD.slice(8, 10)) }, (_, i) => mesIni.slice(0, 8) + String(i + 1).padStart(2, '0')).filter((d, i) => i % 5 !== 3)
const top = [{ aluno_id: 'x1', nome: 'Lucas M.', xp: 640 }, { aluno_id: 'x2', nome: 'Bia R.', xp: 590 }, { aluno_id: 'demo', nome: 'Ana B.', xp: 552 }]
const dadosHoje = {
  resumo, ofensiva, desempenho, ultimaLista: null, semana: { questoes: 214, focoMin: 545, completos: 3 },
  ranking: { semana: { pos: 3, total: 15, xp: 552, falta: 39, acima: 'Bia R.', top }, mes: { pos: 2, total: 15, xp: 1840, top } },
  mes: { questoes: 486, acertos: 341, focoMin: 1210, dias: diasMes, diasPassados: Number(hojeD.slice(8, 10)), ultimoDia: new Date(Number(hojeD.slice(0, 4)), Number(hojeD.slice(5, 7)), 0).getDate(), mesIni },
  horario: [
    { id: 'b1', inicio: '07:00', fim: '07:50', materia: 'Escola/Cursinho', conteudo: '', status: null },
    { id: 'b2', inicio: '08:00', fim: '09:00', materia: 'Química', conteudo: 'Estequiometria', status: 'feito' },
    { id: 'b3', inicio: '09:15', fim: '10:15', materia: 'Biologia', conteudo: 'Introdução à Célula', status: null },
    { id: 'b4', inicio: '14:00', fim: '15:30', materia: 'Matemática', conteudo: 'Funções do 1º grau', status: null },
    { id: 'b5', inicio: '19:00', fim: '20:00', materia: 'Redação', conteudo: 'Treino de introdução', status: null },
  ],
}
const sessoes = [
  ['Química', 50, 0], ['Biologia', 25, 0], ['Matemática', 50, 1], ['Física', 25, 1], ['Matemática', 50, 2], ['Português', 25, 3], ['Química', 25, 3],
].map(([materia, minutos, d]) => ({ materia, minutos, criado_em: new Date(Date.now() - (3 - d) * 864e5).toISOString() }))
const questoes = [
  { id: 'q1', prova: 'ENEM', ano: 2022, numero: 101, area: 'natureza', materia: 'Biologia', assunto: 'Citologia', revisado: true, gabarito: 'C',
    enunciado: 'As mitocôndrias são organelas presentes em células eucarióticas e responsáveis por grande parte da produção de ATP. Uma característica que reforça a teoria endossimbiótica sobre a origem dessas organelas é a presença de',
    alternativas: { A: 'parede celular de celulose.', B: 'ribossomos 80S iguais aos do citoplasma.', C: 'DNA circular próprio.', D: 'membrana simples.', E: 'núcleo organizado.' },
    comentario: 'A teoria endossimbiótica diz que a mitocôndria veio de uma bactéria englobada. Por isso ela tem ‹b›DNA circular próprio‹/b›, como as bactérias.' },
  { id: 'q2', prova: 'ENEM', ano: 2021, numero: 95, area: 'natureza', materia: 'Biologia', assunto: 'Membrana plasmática', revisado: true, gabarito: 'A',
    enunciado: 'Ao colocar hemácias em uma solução muito concentrada de sal, observa-se que elas murcham. Esse fenômeno ocorre porque',
    alternativas: { A: 'a água sai da célula por osmose.', B: 'o sal entra na célula por difusão.', C: 'a membrana se rompe.', D: 'há transporte ativo de água.', E: 'o citoplasma fica mais diluído.' },
    comentario: 'O meio é ‹b›hipertônico‹/b›: a água sai da hemácia por osmose e ela murcha.' },
  { id: 'q3', prova: 'ENEM', ano: 2020, numero: 110, area: 'natureza', materia: 'Biologia', assunto: 'Citologia', revisado: true, gabarito: 'E',
    enunciado: 'Qual organela é responsável pela síntese de proteínas que serão exportadas pela célula?',
    alternativas: { A: 'Lisossomo', B: 'Peroxissomo', C: 'Complexo golgiense', D: 'Vacúolo', E: 'Retículo endoplasmático rugoso' },
    comentario: 'Os ribossomos aderidos ao ‹b›retículo endoplasmático rugoso‹/b› produzem as proteínas de exportação.' },
]

function Cartoes() {
  const [imgs, setImgs] = useState([])
  useEffect(() => {
    ;(async () => {
      const c = CONQUISTAS.find((x) => x.codigo === 'seq7')
      const blobs = await Promise.all([
        cartaoDia({ nome: aluno.nome, feitas: 5, total: 5, focoMin: 200, questoes: 47, ofensiva: 12, dataTexto: 'Domingo, 22 de novembro' }),
        cartaoConquista({ nome: aluno.nome, conquista: c, dataTexto: 'desbloqueada em 22 de novembro' }),
        cartaoLista({ nome: aluno.nome, titulo: 'Citologia', acertos: 31, total: 35 }),
        cartaoSemana({ nome: aluno.nome, focoMin: 545, questoes: 214, dias: ofensiva.semana.map((x, i) => x || i === 6), ofensiva: 12, completos: 3 }),
      ])
      setImgs(blobs.map((b) => URL.createObjectURL(b)))
    })()
  }, [])
  return <div className="demo-cartoes">{imgs.map((u, i) => <img key={i} src={u} alt="" style={{ width: 270, borderRadius: 16, boxShadow: 'var(--sombra)' }} />)}</div>
}

export default function Demo() {
  const tela = new URLSearchParams(window.location.search).get('demo')
  const [d, setD] = useState(dadosHoje)
  const [bonus, setBonus] = useState(false)
  const marcar = (m) => {
    const blocos = d.resumo.blocos.map((b) => (b.id === m.horarioId ? { ...b, status: m.feita ? null : 'feito' } : b))
    setD({ ...d, resumo: { ...d.resumo, blocos, xp: d.resumo.xp + 10 }, ofensiva: { ...d.ofensiva, hoje_contou: true } })
  }
  const completo = tela === 'hoje-completo'
  return (
    <div className="app"><div className="layout"><main className="conteudo" style={{ maxWidth: 820, margin: '0 auto', padding: 16 }}>
      {(tela === 'hoje' || completo) && (
        <HojeVisao
          dados={completo ? { ...d, resumo: { ...d.resumo, questoes: 31, foco_min: 50, blocos: d.resumo.blocos.map((b) => ({ ...b, status: 'feito' })) }, ofensiva: { ...d.ofensiva, hoje_contou: true, atual: 13 } } : d}
          aluno={aluno} config={{ data_enem_1: '2027-11-07T13:30:00-03:00' }} bonus={completo || bonus} domingo
          onMarcarBloco={(m) => { marcar(m); if (!m.feita) setBonus(false) }} irPara={() => {}}
        />
      )}
      {tela === 'foco' && <section className="secao foco"><Pomodoro registrar={async () => {}} /><GraficoSemana sessoes={sessoes} /></section>}
      {tela === 'conquistas' && (
        <ConquistasVisao aluno={aluno} dados={{
          conq: { stats: { questoes: 300, acertos: 188, recorde: 19, simulados: 2, foco_min: 545, revisoes: 14, redacoes: 1, nivel: 4, dias_completos: 6 }, ganhas: { q1: '2026-09-02', q100: '2026-10-01', seq7: '2026-10-20', sim1: '2026-10-11', dia1: '2026-09-10', revisor: '2026-11-03', redacao1: '2026-10-28' } },
          desempenho, ofensiva,
        }} />
      )}
      {tela === 'lista' && <ResolverLista demo perfil={aluno} lista={{ id: null, titulo: 'Lista — Introdução à Célula' }} questoes={questoes} onVoltar={() => {}} />}
      {tela === 'pdf' && <ImpressaoLista semImprimir lista={{ titulo: 'Lista — Introdução à Célula', prazo: '2026-11-30' }} aluno={aluno} questoes={questoes} gabarito />}
      {tela === 'cartoes' && <Cartoes />}
      {tela === 'menu' && (
        <>
          <HojeVisao dados={d} aluno={aluno} config={{ data_enem_1: '2027-11-07T13:30:00-03:00' }} irPara={() => {}} onMarcarBloco={() => {}} />
          <MenuCelular abaAtual="hoje" onIr={() => {}} atalhos={['hoje', 'questoes', 'simulados', 'progresso']} grupos={[
            { titulo: 'Início', itens: [['hoje', '☀️', 'Hoje']] },
            { titulo: 'Planejar', itens: [['horario', '🗓️', 'Horário'], ['trilha', '🧭', 'Minha trilha'], ['foco', '⏱️', 'Foco']] },
            { titulo: 'Praticar', itens: [['questoes', '🧠', 'Banco de questões'], ['listas', '📋', 'Listas de questões'], ['simulados', '🏁', 'Simulados'], ['erros', '📕', 'Caderno de erros'], ['redacao', '✍️', 'Redação']] },
            { titulo: 'Acompanhar', itens: [['progresso', '📊', 'Meu progresso'], ['pontos', '🎯', 'Onde estão os pontos'], ['ranking', '🏆', 'Ranking'], ['conquistas', '🎖️', 'Conquistas']] },
            { titulo: 'Mentoria', itens: [['comunidade', '📣', 'Comunidade'], ['videoaulas', '🎬', 'Aulas e mentorias'], ['aulas', '🎓', 'Marcar aula'], ['relatorio', '📄', 'Relatório']] },
          ]} />
        </>
      )}
    </main></div></div>
  )
}
