import { chromium } from 'playwright'
import { serveRoot, closeServer, demoUrl } from './tools/serve.ts'
const [slug, group, t = '3'] = process.argv.slice(2)
const server = await serveRoot()
const b = await chromium.launch({ args:['--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport:{width:1280,height:720}, deviceScaleFactor:1 })
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())})
await p.goto(demoUrl(`${group}/${slug}`))
await p.waitForTimeout(600)
await p.evaluate(time => window.__beamish?.renderAtTime?.(time), Number(t))
await p.waitForTimeout(250)
await p.screenshot({ path: process.env.OUT || `preview-${slug}.png` })
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0,4).join('\n') : 'ok, no errors')
await b.close(); await closeServer(server)
