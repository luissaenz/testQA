#!/usr/bin/env node
/**
 * run-suite.js
 *
 * Runner unificado para ejecutar suites de tests en Cypress y/o Playwright.
 * Funciona igual en local y en Jenkins.
 *
 * Uso:
 *   node scripts/run-suite.js --suite=smoke --env=qa
 *   node scripts/run-suite.js --suite=transfers --env=sandbox --framework=cypress
 *   node scripts/run-suite.js --list
 *
 * Variables de entorno equivalentes (para Jenkins):
 *   SUITE=smoke ENV=qa node scripts/run-suite.js
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const { getSuite, listSuites } = require('./suite-config')
const { startRunLog } = require('./run-logger')

// ─── Parseo de argumentos ────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flags = {}
for (const arg of args) {
  const [key, value] = arg.replace(/^--/, '').split('=')
  flags[key] = value ?? true
}

if (flags.list) {
  listSuites()
  process.exit(0)
}

const SUITE     = flags.suite     || process.env.SUITE     || 'smoke'
const ENV       = (flags.env      || process.env.ENV       || 'qa').toUpperCase()
const FRAMEWORK = flags.framework || process.env.FRAMEWORK || 'all'  // cypress | playwright | all
const HEADED    = flags.headed    || process.env.HEADED    || false
// Navegador para Cypress. Por defecto NO se fuerza ninguno: Cypress usa Electron
// (bundled), el más confiable para `cypress run` headless y reproducible en Windows
// local y en el agente Linux de Jenkins. Se puede sobrescribir con --browser=chrome.
const BROWSER   = flags.browser   || process.env.BROWSER   || ''

// ─── Validaciones ────────────────────────────────────────────────────────────

let suite
try {
  suite = getSuite(SUITE)
} catch (e) {
  console.error(`\n❌ Error: ${e.message}\n`)
  listSuites()
  process.exit(1)
}

const validEnvs = ['QA', 'SANDBOX', 'DEV']
if (!validEnvs.includes(ENV)) {
  console.error(`\n❌ ENV inválido: "${ENV}". Usa: ${validEnvs.join(', ')}\n`)
  process.exit(1)
}

// ─── Resultado acumulado ─────────────────────────────────────────────────────

const results = {
  suite: SUITE,
  env: ENV,
  startTime: Date.now(),
  cypress: null,
  playwright: null,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`\n${'─'.repeat(60)}\n${msg}\n${'─'.repeat(60)}`)
}

function filterExistingFiles(patterns) {
  const globbed = []
  for (const pattern of patterns) {
    // Si el patrón tiene glob, lo dejamos pasar al runner
    if (pattern.includes('*')) {
      globbed.push(pattern)
      continue
    }
    // Si es archivo específico, verificamos que exista
    const fullPath = path.resolve(process.cwd(), pattern)
    if (fs.existsSync(fullPath)) {
      globbed.push(pattern)
    } else {
      console.warn(`  ⚠️  Spec no encontrado, omitiendo: ${pattern}`)
    }
  }
  return globbed
}

// ─── Entorno del proceso hijo ────────────────────────────────────────────────

/**
 * Construye el entorno para los procesos hijos (Cypress/Playwright).
 *
 * Elimina ELECTRON_RUN_AS_NODE: VS Code (que es Electron) inyecta esta variable
 * en las terminales integradas. Si está presente cuando Cypress lanza su binario
 * Electron (Cypress.exe), este arranca en modo "run as node" y crashea al instante
 * con STATUS_ILLEGAL_INSTRUCTION (exit 0xC000001D). Quitarla es inofensivo fuera
 * de VS Code (en CI/Jenkins no está seteada) y necesario dentro de VS Code.
 */
