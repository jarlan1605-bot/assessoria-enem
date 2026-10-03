// Troque aqui o nome que aparece no topo do site
export const NOME_SITE = 'Mentoria ENEM'
export const NOME_MENTOR = 'Jarlan'
export const INSTAGRAM = 'jarlanamed' // sem o @; deixe '' para esconder

// Sua foto: coloque o arquivo na pasta "public" com este nome.
// Enquanto não houver foto, aparecem as iniciais.
export const FOTO_MENTOR = '/foto-mentor.jpg'
export const FOTO_PERFIL = '/foto-perfil.jpg'
export const FRASE_LOGIN = 'Seu horário de estudos e seus simulados, tudo num lugar só.'

// Fotos das aulas (pasta public/aulas). Para trocar, substitua os arquivos
// ou edite esta lista; deixe a lista vazia [] para esconder a faixa.
export const FOTOS_AULAS = Array.from({ length: 8 }, (_, i) => `/aulas/aula-${i + 1}.jpg`)

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
