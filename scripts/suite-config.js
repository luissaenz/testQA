/**
 * suite-config.js
 *
 * Mapeo de suites de tests a patrones de archivos para Cypress y Playwright.
 * Agrega aquí nuevas suites o ajusta los patrones cuando se agreguen specs.
 *
 * SUITES disponibles:
 *   smoke          → Login + Home (rápido, post-deploy inmediato)
 *   beneficiaries  → Crear/eliminar beneficiarios (banco, TropiPay, crypto)
 *   transfers      → Transferencias internas, externas y crypto
 *   paylinks       → Crear paylinkss y cobros por QR
 *   payments       → Pagar paylinkss (Playwright únicamente por ahora)
 *   deposit        → Cargar dinero con tarjeta
 *   security       → Configuración de seguridad (Cypress únicamente)
 *   register       → Registro de usuarios y empresas
 *   full           → Todos los tests
 */

const CYPRESS_BASE = 'cypress/e2e/POM-V2/Specs'
const PLAYWRIGHT_BASE = 'playwright/e2e/POM-V2/Specs'

const SUITES = {
  smoke: {
    description: 'Login y Home — verificación rápida post-deploy',
    cypress: [
      `${CYPRESS_BASE}/TropiPay/01.Navigation/Login.cy.js`,
      `${CYPRESS_BASE}/TropiPay/01.Navigation/Home.cy.js`,
      `${CYPRESS_BASE}/Business/01.Navigation/Login.cy.js`,
    ],
    playwright: [
      `${PLAYWRIGHT_BASE}/TropiPay/01.Navigation/Login.spec.ts`,
      `${PLAYWRIGHT_BASE}/Business/01.Navigation/Login.spec.ts`,
    ],
  },

  beneficiaries: {
    description: 'Crear y eliminar beneficiarios bancarios, TropiPay y crypto',
    cypress: [
      `${CYPRESS_BASE}/TropiPay/02.CRUD/BeneficiariesBank.cy.js`,
      `${CYPRESS_BASE}/TropiPay/02.CRUD/BeneficiariesTropiPay.cy.js`,
      `${CYPRESS_BASE}/TropiPay/02.CRUD/BeneficiariesCripto.cy.js`,
    ],
    playwright: [
      `${PLAYWRIGHT_BASE}/Business/02.CRUD/BeneficiariesBank.spec.ts`,
    ],
  },

  transfers: {
    description: 'Transferencias internas (TropiPay), externas (banco) y crypto',
    cypress: [
      `${CYPRESS_BASE}/TropiPay/04.Send/TransferBank.cy.js`,
      `${CYPRESS_BASE}/TropiPay/04.Send/TransferTropiPay.cy.js`,
      `${CYPRESS_BASE}/TropiPay/04.Send/TransferCriptoDepasify.cy.js`,
      `${CYPRESS_BASE}/TropiPay/04.Send/TransferCriptoRevo.cy.js`,
    ],
    playwright: [],
  },

  paylinks: {
    description: 'Crear paylinkss y códigos QR para cobros',
    cypress: [
      `${CYPRESS_BASE}/TropiPay/05.Receive/PaylinkDepasify.cy.js`,
      `${CYPRESS_BASE}/TropiPay/05.Receive/PaylinkRevo.cy.js`,
      `${CYPRESS_BASE}/TropiPay/05.Receive/MyQRDepasify.cy.js`,
      `${CYPRESS_BASE}/TropiPay/05.Receive/MyQRRevo.cy.js`,
      `${CYPRESS_BASE}/TropiPay/05.Receive/QRCodeDepasify.cy.js`,
      `${CYPRESS_BASE}/TropiPay/05.Receive/QRCodeRevo.cy.js`,
    ],
    playwright: [
      `${PLAYWRIGHT_BASE}/TropiPay/05.Receive/PaylinkDepasify.spec.ts`,
      `${PLAYWRIGHT_BASE}/TropiPay/05.Receive/PaylinkRevo.spec.ts`,
    ],
  },

  payments: {
    description: 'Pagar paylinkss con tarjeta (Playwright)',
    cypress: [],
    playwright: [
      `${PLAYWRIGHT_BASE}/TropiPay/06.Payments/PaylinkPaymentsDepasify.spec.ts`,
      `${PLAYWRIGHT_BASE}/TropiPay/06.Payments/PaylinkPaymentsRevo.spec.ts`,
      `${PLAYWRIGHT_BASE}/TropiPay/06.Payments/PaylinkPaymentUnlogged.spec.ts`,
    ],
  },

  deposit: {
    description: 'Cargar dinero con tarjeta (EUR y USDC)',
    cypress: [
      `${CYPRESS_BASE}/TropiPay/03.Deposit/ChargeUserCardsEUR.cy.js`,
      `${CYPRESS_BASE}/TropiPay/03.Deposit/ChargeUserCardsUSDCDepasify.cy.js`,
      `${CYPRESS_BASE}/TropiPay/03.Deposit/ChargeUserCardsUSDCRevo.cy.js`,
      `${CYPRESS_BASE}/Business/03.Deposit/ChargeUserCardsEUR.cy.js`,
      `${CYPRESS_BASE}/Business/03.Deposit/ChargeUserCardsUSDC.cy.js`,
    ],
    playwright: [
      `${PLAYWRIGHT_BASE}/Business/03.Deposit/ChargeUserCardsEUR.spec.ts`,
      `${PLAYWRIGHT_BASE}/Business/03.Deposit/ChargeUserCardsUSDC.spec.ts`,
    ],
  },

  security: {
    description: 'Configuración de seguridad (Cypress únicamente)',
    cypress: [
      `${CYPRESS_BASE}/TropiPay/09.Security/Security.cy.js`,
    ],
    playwright: [],
  },

  register: {
    description: 'Registro de usuarios comunes y empresas',
    cypress: [
      `${CYPRESS_BASE}/TropiPay/02.CRUD/RegisterCommonUser.cy.js`,
      `${CYPRESS_BASE}/TropiPay/02.CRUD/RegisterCompany.cy.js`,
    ],
    playwright: [
      `${PLAYWRIGHT_BASE}/TropiPay/02.CRUD/RegisterCompany.spec.ts`,
    ],
  },

  full: {
    description: 'Todos los tests de TropiPay y Business',
    cypress: [
      `${CYPRESS_BASE}/**/*.cy.js`,
    ],
    playwright: [
      `${PLAYWRIGHT_BASE}/**/*.spec.ts`,
    ],
  },
}

/**
 * Retorna la configuración de una suite.
 * @param {string} suiteName
 * @returns {{ description: string, cypress: string[], playwright: string[] }}
 */
function getSuite(suiteName) {
  const suite = SUITES[suiteName]
  if (!suite) {
    const available = Object.keys(SUITES).join(', ')
    throw new Error(`Suite "${suiteName}" no existe. Disponibles: ${available}`)
  }
  return suite
}

/**
 * Lista todas las suites disponibles con su descripción.
 */
function listSuites() {
  console.log('\nSuites disponibles:\n')
  for (const [name, config] of Object.entries(SUITES)) {
    const cyCount = config.cypress.length
    const pwCount = config.playwright.length
    console.log(`  ${name.padEnd(16)} — ${config.description}`)
    console.log(`                   Cypress: ${cyCount} spec(s) | Playwright: ${pwCount} spec(s)\n`)
  }
}

module.exports = { SUITES, getSuite, listSuites }
