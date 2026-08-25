// ─── EL LOGO DEL LOCAL, EN PUNTOS DE IMPRESORA ───────────────────────────────
// Convierte una imagen a un mapa de bits de 1 bit por punto, listo para el
// comando `GS v 0`. Lo que se guarda en `configuracion.logo_bitmap` es el
// resultado de esto, no la imagen.
//
// ── POR QUÉ SE GUARDA EL MAPA DE BITS Y NO LA URL ───────────────────────────
// `configuracion.logo_url` existe desde hace meses y no lo lee nadie. No se
// cablea, se sustituye, por tres motivos:
//
//   * La caja trabaja SIN INTERNET. Una URL obliga a descargar, y una caja en
//     un local con la red caída imprimiría sin logo sin decir por qué. El fallo
//     de esta casa: no da error, da ausencia.
//   * La imagen se va a mover. El día que ese dominio muera, los tickets dejan
//     de llevar logo y nadie relaciona una cosa con la otra.
//   * Lo que se ve tiene que ser lo que sale. Convirtiendo al imprimir, la
//     pantalla enseña la imagen bonita y el papel saca otra cosa — la misma
//     regla que hace que `lib/Fiscal.js` sea la única calculadora.
//
// ── LA CONVERSIÓN SE HACE UNA VEZ, AQUÍ ─────────────────────────────────────
// El hub es tonto a propósito: recibe puntos y los manda. Si escalara o
// umbralizara, habría dos sitios decidiendo cómo se ve el logo y acabarían
// discrepando. Aquí se decide; allí sólo se comprueba que cuadre.
//
// ── EL FORMATO, QUE ES DONDE ESTÁN LAS TRAMPAS ──────────────────────────────
// Un bit por punto, 1 = negro, empaquetados de ocho en ocho con el bit MÁS
// significativo a la izquierda. El ancho SIEMPRE múltiplo de 8: una fila
// incompleta desplazaría todas las siguientes y el logo saldría escalonado.

/** Puntos que ocupa una columna de texto. Es constante en toda la familia. */
export const PUNTOS_POR_COLUMNA = 12;

/** Alto máximo, en puntos. El mismo tope que aplica el hub. */
export const ALTO_MAXIMO = 512;

/** Cuántos puntos de ancho tiene el papel de `cols` columnas. */
export function anchoDePapel(cols = 32) {
  return Math.max(0, Math.trunc(cols)) * PUNTOS_POR_COLUMNA;
}

/**
 * El ancho utilizable más cercano por debajo, en puntos y múltiplo de 8.
 *
 * Se redondea HACIA ABAJO siempre: un logo un punto más ancho que el papel no
 * se imprime «casi bien», se rechaza entero.
 */
export function anchoValido(puntos) {
  const n = Math.trunc(Number(puntos) || 0);
  return n <= 0 ? 0 : n - (n % 8);
}

/** Los bytes que exige un bitmap de este tamaño. La cuenta que lo decide todo. */
export function bytesEsperados(ancho, alto) {
  const a = Math.trunc(Number(ancho) || 0);
  const h = Math.trunc(Number(alto) || 0);
  if (a <= 0 || h <= 0 || a % 8 !== 0) return 0;
  return (a / 8) * h;
}

/**
 * RGBA → un punto por píxel: 1 negro, 0 blanco.
 *
 * ── LO TRANSPARENTE ES BLANCO, NO NEGRO ─────────────────────────────────────
 * Un PNG con fondo transparente tiene RGB (0,0,0) en todo lo que no se ve. Sin
 * mirar el alfa, un logo con fondo transparente sale como un rectángulo negro
 * sólido: gasta media tira de tinta térmica y tapa la marca. Pasa siempre, y
 * sólo se descubre en papel.
 *
 * @param {Uint8ClampedArray|number[]} rgba  4 bytes por píxel
 * @param {number} umbral  0-255; por debajo de esto, negro
 */
