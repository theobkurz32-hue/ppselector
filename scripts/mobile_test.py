"""Touch and compact-layout checks. Start the HTTP server on port 8000 first."""
from playwright.sync_api import sync_playwright, expect
from pathlib import Path

def check(browser,width,name):
    context=browser.new_context(viewport={'width':width,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8000/');page.locator('#app').wait_for(state='visible')
    assert page.locator('body').evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(9, 9, 9)'
    assert not page.locator('.heading-actions').is_visible()
    assert page.locator('#overviewIntro').is_visible()
    assert page.locator('#overviewIntro a').count()==4
    assert 'Seja bem-vindo ao dashboard da sua obra!' in page.locator('#overviewIntro').inner_text()
    boxes=page.locator('.metric').evaluate_all('(els)=>els.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))')
    assert max(b['height'] for b in boxes)-min(b['height'] for b in boxes)<1
    assert max(b['width'] for b in boxes)-min(b['width'] for b in boxes)<1
    assert not page.locator('a[href*="xlsx"]').count()
    page.locator('#curveRange').fill('26');assert '2027' in page.locator('#curveWeek').inner_text()
    page.locator('[data-month="2027-03"]').tap();assert 'março' in page.locator('#monthReadout').inner_text()
    if width==390:page.screenshot(path=f'/tmp/riviera-dark-{name}-mobile.png',full_page=True)
    for section in ['orcamento','quantitativos','planejamento','premissas','resumo']:
        page.locator(f'nav [data-view="{section}"]').tap()
        expect(page.locator(f'nav [data-view="{section}"]')).to_have_attribute('aria-current','page')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(name,width,section)
        assert page.evaluate('scrollY')==0
        if section in ['orcamento','quantitativos']:
            expect(page.locator('.phase-group')).to_have_count(19)
            assert page.locator('.phase-group[open]').count()==0
            assert not page.locator('.compact-row > summary').first.is_visible()
            page.locator('.phase-heading').first.tap()
            assert page.locator('.compact-row > summary').first.is_visible()
            page.locator('.phase-heading').first.tap()
            assert not page.locator('.compact-row > summary').first.is_visible()
            page.locator('.phase-heading').first.tap()
            row=page.locator('.compact-row > summary').first
            assert row.bounding_box()['height']<=54
            page.locator('#search').fill('01.02');expect(page.locator('.compact-row')).to_have_count(1)
            assert page.locator('.phase-group[open]').count()==0
            assert not page.locator('.compact-row > summary').is_visible()
            page.locator('.phase-heading .chevron').first.tap()
            page.locator('.compact-row > summary').tap();assert page.locator('.row-detail').is_visible()
            if section=='orcamento':
                assert 'Terceiros' in page.locator('.row-detail').inner_text()
                if width==390:page.screenshot(path='/tmp/riviera-dark-budget-mobile.png',full_page=True)
            else:
                page.locator('[data-resource]').tap();page.locator('[name="price"]').fill('125')
                assert page.locator('[name="price"]').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=16
                page.get_by_role('button',name='Salvar alterações').tap()
                assert page.locator('.phase-group[open]').count()==0
                page.locator('.phase-heading .chevron').first.tap()
                assert '125,00' in page.locator('.compact-row > summary').inner_text()
        if section=='planejamento':
            expect(page.locator('.gantt-row')).to_have_count(183)
            if width==390:page.screenshot(path='/tmp/riviera-dark-gantt-mobile.png',full_page=True)
            # The timeline scrolls inside its own viewport, never the document.
            page.locator('.gantt-scroll').evaluate('(e)=>e.scrollLeft=300')
            assert page.locator('.gantt-scroll').evaluate('(e)=>e.scrollLeft')>0
            page.locator('#ganttZoom').select_option('week')
            page.locator('#search').fill('01.02');expect(page.locator('.gantt-bar')).to_have_count(1)
            page.locator('.gantt-bar').tap();page.locator('[name="progress"]').fill('50')
            page.get_by_role('button',name='Salvar alterações').tap()
            page.locator('[data-mode="list"]').tap();expect(page.locator('.task-row')).to_have_count(1)
            assert page.locator('.task-row > summary').bounding_box()['height']<=54
            page.locator('.task-row > summary').tap();assert 'Em andamento' in page.locator('.task-row').inner_text()
    page.locator('nav [data-view="orcamento"]').tap()
    expect(page.locator('.phase-group')).to_have_count(19)
    assert page.locator('.phase-group[open]').count()==0
    assert not page.locator('.compact-row > summary').first.is_visible()
    assert not errors,errors
    context.close();print(f'PASS {name} {width}px: dark theme, dashboard, intro links, touch charts, explicit phase expansion even after filtering; equal indicator dimensions, thin rows, expand details, resource editing, Gantt scroll/zoom, task progress, no page overflow/errors.')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in [375,390,430]:check(browser,width,'chromium')
    browser.close()
    if Path(p.webkit.executable_path).exists():
        browser=p.webkit.launch(headless=True);check(browser,390,'webkit');browser.close()
    else:print('WebKit NOT RUN: runtime unavailable; physical iPhone validation remains outstanding.')
