"""Mobile interaction checks. Requires a local server on port 8000."""
from playwright.sync_api import sync_playwright, expect
from pathlib import Path

def check(browser, width, name):
    context = browser.new_context(viewport={'width': width, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8000/')
    page.locator('#app').wait_for(state='visible')
    assert not page.locator('a[href="cabos.html"]').count()
    assert 'Georgia' not in page.locator('h1').evaluate('(el)=>getComputedStyle(el).fontFamily')
    assert page.locator('nav').evaluate('(el)=>getComputedStyle(el).position') == 'fixed'
    page.locator('#curveRange').fill('26')
    assert '2027' in page.locator('#curveWeek').inner_text()
    assert page.locator('#curveFinancial').inner_text() != '0%'
    page.locator('[data-month="2027-03"]').tap()
    assert 'março' in page.locator('#monthReadout').inner_text()
    assert page.locator('[data-month="2027-03"]').get_attribute('aria-pressed') == 'true'
    for section in ['orcamento', 'quantitativos', 'planejamento', 'premissas', 'resumo']:
        page.locator(f'nav [data-view="{section}"]').tap()
        expect(page.locator(f'nav [data-view="{section}"]')).to_have_attribute('aria-current', 'page')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (name, section)
        assert page.evaluate('scrollY') == 0
        if section in ['orcamento','quantitativos','planejamento']:
            assert page.locator('.responsive-table').count() == 1
            page.locator('#search').fill('01.02')
            expect(page.locator('#tableBody tr:not(.phase-summary)')).to_have_count(1)
        if section == 'quantitativos':
            page.locator('[data-resource]').tap()
            expect(page.locator('#editor')).to_be_visible()
            assert page.locator('[name="price"]').evaluate('(el)=>parseFloat(getComputedStyle(el).fontSize)') >= 16
            page.locator('[name="price"]').fill('125')
            page.get_by_role('button', name='Salvar alterações').tap()
            assert '125,00' in page.locator('#tableBody').inner_text()
        if section == 'planejamento':
            page.locator('[data-task]').tap()
            page.locator('[name="progress"]').fill('50')
            page.get_by_role('button', name='Salvar alterações').tap()
            assert 'Em andamento' in page.locator('#tableBody').inner_text()
            page.locator('[data-mode="gantt"]').tap()
            assert page.locator('.gantt').count() == 1
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('[data-mode="list"]').tap()
    if width == 390:
        page.screenshot(path=f'/tmp/riviera-{name}-mobile.png', full_page=True)
    assert not errors, errors
    context.close()
    print(f'PASS {name} {width}px: navigation, touch charts, mobile cards, edits, dates/progress, Gantt, no page overflow or errors.')

with sync_playwright() as p:
    chromium = p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in [375,390,430]: check(chromium,width,'chromium')
    chromium.close()
    if Path(p.webkit.executable_path).exists():
        webkit = p.webkit.launch(headless=True)
        check(webkit,390,'webkit')
        webkit.close()
    else:
        print('WebKit NOT RUN: browser runtime not installed. Physical iPhone testing remains outstanding.')
