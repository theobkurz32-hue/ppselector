"""Regression tests for baseline, accounting, calendar and legacy browser migration."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}),headless=True,args=['--no-sandbox'])
 context=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,accept_downloads=True)
 original=json.loads((ROOT/'data/project.json').read_text());original['resources'][0]['price']=123.45
 context.add_init_script('if(!localStorage.getItem("migration-seeded")){localStorage.setItem("riviera-project-v1",'+json.dumps(json.dumps(original))+');localStorage.setItem("migration-seeded","1")}')
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.goto('http://127.0.0.1:8000/');page.locator('#app').wait_for(state='visible')
 assert page.evaluate('project.version')==2
 assert page.evaluate('project.resources[0].price')==123.45
 assert page.evaluate('project.baseline.weights["01.01"]')==0
 assert page.evaluate('JSON.parse(localStorage.getItem("riviera-project-backup-v1")).version')==1
 page.locator('nav [data-view=orcamento]').click()
 page.locator('[data-budget-tab=expenses]').click();page.locator('#addExpense').click()
 form=page.locator('#expenseForm');form.locator('[name=name]').fill('Taxa de análise');form.locator('[name=serviceId]').select_option('01.02');form.locator('[name=amount]').fill('100.01');form.locator('[name=status]').select_option('paid')
 form.locator('[name=paidAt]').fill('2026-10-01');form.locator('button[type=submit]').click();expect(page.locator('#expenseDialog')).not_to_be_visible()
 assert '100,01' in page.locator('.finance-summary').inner_text()
 assert page.evaluate('project.expenses[0].amount')==10001
 page.reload();page.locator('#app').wait_for(state='visible')
 assert page.evaluate('project.expenses[0].amount')==10001
 page.locator('[data-budget-tab=expenses]').click();page.locator('[data-expense]').click() if page.locator('[data-expense]').is_visible() else None
 # Detail disclosure keeps editing controls out of the compact list.
 if not page.locator('#expenseDialog').is_visible():
  page.locator('.expense-row summary').click();page.locator('[data-expense]').click()
 form.locator('[name=amount]').fill('125.50');form.locator('button[type=submit]').click();expect(page.locator('#expenseDialog')).not_to_be_visible()
 assert page.evaluate('project.expenses[0].amount')==12550
 page.locator('[data-budget-tab=services]').click();page.locator('.baseline-panel > summary').click();page.locator('#approveBaseline').click()
 expect(page.locator('#toast')).to_contain_text('Linha-base aprovada')
 assert page.evaluate('project.baseline.approvedAt')
 # A changed price must not alter the measured physical percentage.
 assert page.evaluate('(()=>{project.tasks.find(t=>t.id==="08.01").progress=1;recalculate();const x=totals.progress;project.resources.find(r=>r.serviceId==="08.01"&&r.nature==="Material").price*=2;recalculate();return x===totals.progress})()')
 # Do not retain this synthetic assertion edit; reload the last persisted user state.
 page.reload();page.locator('#app').wait_for(state='visible')
 page.locator('nav [data-view=planejamento]').click();page.locator('.gantt').wait_for();page.locator('#search').fill('01.02');page.locator('.gantt-label').click()
 edit=page.locator('#editForm');edit.locator('[name=start]').fill('2026-11-07');edit.locator('[name=end]').fill('2026-11-08');edit.locator('[type=submit]').click()
 expect(page.locator('#editor')).to_be_visible();expect(page.locator('#toast')).to_contain_text('dia útil')
 page.locator('#cancelEditor').click()
 # Structured dependencies can be saved and explicitly rescheduled from the interface.
 page.locator('.gantt-label').click();edit.locator('[name=dependencies]').fill('01.01');edit.locator('[type=submit]').click()
 expect(page.locator('#editor')).not_to_be_visible()
 page.locator('#reschedule').click();expect(page.locator('#toast')).to_contain_text('Dependências replanejadas')
 assert page.evaluate('project.tasks.find(t=>t.id==="01.02").start')=='2026-11-09'
 page.locator('nav [data-view=orcamento]').click();page.locator('.settings-panel > summary').click()
 page.locator('#holidays').fill('2026-11-03');page.locator('#saveSettings').click()
 expect(page.locator('#toast')).to_contain_text('calendário atualizados')
 assert page.evaluate('project.calendar.holidays')==['2026-11-03']
 assert page.evaluate('project.baseline.calendar.holidays')==[]
 # Accessible dialog name and installable icons are part of the delivered interface.
 assert page.locator('#editor').get_attribute('aria-labelledby')=='editTitle'
 assert page.locator('link[rel=apple-touch-icon]').count()==1
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 page.screenshot(path='/tmp/riviera-v8-plan.png',full_page=True)
 b.close()
 print('PASS upgrade UI: legacy edits migrated with safety backup; stable reference; expense create/edit/persistence; baseline approval; price-independent physical progress; no-workday rejection; named dialogs; mobile width.')