function buildChildEnv(extra = {}) {
  const env = { ...process.env, ...extra }
  delete env.ELECTRON_RUN_AS_NODE

  // IPv4 primero en la resolución DNS: en algunas redes locales el IPv6 hacia
  // Cloudflare está roto y cy.request()/fetch fallan con ETIMEDOUT 2606:4700::.
  // Inofensivo donde IPv6 funciona (solo cambia el orden de resolución).
  const dnsFlag = '--dns-result-order=ipv4first'
  env.NODE_OPTIONS = env.NODE_OPTIONS
    ? (env.NODE_OPTIONS.includes(dnsFlag) ? env.NODE_OPTIONS : `${env.NODE_OPTIONS} ${dnsFlag}`)
    : dnsFlag

  return env
}

/**
 * Ejecuta un comando mostrando la salida en vivo Y capturándola, para poder
 * inspeccionarla después (ej: detectar "No tests found").
 * @returns {Promise<{ status: number, output: string }>}
 */
function runCommand(cmd, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      shell: true,
      cwd: process.cwd(),
      env: buildChildEnv(extraEnv),
    })

    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
      process.stderr.write(chunk)
    })

    child.on('close', (status) => resolve({ status: status ?? 1, output }))
    child.on('error', () => resolve({ status: 1, output }))
  })
}

/**
 * Detecta si el runner del framework terminó sin ejecutar ningún test porque
 * el mecanismo de Execution-Control (tablas Execution-QA/DEV.md) excluyó todos
 * los specs de la suite para este entorno. Eso NO es un fallo: la suite
 * simplemente no aplica al entorno actual.
 */
function allSpecsExcluded(output) {
  return (
    /no spec files were found/i.test(output) ||   // Cypress
    /No tests found/i.test(output)                 // Playwright
  )
}

// ─── Cypress ─────────────────────────────────────────────────────────────────

async function runCypress() {
  const specs = filterExistingFiles(suite.cypress)

  if (specs.length === 0) {
    console.log('  ℹ️  No hay specs de Cypress para esta suite.')
    return { skipped: true, passed: 0, failed: 0, total: 0 }
  }

  const specPattern = specs.join(',')
  const headedFlag  = HEADED ? '--headed' : ''
  // Solo pasa --browser si el usuario lo pidió explícitamente (--browser=chrome).
  // Sin esto, Cypress usa Electron headless (default, bundled).
  const browserFlag = BROWSER ? `--browser ${BROWSER}` : ''

  const cmd = [
    'npx cypress run',
    `--spec "${specPattern}"`,
    `--env ENV=${ENV}`,
    browserFlag,
    headedFlag,
    '--config video=false',
  ].filter(Boolean).join(' ')

  log(`🌲 Cypress — suite: ${SUITE} | env: ${ENV}`)
  console.log(`Specs: ${specs.length}`)
  specs.forEach(s => console.log(`  • ${s}`))
  console.log(`\nComando: ${cmd}\n`)

  // ENV se pasa por la opción `env` (no como prefijo shell) para que funcione
  // igual en cmd.exe (Windows) y en bash (Linux/CI).
  const result = await runCommand(cmd, { ENV })

  if (result.status !== 0 && allSpecsExcluded(result.output)) {
    console.log('\n  ℹ️  Todos los specs de Cypress de esta suite están excluidos por Execution-Control en este entorno.')
    return { skipped: true, excludedByControl: true }
  }

  return {
    skipped: false,
    exitCode: result.status,
    passed: result.status === 0,
  }
}

// ─── Playwright ──────────────────────────────────────────────────────────────

