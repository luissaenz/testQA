/**
 * run-logger.js
 *
 * Logging reutilizable para las corridas de suites. Captura TODA la salida del
 * proceso (stdout + stderr) a un archivo bajo `scripts/.suite-results/`, además
 * de seguir mostrándola en consola en vivo (patrón "tee").
 *
 * Se hace por intercepción de `process.stdout/err.write` (un solo punto) para
 * capturar todo sin tener que enhebrar la salida por cada función del runner:
 * queda el encabezado del runner, la salida de Cypress/Playwright y el resumen
 * final, todo junto.
 *
 * Uso:
 *   const { startRunLog } = require('./run-logger')
 *   const runLog = startRunLog({ suite: 'full', env: 'QA' })
 *   ... corre la suite ...
 *   runLog.stop()   // restaura stdout/err, cierra el archivo y poda logs viejos
 *   console.log(runLog.logPath)
 *
 * La carpeta `.suite-results/` está en .gitignore: los logs quedan solo locales.
 * Retención configurable con SUITE_LOG_KEEP (default 50; 0 = conservar todos).
 */

const fs = require('fs')
const path = require('path')

const LOG_DIR = path.resolve(__dirname, '.suite-results')
const DEFAULT_KEEP = 50

/** Timestamp ordenable y válido como nombre de archivo: YYYYMMDD-HHmmss. */
function fileTimestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  )
}

/** Quita códigos de color ANSI para que el .log sea texto plano legible. */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
}

/**
 * Conserva solo los `keep` logs más recientes en LOG_DIR (por fecha de
 * modificación) y borra el resto. Con keep <= 0 no poda nada.
 */
function pruneOldLogs(keep = DEFAULT_KEEP) {
  if (!keep || keep <= 0) return
  let entries
  try {
    entries = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.log'))
  } catch {
    return
  }
  const byRecent = entries
    .map((f) => {
      const full = path.join(LOG_DIR, f)
      try {
        return { full, mtime: fs.statSync(full).mtimeMs }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime)

  byRecent.slice(keep).forEach(({ full }) => {
    try {
      fs.unlinkSync(full)
    } catch {
      /* ignore */
    }
  })
}

function resolveKeep() {
  const raw = process.env.SUITE_LOG_KEEP
  if (raw === undefined || raw === '') return DEFAULT_KEEP
  const n = Number(raw)
  return Number.isFinite(n) ? n : DEFAULT_KEEP
}

/**
 * Empieza a "teear" la salida del proceso a un archivo de log.
 * @param {{ suite?: string, env?: string, keep?: number }} opts
 * @returns {{ logPath: string, stop: () => string }}
 */
function startRunLog({ suite = 'run', env = 'qa', keep = resolveKeep() } = {}) {
  fs.mkdirSync(LOG_DIR, { recursive: true })

  const name = `${suite}-${String(env).toLowerCase()}-${fileTimestamp()}.log`
  const logPath = path.join(LOG_DIR, name)
  const stream = fs.createWriteStream(logPath, { flags: 'a' })

  const originalStdout = process.stdout.write.bind(process.stdout)
  const originalStderr = process.stderr.write.bind(process.stderr)

  const tee = (original) =>
    function teed(chunk, ...args) {
      try {
        stream.write(stripAnsi(typeof chunk === 'string' ? chunk : chunk.toString()))
      } catch {
        /* si el stream falla, nunca rompemos la salida en consola */
      }
      return original(chunk, ...args)
    }

  process.stdout.write = tee(originalStdout)
  process.stderr.write = tee(originalStderr)

  stream.write(`# suite=${suite} env=${env} started=${new Date().toISOString()}\n\n`)

  let stopped = false
  return {
    logPath,
    stop() {
      if (stopped) return logPath
      stopped = true
      process.stdout.write = originalStdout
      process.stderr.write = originalStderr
      try {
        stream.end()
      } catch {
        /* ignore */
      }
      pruneOldLogs(keep)
      return logPath
    },
  }
}

module.exports = { startRunLog, pruneOldLogs, LOG_DIR }