export function aMonocromo(rgba, { umbral = 160 } = {}) {
  const n = Math.floor(rgba.length / 4);
  const puntos = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    // Semitransparente cuenta como fondo: si no se ve en pantalla, no se
    // imprime.
    if (a < 128) {
      puntos[i] = 0;
      continue;
    }
    // Luminancia perceptual (Rec. 601). Con un promedio simple, el rojo de una
    // marca sale demasiado claro y el logo se imprime a trozos.
    const luz = 0.299 * r + 0.587 * g + 0.114 * b;
    puntos[i] = luz < umbral ? 1 : 0;
  }
  return puntos;
}

/**
 * Puntos (uno por píxel) → bytes, ocho puntos por byte, MSB a la izquierda.
 *
 * Si `ancho` no es múltiplo de 8 devuelve `null` en vez de rellenar: rellenar
 * en silencio produciría un bitmap que el hub aceptaría y que saldría
 * escalonado en el papel, y eso ya no se puede diagnosticar desde la caja.
 */
export function empaquetar(puntos, ancho, alto) {
  const a = Math.trunc(Number(ancho) || 0);
  const h = Math.trunc(Number(alto) || 0);
  if (a <= 0 || h <= 0 || a % 8 !== 0) return null;
  if (puntos.length < a * h) return null;

  const porFila = a / 8;
  const bytes = new Uint8Array(porFila * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < a; x++) {
      if (!puntos[y * a + x]) continue;
      const i = y * porFila + (x >> 3);
      bytes[i] |= 0x80 >> (x & 7);
    }
  }
  return bytes;
}

/** Bytes → base64, que es como viaja y como se guarda en la base. */
export function aBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // `btoa` existe en el navegador y en el WebView de la caja. En Node (las
  // pruebas) también, desde la v16.
  return btoa(s);
}

/**
 * ¿Este logo es imprimible?
 *
 * **Repite a propósito la comprobación que hace el hub en Rust.** No es
 * duplicación por descuido: son dos guardias en dos lados de la red, y el de
 * aquí existe para no llegar a guardar en la base un logo que la impresora
 * nunca podría imprimir. El de allí existe porque el hub no puede fiarse de que
 * quien le habla sea esta versión del front.
 */
export function logoValido(logo, cols = 32) {
  if (!logo || typeof logo.bitmap !== 'string' || !logo.bitmap.trim()) {
    return false;
  }
  const { ancho, alto } = logo;
  if (!Number.isInteger(ancho) || !Number.isInteger(alto)) return false;
  if (ancho <= 0 || alto <= 0) return false;
  if (ancho % 8 !== 0) return false;
  if (ancho > anchoDePapel(cols)) return false;
  if (alto > ALTO_MAXIMO) return false;
  // Longitud real de los bytes que representa ese base64, sin decodificarlo.
  const limpio = logo.bitmap.replace(/[\s=]/g, '');
  const bytes = Math.floor((limpio.length * 6) / 8);
  return bytes === bytesEsperados(ancho, alto);
}

/**
 * El tamaño al que hay que dibujar la imagen para que quepa en el papel.
 *
 * Mantiene la proporción y no agranda nunca: un logo de 40 puntos estirado a
 * 384 sale como una mancha con bordes de escalera. Si es pequeño, se imprime
 * pequeño.
 */
export function medidaDestino(anchoOriginal, altoOriginal, cols = 32) {
  const w0 = Math.trunc(Number(anchoOriginal) || 0);
  const h0 = Math.trunc(Number(altoOriginal) || 0);
  if (w0 <= 0 || h0 <= 0) return { ancho: 0, alto: 0 };

  const tope = anchoValido(anchoDePapel(cols));
  const ancho = anchoValido(Math.min(w0, tope));
  if (ancho <= 0) return { ancho: 0, alto: 0 };

  let alto = Math.max(1, Math.round((h0 * ancho) / w0));
  if (alto > ALTO_MAXIMO) alto = ALTO_MAXIMO;
  return { ancho, alto };
}

