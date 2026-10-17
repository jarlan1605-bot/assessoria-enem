// Incidência dos assuntos no ENEM e o "custo-benefício" de cada erro do caderno.
// Fonte: Raio X ENEM 2009–2025 (SAS Educação) — assuntos mais cobrados por disciplina.
// Este arquivo é usado pela aba "Onde estão seus pontos" e pela função api/o-que-estudar.js.
// Não importe nada do site aqui (imagens etc.): ele também roda no servidor.

export const FONTE = 'Raio X ENEM 2009–2025 (SAS Educação)'

// Cada grupo traz o total de itens analisados (para o mesmo bloco de questões) e quantas
// questões esse bloco tem por prova. Assim: questões por prova = frequência × porProva / total.
// Biologia, Física e Química dividem as 45 de Natureza (551 + 482 + 599 = 1632 itens).
// Filosofia, Geografia, História e Sociologia dividem as 45 de Humanas (1440 itens).
// Português, Arte e Educação Física dividem as 40 de Linguagens sem língua estrangeira (1280 itens);
// Inglês e Espanhol são as 5 da língua escolhida.
// Formato de cada assunto: [nome, frequência, palavras-chave para reconhecer no caderno de erros]
const GRUPOS = [
  {
    area: 'matematica', materia: 'Matemática', total: 1507, porProva: 45,
    assuntos: [
      ['Proporcionalidade direta e inversa', 223, ['proporcional', 'proporcao', 'regra de tres', 'grandezas', 'porcentagem', 'percentual', 'desconto', 'acrescimo']],
      ['Estatística', 190, ['estatistic', 'media', 'mediana', 'moda', 'desvio padrao', 'tendencia central', 'dispersao', 'grafico', 'tabela', 'variancia']],
      ['Geometria plana', 111, ['geometria plana', 'area', 'perimetro', 'triangulo', 'quadrilatero', 'circunferencia', 'circulo', 'poligono', 'semelhanca', 'pitagoras', 'angulo']],
      ['Geometria espacial', 99, ['geometria espacial', 'prisma', 'piramide', 'cilindro', 'cone', 'esfera', 'solido', 'poliedro', 'planificacao', 'vista', 'cubo']],
      ['Probabilidade', 83, ['probabil', 'chance']],
      ['Funções', 81, ['funcao', 'funcoes', 'afim', 'quadratica', 'exponencial', 'logarit', 'parabola', '1 grau', '2 grau', 'primeiro grau', 'segundo grau']],
      ['Razão', 57, ['razao', 'escala', 'densidade', 'taxa']],
      ['Volume', 56, ['volume', 'capacidade', 'litro']],
      ['Análise combinatória', 56, ['combinatoria', 'permuta', 'arranjo', 'combinacao', 'contagem', 'principio fundamental']],
      ['Unidades de medida', 49, ['unidade', 'conversao', 'medida', 'notacao cientifica']],
    ],
  },
  {
    area: 'natureza', materia: 'Física', total: 1632, porProva: 45,
    assuntos: [
      ['Calorimetria', 36, ['calorimetr', 'calor', 'capacidade termica', 'mudanca de estado', 'termologia', 'temperatura', 'dilatacao', 'termometr']],
      ['Circuitos elétricos', 32, ['circuito', 'eletrodinamic', 'resistor', 'resistencia eletrica', 'corrente eletrica', 'lei de ohm', 'ohm', 'ddp', 'tensao eletrica', 'eletricidade', 'gerador', 'receptor']],
      ['Termodinâmica', 24, ['termodinamic', 'maquina termica', 'gas', 'gases', 'transformacao gasosa', 'entropia', 'carnot', 'rendimento']],
      ['Forças e movimento', 24, ['forca', 'newton', 'dinamica', 'atrito', 'plano inclinado', 'mecanica', 'movimento circular', 'quantidade de movimento', 'impulso', 'colisao']],
      ['Consumo de energia elétrica', 17, ['consumo de energia', 'consumo', 'potencia eletrica', 'potencia', 'kwh', 'conta de luz', 'energia eletrica']],
      ['Reflexão e refração', 15, ['reflexao', 'refracao', 'optica', 'otica', 'espelho', 'lente', 'luz']],
      ['Trabalho, energia e os teoremas', 13, ['trabalho', 'energia mecanica', 'energia cinetica', 'energia potencial', 'conservacao de energia', 'teorema']],
      ['Propriedades físicas do som', 13, ['som', 'acustica', 'sonor', 'timbre', 'decibe']],
      ['Aplicações das propriedades das ondas', 13, ['onda', 'ondulatori', 'frequencia', 'interferencia', 'difracao', 'ressonancia', 'doppler', 'radiacao eletromagnetica', 'espectro']],
      ['Lançamento vertical, horizontal e oblíquo', 11, ['lancamento', 'projetil', 'queda livre', 'obliquo', 'cinematica', 'mru', 'muv', 'velocidade', 'aceleracao']],
    ],
  },
  {
    area: 'natureza', materia: 'Química', total: 1632, porProva: 45,
    assuntos: [
      ['Funções orgânicas', 36, ['funcoes organicas', 'funcao organica', 'organica', 'isomeria', 'nomenclatura', 'hidrocarboneto', 'alcool', 'acido carboxilico', 'ester', 'amina', 'grupo funcional']],
      ['Reações orgânicas', 28, ['reacoes organicas', 'reacao organica', 'polimer', 'esterificacao', 'saponificacao', 'combustao']],
      ['Aplicações da cinética química', 25, ['cinetica', 'velocidade de reacao', 'velocidade da reacao', 'catalisador', 'energia de ativacao']],
      ['Pilhas', 19, ['pilha', 'eletroquimic', 'eletrolise', 'oxirreducao', 'redox', 'bateria', 'potencial de reducao', 'corrosao']],
      ['Processos de separação de misturas', 19, ['separacao', 'mistura', 'destilacao', 'filtracao', 'decantacao', 'centrifugacao']],
      ['Tecnologias ambientais', 18, ['tecnologias ambientais', 'tecnologia ambiental', 'biocombustive', 'reciclagem', 'energia renovavel', 'tratamento de agua', 'biodiesel']],
      ['Controle de poluição', 17, ['poluicao', 'chuva acida', 'efeito estufa', 'camada de ozonio', 'quimica ambiental', 'poluente']],
      ['Concentração de soluções', 17, ['concentracao', 'solucao', 'solucoes', 'diluicao', 'molaridade', 'titulacao', 'ppm']],
      ['Poluição da água', 16, ['poluicao da agua', 'eutrofizacao', 'esgoto', 'metais pesados']],
      ['Tipos de reações químicas', 15, ['reacoes quimicas', 'reacao quimica', 'tipos de reacao', 'neutralizacao', 'precipitacao', 'balanceamento']],
    ],
  },
  {
    area: 'natureza', materia: 'Biologia', total: 1632, porProva: 45,
    assuntos: [
      ['Desequilíbrio em ecossistemas', 64, ['desequilibrio', 'ecossistema', 'impacto ambiental', 'ecologia', 'meio ambiente', 'bioacumulacao', 'magnificacao', 'especie invasora', 'especies exoticas', 'desmatamento', 'poluicao', 'eutrofizacao', 'aquecimento global']],
      ['Doenças causadas por vírus', 23, ['virus', 'virose', 'dengue', 'covid', 'zika', 'hiv', 'aids', 'sarampo', 'gripe', 'vacina']],
      ['DNA e genética', 22, ['dna', 'genetic', 'gene', 'genes', 'mendel', 'hereditariedade', 'heranca', 'mutacao', 'rna', 'sintese proteica', 'transcricao', 'biotecnologia', 'transgenic', 'clonagem']],
      ['Bioquímica', 18, ['bioquimic', 'proteina', 'carboidrato', 'lipidio', 'enzima', 'vitamina', 'sais minerais']],
      ['Biologia celular', 18, ['celula', 'citolog', 'organela', 'membrana', 'mitose', 'meiose', 'divisao celular', 'biologia celular']],
      ['Ciclos biogeoquímicos', 17, ['ciclo', 'biogeoquimic']],
      ['Relações ecológicas', 16, ['relacoes ecologicas', 'relacao ecologica', 'mutualismo', 'parasitismo', 'predacao', 'competicao', 'comensalismo']],
      ['Cadeias e teias alimentares', 15, ['cadeia alimentar', 'cadeias alimentares', 'teia alimentar', 'teias', 'nivel trofico', 'fluxo de energia', 'piramide ecologica']],
      ['Doenças causadas por protozoários', 13, ['protozo', 'malaria', 'chagas', 'leishmaniose', 'toxoplasmose', 'amebiase']],
      ['Doenças causadas por bactérias', 12, ['bacteri', 'tuberculose', 'leptospirose', 'colera', 'antibiotico', 'tetano']],
      ['Relações interespecíficas', 12, ['interespecific']],
      ['Saúde', 12, ['saude', 'doenca', 'verminose', 'parasitolog', 'saneamento']],
    ],
  },
  {
    area: 'humanas', materia: 'Filosofia', total: 1440, porProva: 45,
    assuntos: [
      ['Filosofia política', 24, ['filosofia politica', 'contratualis', 'hobbes', 'locke', 'rousseau', 'maquiavel', 'politica']],
      ['Moral e ética', 15, ['etica', 'moral']],
      ['Aristóteles', 10, ['aristoteles']],
      ['Origens da modernidade', 8, ['modernidade', 'humanismo', 'renascimento']],
      ['Descartes', 8, ['descartes', 'racionalismo', 'cartesian']],
      ['Filosofia medieval', 8, ['medieval', 'agostinho', 'tomas de aquino', 'escolastica', 'patristica']],
      ['Naturalistas (filósofos da physis)', 8, ['pre socratic', 'physis', 'naturalistas', 'tales', 'heraclito', 'parmenides']],
      ['Cultura e sociedade', 7, ['cultura']],
      ['Epistemologia', 7, ['epistemolog', 'conhecimento', 'empirismo', 'hume', 'ciencia']],
      ['Filosofia antiga', 7, ['filosofia antiga', 'socrates', 'platao', 'sofista']],
      ['Filosofia contemporânea', 7, ['contemporanea', 'nietzsche', 'existencialismo', 'sartre', 'frankfurt', 'arendt', 'foucault']],
      ['Kant', 7, ['kant', 'imperativo categorico', 'iluminismo']],
    ],
  },
  {
    area: 'humanas', materia: 'Geografia', total: 1440, porProva: 45,
    assuntos: [
      ['Urbanização', 34, ['urbaniz', 'cidade', 'metropole', 'urbano', 'urbana', 'favela', 'segregacao']],
      ['Agropecuária', 32, ['agropecuaria', 'agricultura', 'pecuaria', 'agronegocio', 'agrar', 'agricola']],
      ['Ruralidade', 26, ['rural', 'campo', 'reforma agraria', 'estrutura fundiaria']],
      ['Desenvolvimento econômico', 24, ['desenvolvimento', 'economia', 'economic', 'industrializacao', 'industria', 'globalizacao', 'idh']],
      ['Geopolítica e relações internacionais', 21, ['geopolitica', 'relacoes internacionais', 'guerra fria', 'conflito', 'blocos economicos', 'onu']],
      ['Geomorfologia', 19, ['geomorfolog', 'relevo', 'erosao', 'intemperismo']],
      ['Migrações', 19, ['migra', 'refugiad', 'imigra', 'emigra', 'demografi', 'populacao']],
      ['Interpretação de mapas', 18, ['mapa', 'cartografi', 'escala', 'projecao', 'coordenadas', 'fuso']],
      ['Climatologia', 18, ['clima', 'climatolog', 'massas de ar', 'chuva', 'el nino', 'aquecimento global', 'efeito estufa']],
      ['Geologia', 14, ['geologi', 'placas tectonicas', 'tectonic', 'rocha', 'solo', 'minerais', 'vulcan', 'terremoto']],
    ],
  },
  {
    area: 'humanas', materia: 'História', total: 1440, porProva: 45,
    assuntos: [
      ['Brasil colonial', 46, ['colonia', 'colonial', 'colonizacao', 'capitanias', 'engenho', 'acucar', 'mineracao', 'bandeirantes', 'jesuitas', 'inconfidencia']],
      ['Primeira República', 31, ['primeira republica', 'republica velha', 'cafe com leite', 'coronelismo', 'canudos', 'contestado', 'revolta da vacina']],
      ['Era Vargas', 26, ['vargas', 'estado novo', 'era vargas', 'clt']],
      ['Brasil Império: Segundo Reinado', 23, ['segundo reinado', 'imperio', 'pedro ii', 'guerra do paraguai', 'monarquia']],
      ['História pública', 22, ['historia publica', 'memoria', 'patrimonio historico']],
      ['Ditadura civil-militar no Brasil', 21, ['ditadura', 'regime militar', 'ai 5', 'golpe de 1964', '1964', 'diretas ja']],
      ['Civilizações da Antiguidade Clássica', 13, ['antiguidade', 'grecia', 'roma', 'classica', 'atenas']],
      ['Revolução Industrial', 13, ['revolucao industrial', 'industrial', 'fordismo', 'taylorismo']],
      ['Abolição da escravidão', 12, ['abolicao', 'lei aurea', 'abolicionis']],
      ['Absolutismo monárquico', 9, ['absolutismo', 'mercantilismo']],
      ['República Nova', 9, ['republica nova', 'nova republica', 'redemocratizacao', 'constituicao de 1988']],
      ['Trabalho escravo', 9, ['escravid', 'escravo', 'escravizad', 'trafico negreiro', 'quilombo']],
      ['América Latina no século XX', 9, ['america latina', 'revolucao cubana', 'cuba', 'revolucao mexicana', 'peronismo']],
    ],
  },
  {
    area: 'humanas', materia: 'Sociologia', total: 1440, porProva: 45,
    assuntos: [
      ['Direito, cidadania e movimentos sociais', 48, ['cidadania', 'movimentos sociais', 'movimento social', 'direitos', 'direito', 'democracia']],
      ['Cultura e sociedade', 27, ['cultura', 'etnocentrismo', 'relativismo', 'industria cultural']],
      ['Identidade e diversidade', 25, ['identidade', 'diversidade', 'racismo', 'genero', 'preconceito', 'etnia']],
      ['Política e Estado', 23, ['estado', 'poder', 'politica', 'weber', 'dominacao']],
      ['Trabalho e sociedade', 21, ['trabalho', 'marx', 'alienacao', 'fordismo', 'precarizacao', 'uberizacao']],
      ['Meios de comunicação', 14, ['comunicacao', 'midia', 'redes sociais', 'internet']],
      ['Desigualdade', 11, ['desigualdade']],
      ['Patrimônio cultural', 8, ['patrimonio']],
      ['Estrutura social e desigualdade', 8, ['estratificacao', 'estrutura social', 'classes sociais', 'mobilidade social']],
      ['Dilemas da sociedade contemporânea', 7, ['contemporanea', 'globalizacao', 'consumismo', 'modernidade liquida', 'bauman']],
      ['Violência', 7, ['violencia']],
    ],
  },
  {
    area: 'linguagens', materia: 'Português', total: 1280, porProva: 40,
    assuntos: [
      ['Competência leitora (interpretação)', 570, ['competencia leitora', 'interpretacao', 'leitura', 'compreensao', 'texto', 'inferencia', 'ideia central']],
      ['Apreensão de sentido', 139, ['apreensao de sentido', 'sentido', 'efeito de sentido', 'significado', 'ironia', 'humor']],
      ['Estruturas linguísticas e aspectos discursivos', 82, ['estruturas linguisticas', 'aspectos discursivos', 'coesao', 'coerencia', 'conectivo', 'operadores argumentativos', 'discurso']],
      ['Competência linguística (gramática e variação)', 56, ['competencia linguistica', 'gramatica', 'sintaxe', 'morfologia', 'pontuacao', 'concordancia', 'regencia', 'crase', 'classes de palavras', 'variacao linguistica', 'variacao', 'norma padrao']],
      ['Elementos da comunicação (funções da linguagem)', 52, ['elementos da comunicacao', 'funcoes da linguagem', 'funcao da linguagem', 'metalinguistic', 'conativa', 'referencial', 'fatica', 'emotiva']],
      ['Estratégias de convencimento', 51, ['convencimento', 'argumentacao', 'argumentativ', 'persuasao', 'publicidade', 'propaganda', 'anuncio']],
      ['Habilidades de leitura', 51, ['habilidades de leitura']],
      ['Gêneros textuais', 31, ['genero', 'generos textuais', 'tipologia', 'tipos textuais', 'cronica', 'charge', 'tirinha']],
      ['Tecnologias da informação e comunicação', 24, ['tecnologias da informacao', 'tecnologia', 'internet', 'redes sociais', 'digital', 'tic']],
      ['Literatura brasileira', 19, ['literatura', 'modernismo', 'romantismo', 'realismo', 'barroco', 'arcadismo', 'parnasianismo', 'simbolismo', 'escola literaria', 'poema', 'poesia']],
    ],
  },
  {
    area: 'linguagens', materia: 'Arte', total: 1280, porProva: 40,
    assuntos: [
      ['Arte contemporânea e contexto histórico-cultural', 8, ['arte contemporanea', 'contemporanea', 'historia da arte', 'vanguarda']],
      ['Culturas em tempos variados', 6, ['culturas', 'arte popular', 'manifestacoes culturais', 'folclore', 'arte indigena', 'arte africana']],
      ['Arte e comunicação', 4, ['arte e comunicacao', 'estetica']],
      ['Artes integradas', 3, ['artes integradas', 'teatro', 'danca', 'musica', 'cinema', 'performance']],
      ['Arte e identidade', 2, ['identidade']],
      ['Arte e resistência', 2, ['resistencia', 'grafite', 'arte urbana']],
      ['Arte e meio ambiente', 1, ['meio ambiente', 'sustentab']],
    ],
  },
  {
    area: 'linguagens', materia: 'Educação Física', total: 1280, porProva: 40,
    assuntos: [
      ['Jogos, brincadeiras e esporte', 3, ['jogo', 'brincadeira', 'esporte']],
      ['Corpo e cultura de movimento', 3, ['corpo', 'cultura corporal', 'movimento']],
      ['Saúde e atividade física', 3, ['atividade fisica', 'saude']],
      ['Fatores de risco à saúde', 2, ['sedentarismo', 'fatores de risco']],
      ['Promoção da saúde nas faixas etárias', 2, ['idoso', 'faixa etaria']],
      ['Esporte e mídia', 2, ['midia']],
      ['Luta como manifestação cultural', 2, ['luta', 'capoeira']],
      ['Esporte e espetáculo', 1, ['espetaculo']],
      ['Padrões de beleza corporal', 1, ['beleza', 'estereotipo', 'padrao corporal']],
      ['Alimentação, exercício e obesidade', 1, ['obesidade', 'alimentacao']],
      ['Esporte e inclusão social', 1, ['inclusao']],
    ],
  },
  {
    area: 'linguagens', materia: 'Inglês', total: 137, porProva: 5,
    assuntos: [
      ['Estruturas linguísticas e aspectos discursivos (inglês)', 58, ['estruturas', 'aspectos discursivos', 'gramatica']],
      ['Habilidades de leitura (inglês)', 33, ['leitura', 'interpretacao', 'compreensao']],
      ['Apreensão de sentido (inglês)', 20, ['sentido']],
      ['Sentidos globais e específicos (inglês)', 13, ['sentidos globais', 'especificos']],
      ['Dados verbais e não verbais (inglês)', 5, ['grafico', 'dados', 'nao verbal', 'infografico']],
      ['Vocabulário em contexto (inglês)', 5, ['vocabulario', 'palavra', 'cognato', 'false friend']],
    ],
  },
  {
    area: 'linguagens', materia: 'Espanhol', total: 120, porProva: 5,
    assuntos: [
      ['Apreensão de sentido (espanhol)', 55, ['sentido', 'interpretacao', 'compreensao', 'leitura']],
      ['Estruturas linguísticas e aspectos discursivos (espanhol)', 21, ['estruturas', 'aspectos discursivos', 'gramatica']],
      ['Habilidades de leitura (espanhol)', 18, ['habilidades']],
      ['Pontos de vista do autor (espanhol)', 7, ['ponto de vista', 'opiniao', 'autor']],
      ['Variedades linguísticas (espanhol)', 7, ['variedade', 'variacao']],
      ['Expressões idiomáticas (espanhol)', 5, ['expresion', 'expressao', 'idiomatic', 'frases hechas']],
      ['Vocabulário e falsos amigos (espanhol)', 1, ['vocabulo', 'vocabulario', 'heterosemantic', 'falsos amigos', 'falso amigo']],
    ],
  },
]

