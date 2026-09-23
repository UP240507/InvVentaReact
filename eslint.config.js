import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // `dist` no es la unica carpeta generada. `dev-dist` la escribe el plugin de
  // PWA al correr `npm run dev`, y `src-tauri/target` la escribe cargo — y
  // dentro lleva una COPIA del bundle en `_up_/dist/`, para empaquetar la caja.
  //
  // Sin ignorarlas, `npm run lint` da resultados distintos en cada maquina:
  // limpia da 13 errores y una donde ya se compilo da mas de mil cuatrocientos,
  // todos de JavaScript minificado que nadie escribio. Un lint cuyo numero
  // depende de si compilaste antes no sirve para decidir nada, y el ruido tapa
  // los errores de verdad.
  globalIgnores(['dist', 'dev-dist', 'src-tauri/target']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // `const { estado, ...resto } = c` NO es una variable olvidada: es la
      // forma de QUITAR una clave de un objeto, y se usa en el store, en el
      // KDS y en clientes. Sin esta opcion el lint marcaba como basura el
      // codigo mejor escrito del repo, y la unica forma de callarlo era
      // romperlo. `ignoreRestSiblings` existe justo para esto.
      //
      // `_` delante significa "ya se que no lo uso, lo pide la firma".
      'no-unused-vars': [
        'error',
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
]);
