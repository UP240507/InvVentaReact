#!/usr/bin/env bash
#
# pruebas-rust.sh — corre las pruebas del renderizador ESC/POS fuera de Windows.
#
# ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
# `cargo test` dentro de `src-tauri/` sólo funciona en Windows: el módulo de
# transporte usa la crate `windows` para hablar con la impresora. En Linux —o
# sea, en cualquier CI barato— el crate ni siquiera compila, así que las pruebas
# del renderizador quedaban inalcanzables y se tocaba `escpos.rs` a ciegas.
#
# Pero el renderizador NO necesita nada de Windows. `documento.rs` es serde puro
# y `escpos.rs` convierte una estructura en bytes. Lo único que los ataba al
# resto era vivir en el mismo crate.
#
# Así que este script arma un crate desechable con esos dos módulos y sólo esos,
# y les pasa `cargo test`. No copia nada al revés: el código sigue viviendo en
# `src-tauri/`, aquí sólo se monta un andamio para poder probarlo.
#
# ── POR QUÉ UN SCRIPT Y NO UNAS INSTRUCCIONES EN EL TRASPASO ────────────────
# Porque ya se hizo a mano dos veces (5-ago y 6-ago) y las dos se redescubrió el
# procedimiento desde cero. Un paso manual que se repite es un paso que alguien
# se saltará el día que tenga prisa — y saltárselo aquí significa cambiar el
# formato del ticket sin comprobarlo.
#
# ── USO ─────────────────────────────────────────────────────────────────────
#   scripts/pruebas-rust.sh            # corre las pruebas
#   scripts/pruebas-rust.sh --ver      # además enseña la salida completa
#
# Necesita `cargo` en el PATH. En Windows no hace falta: ahí `cargo test` dentro
# de `src-tauri/` funciona directamente y prueba TODO, incluido el transporte.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORIGEN="$RAIZ/src-tauri/src/hub"
CAJON="${TMPDIR:-/tmp}/invventa-cajon-rust"

VERBOSO=0
[[ "${1:-}" == "--ver" ]] && VERBOSO=1

if ! command -v cargo >/dev/null 2>&1; then
  echo "✖ No hay 'cargo' en el PATH." >&2
  echo "  Instálalo con rustup (https://rustup.rs) o, en Debian/Ubuntu," >&2
  echo "  con 'apt install cargo'. La versión de las distros vale: aquí" >&2
  echo "  no se usa nada moderno del lenguaje." >&2
  exit 127
fi

# Los módulos que se prueban. La lista es corta A PROPÓSITO: si algún día uno de
# ellos pasa a depender de `windows`, este script deja de compilar y eso es
# exactamente el aviso que se quiere — significaría que la lógica de formato se
# ató al sistema operativo.
#
# `respaldo` entra aquí por la misma razón: guarda bytes opacos en un archivo y
# no sabe qué es una venta, así que no toca Windows ni Supabase. Es además el
# módulo donde más importa poder probar sin la caja delante — es el camino del
# dinero y sus fallos son silenciosos.
#
# `dispositivos` entra el 18-ago, y por un motivo parecido: es serde y un mapa
# en un archivo, sin nada del sistema. Desde que existe «revocar todos», ahí
# vive una garantía que conviene poder comprobar en cada cambio y no sólo en
# Windows: **la caja no está en ese registro**, así que vaciarlo no puede
# dejarla sin administrar su propio hub.
MODULOS=(documento escpos respaldo dispositivos)

for m in "${MODULOS[@]}"; do
  if [[ ! -f "$ORIGEN/$m.rs" ]]; then
    echo "✖ No encuentro $ORIGEN/$m.rs" >&2
    exit 1
  fi
done

rm -rf "$CAJON"
mkdir -p "$CAJON/src/hub"

cat > "$CAJON/Cargo.toml" <<'EOF'
[package]
name = "invventa_cajon_rust"
version = "0.0.0"
edition = "2021"
publish = false

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
EOF

{
  echo "// GENERADO por scripts/pruebas-rust.sh — no editar."
  echo "// El código real vive en src-tauri/src/hub/."
  echo "pub mod hub {"
  for m in "${MODULOS[@]}"; do echo "    pub mod $m;"; done
  echo "}"
} > "$CAJON/src/lib.rs"

for m in "${MODULOS[@]}"; do
  cp "$ORIGEN/$m.rs" "$CAJON/src/hub/$m.rs"
done

echo "▸ Cajón en $CAJON"
echo "▸ Módulos: ${MODULOS[*]}"

cd "$CAJON"
if [[ $VERBOSO -eq 1 ]]; then
  cargo test
else
  # Sólo el resumen: la salida completa son 40 líneas de nombres de pruebas que
  # nadie lee cuando están todas en verde.
  cargo test 2>&1 | grep -E "^(error|warning: unused|test result:|running)" || {
    echo "✖ Fallaron las pruebas. Vuelve a correr con --ver para ver cuáles." >&2
    exit 1
  }
fi