// Todos os assuntos, já com a média de questões por prova
export const ASSUNTOS = GRUPOS.flatMap((g) =>
  g.assuntos.map(([nome, frequencia, chaves]) => ({
    id: `${g.materia}|${nome}`,
    area: g.area,
    materia: g.materia,
    nome,
    frequencia,
    porProva: (frequencia * g.porProva) / g.total,
  }))
)
const CHAVES = Object.fromEntries(
  GRUPOS.flatMap((g) => g.assuntos.map(([nome, , chaves]) => [`${g.materia}|${nome}`, [nome, ...chaves].map(normalizar)]))
)

// A partir daqui um assunto "cai muito"; a partir daqui o aluno "erra muito"
export const CAI_MUITO = 0.75 // questões por prova (em média)
export const ERRA_MUITO = 2 // erros ainda não dominados (dominados contam 1/3)

export function normalizar(t) {
  return ` ${String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

// Palavra-chave precisa começar no início de uma palavra ("som" não casa com "isomeria")
const contem = (texto, chave) => texto.includes(' ' + chave.trim())

function materiaDoTexto(materia) {
  const m = normalizar(materia)
  if (contem(m, 'educacao fisica')) return 'Educação Física'
  const mapa = [
    ['ingl', 'Inglês'], ['espan', 'Espanhol'], ['portug', 'Português'], ['literat', 'Português'], ['gramat', 'Português'],
    ['arte', 'Arte'], ['fisica', 'Física'], ['quimic', 'Química'], ['biolog', 'Biologia'], ['matemat', 'Matemática'],
    ['histor', 'História'], ['geograf', 'Geografia'], ['filosof', 'Filosofia'], ['sociolog', 'Sociologia'],
  ]
  return mapa.find(([k]) => contem(m, k))?.[1] ?? null
}

// Encontra o assunto do Raio X que corresponde a um erro do caderno (ou null)
export function assuntoDoErro(erro) {
  const texto = normalizar(erro.assunto)
  if (texto.trim() === '') return null
  const materia = materiaDoTexto(erro.materia)
  let melhor = null
  let melhorPontos = 0
  for (const a of ASSUNTOS) {
    if (erro.area && a.area !== erro.area) continue
    if (materia && a.materia !== materia && !(materia === 'Português' && ['Arte', 'Educação Física'].includes(a.materia))) continue
    for (const chave of CHAVES[a.id]) {
      if (!contem(texto, chave)) continue
      const pontos = chave.length + (chave === texto ? 1000 : 0)
      if (pontos > melhorPontos) {
        melhor = a
        melhorPontos = pontos
      }
    }
  }
  return melhor
}

export const QUADRANTES = {
  maxima: { nome: 'Prioridade máxima', desc: 'Cai muito e você erra muito', icone: '🔴', cor: '#c92a2a' },
  atencao: { nome: 'Fique de olho', desc: 'Cai muito, você erra às vezes', icone: '🟠', cor: '#e8590c' },
  depois: { nome: 'Pode esperar', desc: 'Você erra, mas cai pouco', icone: '🟡', cor: '#e6a700' },
  fora: { nome: 'Fora do Raio X', desc: 'Não está entre os mais cobrados (ou o nome não foi reconhecido)', icone: '⚪', cor: '#868e96' },
}

// Cruza o caderno de erros com a incidência. Prioridade = questões por prova × peso dos erros.
export function analisarErros(erros) {
  const mapa = {}
  for (const e of erros) {
    const a = assuntoDoErro(e)
    const id = a ? a.id : `fora|${normalizar(e.assunto || e.materia).trim() || 'sem assunto'}`
    mapa[id] ??= a
      ? { ...a, abertos: 0, dominados: 0, exemplos: [] }
      : { id, area: e.area, materia: e.materia || '', nome: e.assunto || e.materia || 'Sem assunto', porProva: null, abertos: 0, dominados: 0, exemplos: [] }
    const item = mapa[id]
    if (e.dominado) item.dominados++
    else item.abertos++
    const rotulo = (e.assunto || '').trim()
    if (rotulo && !item.exemplos.includes(rotulo) && item.exemplos.length < 4) item.exemplos.push(rotulo)
  }
  const itens = Object.values(mapa).map((i) => {
    const peso = i.abertos + i.dominados / 3
    const quadrante = i.porProva == null
      ? 'fora'
      : i.porProva >= CAI_MUITO
        ? (peso >= ERRA_MUITO ? 'maxima' : 'atencao')
        : 'depois'
    return { ...i, peso, prioridade: i.porProva == null ? 0 : i.porProva * peso, quadrante }
  })
  const ordem = ['maxima', 'atencao', 'depois', 'fora']
  itens.sort((x, y) => ordem.indexOf(x.quadrante) - ordem.indexOf(y.quadrante) || y.prioridade - x.prioridade || y.peso - x.peso)

  // Assuntos que caem muito e não têm nenhum erro registrado (pode ser domínio ou falta de treino)
  const comErro = new Set(itens.map((i) => i.id))
  const semErro = ASSUNTOS.filter((a) => a.porProva >= CAI_MUITO && !comErro.has(a.id)).sort((x, y) => y.porProva - x.porProva)

  return { itens, semErro }
}

export function porProvaLegivel(n) {
  if (n == null) return '—'
  if (n >= 0.5) return `≈ ${n.toFixed(1).replace('.', ',')} por prova`
  return `≈ 1 a cada ${Math.round(1 / n)} provas`
}
