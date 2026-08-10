#!/usr/bin/env bash
#
# ver-papel.sh — enseña cómo va a salir un documento en la impresora térmica,
# sin impresora y sin gastar papel.
#
#   scripts/ver-papel.sh              # la pre-cuenta
#   scripts/ver-papel.sh ticket
#   scripts/ver-papel.sh copia        # el ticket como reimpresión
#   scripts/ver-papel.sh comanda
#   scripts/ver-papel.sh prueba
#
# ── QUÉ HACE, Y POR QUÉ ASÍ ─────────────────────────────────────────────────
# Junta los dos extremos del camino real:
#
#   Node   → `construirPreCuenta` / `construirTicket`, los constructores de
#            verdad de `src/lib/Comanda.js`. Deciden QUÉ se imprime.
#   Rust   → `previsualizar` de `src-tauri/src/hub/escpos.rs`, el renderizador
#            de verdad. Decide CÓMO se pinta, a 32 columnas.
#
# Esto NO es una simulación del formato: es el formato. Si mañana cambia
# `escpos.rs` o cambia un constructor, lo que sale por aquí cambia con ellos.
#
# La alternativa que había era mirar `TicketImpresion.jsx` en pantalla, y eso
# prueba OTRO renderizador —el de navegador—, así que no dice nada sobre el
# papel. Es exactamente la diferencia que hizo falta arreglar el 5-ago, cuando
# la vista previa descartaba `ESC a` y enseñaba todo pegado a la izquierda
# aunque en el papel saliera centrado.
#
# Necesita `cargo` y `node`. Ver `scripts/pruebas-rust.sh`.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORIGEN="$RAIZ/src-tauri/src/hub"
CAJON="${TMPDIR:-/tmp}/invventa-cajon-papel"
QUE="${1:-precuenta}"

command -v cargo >/dev/null 2>&1 || { echo "✖ falta 'cargo' en el PATH" >&2; exit 127; }
command -v node  >/dev/null 2>&1 || { echo "✖ falta 'node' en el PATH"  >&2; exit 127; }

# Mismo cajón de arena que las pruebas, más un binario que lee un documento por
# la entrada estándar. Se regenera siempre: así no puede quedarse mirando una
# copia vieja de `escpos.rs`, que sería la peor forma de fallar — enseñar un
# papel que ya no es el que sale.
rm -rf "$CAJON"
mkdir -p "$CAJON/src/hub" "$CAJON/src/bin"

cat > "$CAJON/Cargo.toml" <<'EOF'
[package]
name = "invventa_ver_papel"
version = "0.0.0"
edition = "2021"
publish = false

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
EOF

cat > "$CAJON/src/lib.rs" <<'EOF'
// GENERADO por scripts/ver-papel.sh — no editar.
pub mod hub {
    pub mod documento;
    pub mod escpos;
}
EOF

cat > "$CAJON/src/bin/ver.rs" <<'EOF'
// GENERADO por scripts/ver-papel.sh — no editar.
use invventa_ver_papel::hub::{documento::Documento, escpos::previsualizar};
use std::io::Read;

fn main() {
    let mut json = String::new();
    std::io::stdin().read_to_string(&mut json).expect("stdin");
    let doc: Documento = serde_json::from_str(&json).expect("documento inválido");
    print!("{}", previsualizar(&doc));
}
EOF

cp "$ORIGEN/documento.rs" "$ORIGEN/escpos.rs" "$CAJON/src/hub/"

# `vite-node` y no `node` a secas: los imports del proyecto van sin extensión
# (`./Fiscal`, no `./Fiscal.js`) porque los resuelve Vite. Node los rechaza.
#
# Podría bastar con añadir las extensiones, pero entonces este script estaría
# usando una resolución distinta de la que usa la app, y lo que se quiere ver
# aquí es exactamente lo que la app produce. `vite-node` ya viene con vitest, que
# es dependencia de desarrollo desde siempre.
DOC="$(cd "$RAIZ" && node_modules/.bin/vite-node "scripts/ver-papel.mjs" -- "$QUE")"

cd "$CAJON"
cargo build --bin ver --quiet 2>&1 | grep -v "^\s*$" || true

# La regla de 32 columnas, arriba y abajo: el papel mide eso y lo primero que se
# quiere ver es si algo se pasa.
REGLA="$(printf '%.0s─' $(seq 1 32))"
echo "┌$REGLA┐"
# El relleno se cuenta en CARACTERES, no en bytes: `printf '%-32s'` de bash mide
# bytes, y entonces cada acento —«Purísima», «Café», «Atendió»— descuadra el
# marco un carácter y parece un fallo de alineación del renderizador. Sería el
# mismo tipo de mentira que se acaba de quitar de la vista previa, sólo que en
# el visor.
printf '%s' "$DOC" | ./target/debug/ver |
  awk '{ n = length($0); pad = 32 - n; if (pad < 0) pad = 0
         printf "│%s%*s│\n", $0, pad, "" }'
echo "└$REGLA┘"