async function runPlaywright() {
  const specs = filterExistingFiles(suite.playwright)

  if (specs.length === 0) {
    console.log('  ℹ️  No hay specs de Playwright para esta suite.')
    return { skipped: true, passed: 0, failed: 0, total: 0 }
  }

  const headedFlag = HEADED ? '--headed' : ''

  // Playwright NO acepta globs como argumento posicional: los interpreta como
  // regex y un patrón con `**` rompe con "Invalid regular expression: Nothing
  // to repeat" (le pasaba a la suite `full`). Los specs con glob se omiten del
  // filtro: sin argumento, Playwright corre TODOS los specs de su `testDir`
  // (respetando `testIgnore`), que es justo lo que `full` necesita. Los specs
  // explícitos (resto de suites) se pasan tal cual.
  const explicitSpecs = specs.filter(s => !/[*?[\]]/.test(s))
  const usesGlob = explicitSpecs.length !== specs.length
  const specArgs = explicitSpecs.join(' ')

  const cmd = [
    'npx playwright test',
    specArgs,
    '--reporter=html,list',
    headedFlag,
  ].filter(Boolean).join(' ')

  log(`🎭 Playwright — suite: ${SUITE} | env: ${ENV}`)
  if (usesGlob && explicitSpecs.length === 0) {
    console.log('Specs: todos los del testDir de Playwright (sin filtro; se respeta testIgnore)')
  } else {
    console.log(`Specs: ${explicitSpecs.length}`)
    explicitSpecs.forEach(s => console.log(`  • ${s}`))
  }
  console.log(`\nComando: ${cmd}\n`)

  // ENV se pasa por la opción `env` (no como prefijo shell) para que funcione
  // igual en cmd.exe (Windows) y en bash (Linux/CI).
  const result = await runCommand(cmd, { ENV })

  if (result.status !== 0 && allSpecsExcluded(result.output)) {
    console.log('\n  ℹ️  Todos los specs de Playwright de esta suite están excluidos por Execution-Control en este entorno.')
    return { skipped: true, excludedByControl: true }
  }

  return {
    skipped: false,
    exitCode: result.status,
    passed: result.status === 0,
  }
}

// ─── Ejecución ───────────────────────────────────────────────────────────────

async function main() {
  // Tee de toda la salida a scripts/.suite-results/<suite>-<env>-<fecha>.log
  // (gitignorado). Se cierra sí o sí en el finally, aunque algo falle.
  const runLog = startRunLog({ suite: SUITE, env: ENV })

  try {
    return await runSuite()
  } finally {
    console.log(`\n📄 Log de la corrida: ${path.relative(process.cwd(), runLog.logPath)}`)
    runLog.stop()
  }
}

async function runSuite() {
  log(`🚀 Iniciando suite: "${SUITE}" en entorno: ${ENV}`)
  console.log(`Descripción: ${suite.description}`)
  console.log(`Framework(s): ${FRAMEWORK}`)

  if (FRAMEWORK === 'all' || FRAMEWORK === 'cypress') {
    results.cypress = await runCypress()
  }

  if (FRAMEWORK === 'all' || FRAMEWORK === 'playwright') {
    results.playwright = await runPlaywright()
  }

  // ─── Resumen final ───────────────────────────────────────────────────────

  const duration = Math.round((Date.now() - results.startTime) / 1000)
  const cyOk = !results.cypress  || results.cypress.skipped  || results.cypress.passed
  const pwOk = !results.playwright || results.playwright.skipped || results.playwright.passed
  const allPassed = cyOk && pwOk

  log(allPassed ? '✅ TODOS LOS TESTS PASARON' : '❌ HUBO FALLOS')

  console.log(`Suite:     ${SUITE}`)
  console.log(`Entorno:   ${ENV}`)
  console.log(`Duración:  ${duration}s`)

  const frameworkStatus = (r) => {
    if (r.skipped) {
      return r.excludedByControl
        ? '— (excluido por Execution-Control en este entorno)'
        : '— (sin specs)'
    }
    return r.passed ? '✅ OK' : '❌ FALLÓ'
  }

  if (results.cypress)    console.log(`Cypress:   ${frameworkStatus(results.cypress)}`)
  if (results.playwright) console.log(`Playwright: ${frameworkStatus(results.playwright)}`)

  // Guardar resultado en JSON para que notify-slack.js lo lea
  const resultFile = path.resolve(process.cwd(), 'scripts/.last-run-result.json')
  fs.writeFileSync(resultFile, JSON.stringify({
    suite: SUITE,
    env: ENV,
    duration,
    allPassed,
    cypress: results.cypress,
    playwright: results.playwright,
    timestamp: new Date().toISOString(),
  }, null, 2))

  return allPassed
}

main()
  .then((allPassed) => process.exit(allPassed ? 0 : 1))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
