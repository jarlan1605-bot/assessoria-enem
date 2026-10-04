// Envio de foto de perfil: recorta em quadrado, reduz para 400x400 e salva no Supabase
import { supabase } from './supabase'

const TAMANHO = 400
const PASTA = 'avatars'

async function carregarImagem(arquivo) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    } catch { /* tenta do jeito antigo abaixo */ }
  }
  return await new Promise((ok, falha) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => falha(new Error('Não foi possível abrir essa imagem. Tente uma foto em JPG ou PNG.'))
    img.src = URL.createObjectURL(arquivo)
  })
}

// Recorta o centro da imagem em quadrado e devolve um JPG pequeno
export async function prepararFoto(arquivo) {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.')
  const img = await carregarImagem(arquivo)
  const w = img.width
  const h = img.height
  const lado = Math.min(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = TAMANHO
  canvas.height = TAMANHO
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  // um pouco acima do centro, para fotos de rosto em pé
  const sy = h > w ? Math.max(0, (h - lado) * 0.3) : (h - lado) / 2
  ctx.drawImage(img, (w - lado) / 2, sy, lado, lado, 0, 0, TAMANHO, TAMANHO)
  return await new Promise((ok, falha) =>
    canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível preparar a foto.'))), 'image/jpeg', 0.86)
  )
}

async function apagarFotosAntigas(userId, manter) {
  const { data } = await supabase.storage.from(PASTA).list(userId)
  const antigas = (data ?? []).map((f) => `${userId}/${f.name}`).filter((c) => c !== manter)
  if (antigas.length) await supabase.storage.from(PASTA).remove(antigas)
}

// Envia a foto e grava o endereço no perfil. Devolve o endereço público.
export async function enviarFoto(userId, arquivo) {
  const blob = await prepararFoto(arquivo)
  const caminho = `${userId}/foto-${Date.now()}.jpg`
  const { error } = await supabase.storage
    .from(PASTA)
    .upload(caminho, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  if (error) throw new Error('Não foi possível enviar a foto: ' + error.message)

  const { data } = supabase.storage.from(PASTA).getPublicUrl(caminho)
  const { error: e2 } = await supabase.from('perfis').update({ foto_url: data.publicUrl }).eq('id', userId)
  if (e2) throw new Error('A foto subiu, mas não foi salva no perfil: ' + e2.message)

  apagarFotosAntigas(userId, caminho).catch(() => {})
  return data.publicUrl
}

export async function removerFoto(userId) {
  const { error } = await supabase.from('perfis').update({ foto_url: null }).eq('id', userId)
  if (error) throw new Error('Não foi possível remover a foto: ' + error.message)
  apagarFotosAntigas(userId, null).catch(() => {})
}