/**
 * Imagen → `{ bitmap, ancho, alto }` listo para guardar.
 *
 * Ésta es la única parte que toca el DOM, y por eso está aislada al final: todo
 * lo de arriba se puede probar sin navegador, y aquí sólo queda dibujar y leer
 * píxeles. Devuelve `null` si la imagen no se puede leer.
 *
 * @param {HTMLImageElement|ImageBitmap} imagen  ya cargada
 */
export function desdeImagen(imagen, { cols = 32, umbral = 160 } = {}) {
  const w0 = imagen?.naturalWidth || imagen?.width || 0;
  const h0 = imagen?.naturalHeight || imagen?.height || 0;
  const { ancho, alto } = medidaDestino(w0, h0, cols);
  if (!ancho || !alto) return null;

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return null;

  // Fondo blanco explícito: sin esto, un JPEG opaco va bien pero un PNG con
  // transparencia se mezcla con lo que hubiera en el lienzo.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(imagen, 0, 0, ancho, alto);

  const datos = ctx.getImageData(0, 0, ancho, alto).data;
  const bytes = empaquetar(aMonocromo(datos, { umbral }), ancho, alto);
  if (!bytes) return null;

  return { bitmap: aBase64(bytes), ancho, alto };
}

/**
 * Carga un archivo elegido en un `<input type="file">` y lo convierte.
 *
 * @returns {Promise<{bitmap:string, ancho:number, alto:number}|null>}
 */
export function desdeArchivo(archivo, opciones = {}) {
  return new Promise((resolver) => {
    if (!archivo) return resolver(null);
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const logo = desdeImagen(img, opciones);
      URL.revokeObjectURL(url);
      resolver(logo);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolver(null);
    };
    img.src = url;
  });
}

/**
 * El bitmap de vuelta a una imagen, para enseñarlo en pantalla.
 *
 * ── SE PREVISUALIZA EL BITMAP, NO EL ARCHIVO ORIGINAL ───────────────────────
 * Es la regla entera de este módulo aplicada a la pantalla: si la vista previa
 * enseñara el PNG que el dueño eligió, vería su logo con sus grises y sus
 * bordes suaves, y el papel sacaría otra cosa —blanco y negro puro, a 384
 * puntos—. Enseñar exactamente los puntos que se van a imprimir es lo que hace
 * que «se ve bien» signifique algo.
 *
 * @returns {string|null} dataURL PNG, o `null` si no se puede pintar.
 */
export function aVistaPrevia(logo, { escala = 1 } = {}) {
  if (!logoValido(logo, 64)) return null;
  const { ancho, alto } = logo;
  let bytes;
  try {
    bytes = Uint8Array.from(atob(logo.bitmap), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(ancho, alto);
  const porFila = ancho / 8;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const bit = (bytes[y * porFila + (x >> 3)] >> (7 - (x & 7))) & 1;
      const i = (y * ancho + x) * 4;
      const v = bit ? 0 : 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (escala === 1) return lienzo.toDataURL('image/png');

  const grande = document.createElement('canvas');
  grande.width = ancho * escala;
  grande.height = alto * escala;
  const gctx = grande.getContext('2d');
  if (!gctx) return lienzo.toDataURL('image/png');
  // Sin suavizado: los puntos tienen que verse como puntos, que es como salen.
  gctx.imageSmoothingEnabled = false;
  gctx.drawImage(lienzo, 0, 0, grande.width, grande.height);
  return grande.toDataURL('image/png');
}

/**
 * El logo que hay que meter en el documento, o `null`.
 *
 * Lo llama `lib/Comanda.js`. Que la validación viva aquí y no allí es
 * deliberado: `Comanda` decide qué se imprime, no si un bitmap cuadra.
 */
export function logoDeConfiguracion(configuracion, cols = 32) {
  const logo = {
    bitmap: configuracion?.logo_bitmap || '',
    ancho: Number(configuracion?.logo_ancho) || 0,
    alto: Number(configuracion?.logo_alto) || 0,
  };
  return logoValido(logo, cols) ? logo : null;
}
