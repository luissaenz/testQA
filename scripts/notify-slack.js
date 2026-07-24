#!/usr/bin/env node
/**
 * notify-slack.js
 *
 * Envía notificación a Slack con el resultado de la última ejecución de tests.
 * Lee el archivo .last-run-result.json generado por run-suite.js.
 *
 * Requiere:
 *   SLACK_WEBHOOK_URL en variables de entorno o en .env
 *
 * Uso:
 *   node scripts/notify-slack.js
 *   node scripts/notify-slack.js --build-url=https://jenkins/job/123
 *   node scripts/notify-slack.js --branch=feature/mi-rama
 */

const https = require('https')
const fs    = require('fs')
const path  = require('path')

// Carga .env si existe (para ejecución local)
const envFile = path.resolve(process.cwd(), '.env')
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n')
  for (const line of lines) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length && !process.env[key]) {
      process.env[key] = rest.join('=').trim()
    }
  }
}

// ─── Config ──────────────────────────────────────────────────────────────────

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
if (!WEBHOOK_URL) {
  console.warn('⚠️  SLACK_WEBHOOK_URL no configurado. Notificación omitida.')
  process.exit(0)
}

// Argumentos opcionales
const args = process.argv.slice(2)
const flags = {}
for (const arg of args) {
  const [key, value] = arg.replace(/^--/, '').split('=')
  flags[key] = value ?? true
}

const BUILD_URL  = flags['build-url']  || process.env.BUILD_URL  || null
const BRANCH     = flags['branch']     || process.env.GIT_BRANCH || process.env.BRANCH_NAME || 'desconocida'
const BUILD_NUM  = flags['build']      || process.env.BUILD_NUMBER || '-'

// ─── Resultado ───────────────────────────────────────────────────────────────

const resultFile = path.resolve(process.cwd(), 'scripts/.last-run-result.json')
if (!fs.existsSync(resultFile)) {
  console.warn('⚠️  No se encontró .last-run-result.json. Ejecuta run-suite.js primero.')
  process.exit(0)
}

const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
const { suite, env, duration, allPassed, cypress, playwright, timestamp } = result

// ─── Construcción del mensaje ─────────────────────────────────────────────────

function formatFramework(name, data) {
  if (!data) return null
  if (data.skipped) return `${name}: — _(sin specs para esta suite)_`
  return `${name}: ${data.passed ? '✅ OK' : '❌ FALLÓ'}`
}

const icon    = allPassed ? '✅' : '❌'
const status  = allPassed ? 'PASARON' : 'FALLARON'
const color   = allPassed ? '#36a64f' : '#d73a49'

const frameworkLines = [
  formatFramework('Cypress', cypress),
  formatFramework('Playwright', playwright),
].filter(Boolean).join('\n')

const reportLine = BUILD_URL
  ? `\n📊 *Reporte:* <${BUILD_URL}/testReport|Ver en Jenkins>`
  : ''

const payload = {
  attachments: [
    {
      color,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${icon} QA Tests — ${suite.toUpperCase()} ${status}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Suite:*\n${suite}` },
            { type: 'mrkdwn', text: `*Entorno:*\n${env}` },
            { type: 'mrkdwn', text: `*Branch:*\n${BRANCH}` },
            { type: 'mrkdwn', text: `*Build:*\n#${BUILD_NUM}` },
            { type: 'mrkdwn', text: `*Duración:*\n${duration}s` },
            { type: 'mrkdwn', text: `*Fecha:*\n${new Date(timestamp).toLocaleString('es-ES')}` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Resultados por framework:*\n${frameworkLines}${reportLine}`,
          },
        },
      ],
    },
  ],
}

// Mensaje adicional en caso de fallo
if (!allPassed) {
  payload.attachments[0].blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `⚠️ Revisa los logs en Jenkins para ver el detalle de los fallos.${BUILD_URL ? `\n<${BUILD_URL}/console|Ver consola>` : ''}`,
    },
  })
}

// ─── Envío ────────────────────────────────────────────────────────────────────

const body = JSON.stringify(payload)
const url  = new URL(WEBHOOK_URL)

const options = {
  hostname: url.hostname,
  path:     url.pathname + url.search,
  method:   'POST',
  headers:  {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}

const req = https.request(options, (res) => {
  let data = ''
  res.on('data', chunk => { data += chunk })
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Notificación enviada a Slack.')
    } else {
      console.error(`❌ Error al enviar a Slack: ${res.statusCode} — ${data}`)
      process.exit(1)
    }
  })
})

req.on('error', (err) => {
  console.error(`❌ Error de conexión con Slack: ${err.message}`)
  process.exit(1)
})

req.write(body)
req.end()
