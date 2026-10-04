// Agrupa alunos por mentor: primeiro os seus, depois os de cada mentor, depois os sem mentor
export function gruposPorMentor(alunos, equipe, meuId) {
  const ordem = [...equipe].sort((a, b) => (a.id === meuId ? -1 : b.id === meuId ? 1 : (a.nome || '').localeCompare(b.nome || '')))
  const grupos = ordem.map((m) => ({
    id: m.id,
    rotulo: m.id === meuId ? 'Seus alunos' : `Alunos de ${m.nome || 'mentor'}`,
    alunos: alunos.filter((a) => a.mentor_id === m.id),
  }))
  const semMentor = alunos.filter((a) => !a.mentor_id || !equipe.some((m) => m.id === a.mentor_id))
  if (semMentor.length) grupos.push({ id: 'sem', rotulo: 'Sem mentor', alunos: semMentor })
  return grupos.filter((g) => g.alunos.length)
}
