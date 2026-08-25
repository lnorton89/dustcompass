import { chromium } from 'playwright'
const browser = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const context = await browser.newContext({ viewport:{width:390,height:844}, geolocation:{latitude:45.99,longitude:-122.84}, permissions:['geolocation'] })
const page = await context.newPage()
const failures=[]
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
async function test(name, fn){try{await fn();console.log(`PASS: ${name}`)}catch(e){failures.push(`${name}: ${e.message}`);console.error(`HUMAN_E2E_FAILURE: ${name}: ${e.message}`);await page.screenshot({path:`human-v3-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40)}.png`,fullPage:true}).catch(()=>{})}}
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)}
await page.goto('https://lnorton89.github.io/dustcompass/',{waitUntil:'load'})
await page.getByRole('heading',{name:'Before you set off'}).waitFor({timeout:15000})
await page.getByRole('button',{name:/Show me the map/i}).click()
await page.locator('canvas').first().waitFor({timeout:30000}); await sleep(1200)
const embargo=page.getByText(/Art locations are embargoed until Gates open\./)
if(await embargo.count()){await embargo.locator('xpath=..').getByRole('button',{name:'Dismiss'}).click();await sleep(250)}
const layers=()=>page.getByRole('button',{name:/Filters and saved spots/i})
const events=()=>page.getByRole('button',{name:/Show events/i})

await test('search-save-reload',async()=>{
  const search=page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
  await search.fill('7:30 & Esplanade');await sleep(700)
  const options=await page.getByRole('option').allInnerTexts()
  assert(options.some(t=>/Esplanade.*7:30|7:30.*Esplanade/.test(t)),`no address option; options=${options.join(' | ')}`)
  await page.getByRole('option').filter({hasText:/Esplanade.*7:30|7:30.*Esplanade/}).first().click();await sleep(500)
  const save=page.getByRole('button',{name:/^Save$/});assert(await save.count()>0,'address selection did not expose Save')
  await save.last().click();await page.getByRole('dialog').getByText('My camp',{exact:true}).click();await sleep(350)
  await page.reload({waitUntil:'load'});await page.locator('canvas').first().waitFor({timeout:30000});await sleep(900)
  await layers().click();await page.getByText('Saved spots',{exact:true}).waitFor();const text=await page.locator('.MuiDrawer-paper').innerText();assert(text.includes('My camp'),'saved camp missing after reload');await page.getByRole('button',{name:/Close filters/i}).click()
})

await test('opening-day-preview',async()=>{
  await events().click();await page.getByRole('heading',{name:'Events'}).waitFor();const today=page.getByRole('button',{name:'Today',exact:true});assert((await today.getAttribute('aria-pressed'))==='true','Today not selected');const rows=page.locator('.MuiDrawer-paper .MuiListItemButton-root');await rows.first().waitFor({timeout:10000});assert(await rows.count()>20,`only ${await rows.count()} rows`);const text=await page.locator('.MuiDrawer-paper').innerText();assert(/Sun|Aug 30/i.test(text),'opening Sunday not represented');await page.getByRole('button',{name:/Close events/i}).click()
})

await test('nearest-outside-city',async()=>{
  await layers().click();await page.getByText('Nearest toilet',{exact:true}).click();await page.getByText(/too far from Black Rock City|outside Black Rock City|near Black Rock City/i).waitFor({timeout:12000})
})

await test('ambiguous-open-playa-prose',async()=>{
  const search=page.getByPlaceholder(/Camp, art, or an address|Search the playa/);await search.fill('7:30 2000 feet near the Temple');await sleep(800);const options=await page.getByRole('option').allInnerTexts();assert(!options.some(t=>/7:30.*2000/i.test(t)),`ambiguous address offered: ${options.join(' | ')}`)
})
await browser.close();console.log('--- HUMAN E2E FAILURES ---');failures.forEach(f=>console.log(`- ${f}`));if(failures.length)process.exit(1)
