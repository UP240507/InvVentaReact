import { defineConfig } from 'vitest/config';

// ── DOS ENTORNOS, POR EXTENSIÓN ─────────────────────────────────────────────
// Hasta el 26-oct todo corría con jsdom, incluidos los ficheros de lógica que
// no tocan el DOM. jsdom se monta otra vez en cada fichero aislado, y con dos
// núcleos era casi un tercio del tiempo de la suite.
//
//   *.test.jsx → jsdom   (renderiza)
//   *.test.js  → node    (lógica)
//
// Un .test.js que sí necesite el navegador lo dice en su primera línea con
// `// @vitest-environment jsdom` y el porqué. Hoy son ocho.
//
// Cómo se eligieron, para no repetirlo a ojo: los 52 .test.js se corrieron con
// cobertura en jsdom y en node, fichero por fichero, y se compararon las
// sentencias y ramas ejecutadas. Cinco fallan en node; tres pasan pero recorren
// otro camino (el despachador de atajos no se instala, la sesión no persiste,
// lib/Hub no lee localStorage). Ésos son los peligrosos: una prueba que pasa
// por el camino equivocado no avisa. Los otros 44 ejecutan exactamente lo mismo
// en los dos entornos.
//
// Lo que la cobertura no ve es un VALOR que cambia sin ramificar. El caso
// conocido es `navigator.onLine`, que en node vale undefined y el código lee
// como «sin conexión». `src/test/setup.js` lo deja en true, como el navegador.
export default defineConfig({
  // Runtime JSX automático → no requiere `import React` en componentes ni tests.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    globals: true,
    css: false,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/store/**'],
      reporter: ['text', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'logica',
          environment: 'node',
          setupFiles: ['./src/test/setup.js'],
          include: ['src/**/*.{test,spec}.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'pantalla',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.js', './src/test/setup-dom.js'],
          include: ['src/**/*.{test,spec}.jsx'],
        },
      },
    ],
  },
});
