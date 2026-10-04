import fotoMentor from './foto-mentor.jpg'
import fotoPerfil from './foto-perfil.jpg'
import aula1 from './aula-1.jpg'
import aula2 from './aula-2.jpg'
import aula3 from './aula-3.jpg'
import aula4 from './aula-4.jpg'
import aula5 from './aula-5.jpg'
import aula6 from './aula-6.jpg'
import aula7 from './aula-7.jpg'
import aula8 from './aula-8.jpg'

// Troque aqui o nome que aparece no topo do site
export const NOME_SITE = 'Mentoria ENEM'
export const NOME_MENTOR = 'Jarlan'
export const INSTAGRAM = 'jarlanamed' // sem o @; deixe '' para esconder

// Sua foto: arquivos foto-mentor.jpg e foto-perfil.jpg (troque mantendo o nome).
// Enquanto não houver foto, aparecem as iniciais.
export const FOTO_MENTOR = fotoMentor
export const FOTO_PERFIL = fotoPerfil
export const FRASE_LOGIN = 'Seu horário de estudos e seus simulados, tudo num lugar só.'

// Fotos das aulas: aula-1.jpg a aula-8.jpg. Para trocar, substitua os arquivos
// mantendo o nome; deixe a lista vazia [] para esconder a faixa.
export const FOTOS_AULAS = [aula1, aula2, aula3, aula4, aula5, aula6, aula7, aula8]

export const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

// Matérias do horário e suas cores
export const MATERIAS = [
  { nome: 'Matemática', cor: '#e8590c' },
  { nome: 'Física', cor: '#7048e8' },
  { nome: 'Química', cor: '#0c8599' },
  { nome: 'Biologia', cor: '#2f9e44' },
  { nome: 'Português', cor: '#1971c2' },
  { nome: 'Literatura', cor: '#4263eb' },
  { nome: 'Redação', cor: '#c2255c' },
  { nome: 'Inglês/Espanhol', cor: '#1098ad' },
  { nome: 'História', cor: '#b35a00' },
  { nome: 'Geografia', cor: '#5c940d' },
  { nome: 'Filosofia', cor: '#862e9c' },
  { nome: 'Sociologia', cor: '#a61e4d' },
  { nome: 'Revisão', cor: '#495057' },
  { nome: 'Simulado', cor: '#d9480f' },
  { nome: 'Descanso', cor: '#868e96' },
  { nome: 'Humanas', cor: '#e67700' },
  { nome: 'Natureza', cor: '#2f9e44' },
  { nome: 'Escola/Cursinho', cor: '#1864ab' },
  { nome: 'Outro', cor: '#868e96' },
]

export function corDaMateria(nome) {
  return MATERIAS.find((m) => m.nome === nome)?.cor ?? '#868e96'
}

// Áreas do ENEM (45 questões cada)
export const AREAS = [
  { chave: 'linguagens', nome: 'Linguagens', curto: 'LC', cor: '#1971c2' },
  { chave: 'humanas', nome: 'Humanas', curto: 'CH', cor: '#e67700' },
  { chave: 'natureza', nome: 'Natureza', curto: 'CN', cor: '#2f9e44' },
  { chave: 'matematica', nome: 'Matemática', curto: 'MT', cor: '#c2255c' },
]

// 0 = segunda ... 6 = domingo
export function indiceDeHoje() {
  return (new Date().getDay() + 6) % 7
}

// Tipos de erro (iguais aos da planilha de simulados)
export const TIPOS_ERRO = {
  descuido: { nome: 'Descuido', desc: 'Sabia, mas errou por atenção ou pressa', cor: '#e67700' },
  conteudo: { nome: 'Conteúdo', desc: 'Já estudou, mas não lembrou ou não domina', cor: '#c2255c' },
  lacuna: { nome: 'Lacuna', desc: 'Assunto que ainda não estudou', cor: '#7048e8' },
}

// Matérias de cada área do ENEM (em Matemática, por tema)
export const MATERIAS_POR_AREA = {
  linguagens: ['Português', 'Literatura', 'Língua estrangeira', 'Artes'],
  humanas: ['História', 'Geografia', 'Filosofia', 'Sociologia'],
  natureza: ['Física', 'Química', 'Biologia'],
  matematica: ['Básica', 'Álgebra e funções', 'Geometria', 'Estatística e probabilidade'],
}
