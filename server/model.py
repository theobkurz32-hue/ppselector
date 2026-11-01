"""Versioned project model and server-side validation shared by API and operators."""
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import copy
import math
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException

MAX_SAFE_CENTS = 9007199254740991


def numeric(value, lower, upper):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lower <= value <= upper:
        raise HTTPException(422, 'Valor numérico fora do intervalo permitido.')
    return value


def date_value(value):
    try:
        parsed = date.fromisoformat(value)
        if str(parsed) != value or not date(2000, 1, 1) <= parsed <= date(2100, 12, 31):
            raise ValueError()
        return parsed
    except (ValueError, TypeError):
        raise HTTPException(422, 'Data inválida: use AAAA-MM-DD entre 2000 e 2100.')


def workdays(start, end, holidays=()):
    return sum((start + timedelta(days=i)).weekday() < 5 and str(start + timedelta(days=i)) not in holidays for i in range((end - start).days + 1))


def monetary_cents(quantity, price):
    try:
        amount = (Decimal(str(quantity)) * Decimal(str(price))).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        cents = int(amount * 100)
    except (InvalidOperation, ValueError, TypeError, OverflowError):
        raise HTTPException(422, 'Valor monetário inválido.')
    if not 0 <= cents <= MAX_SAFE_CENTS:
        raise HTTPException(422, 'Valor excede o limite financeiro seguro.')
    return cents


def require_safe_cents(value):
    if not 0 <= value <= MAX_SAFE_CENTS:
        raise HTTPException(422, 'Total excede o limite financeiro seguro.')
    return value


def original_baseline(template):
    weights = {task['id']: 0 for task in template['tasks']}
    for resource in template['resources']:
        # Round each resource once, the same monetary convention used by the client.
        weights[resource['serviceId']] += monetary_cents(resource['quantity'], resource['price'])
    weights = {key: cents / 100 for key, cents in weights.items()}
    return {'approvedAt': None, 'weights': weights, 'tasks': {t['id']: {'start': t['start'], 'end': t['end']} for t in template['tasks']}, 'calendar': copy.deepcopy(template.get('calendar', {'holidays': []}))}


def migrate_project(candidate, template):
    """Add fields without changing the user's editable quantities, costs, dates or progress."""
    result = copy.deepcopy(candidate)
    if result.get('version') not in (1, 2):
        raise HTTPException(422, 'Versão de projeto incompatível.')
    if result.get('version') == 1 or not isinstance(result.get('baseline'), dict) or 'weights' not in result['baseline']:
        result['baseline'] = original_baseline(template)
    result['version'] = 2
    result.setdefault('calendar', {'holidays': []})
    result.setdefault('expenses', [])
    result['baseline'].setdefault('calendar', copy.deepcopy(result['calendar']))
    for task in result['tasks']:
        task.setdefault('dependencies', [])
    return result


def validate_calendar(value):
    if not isinstance(value, dict) or set(value) != {'holidays'} or not isinstance(value['holidays'], list) or len(value['holidays']) > 3660:
        raise HTTPException(422, 'Calendário inválido.')
    holidays = value['holidays']
    if any(not isinstance(day, str) for day in holidays) or len(set(holidays)) != len(holidays):
        raise HTTPException(422, 'Feriados inválidos ou duplicados.')
    for day in holidays:
        date_value(day)
    return {'holidays': sorted(holidays)}


def validate_baseline(value, task_ids):
    if not isinstance(value, dict) or set(value) != {'approvedAt', 'weights', 'tasks', 'calendar'}:
        raise HTTPException(422, 'Linha-base inválida.')
    approved = value['approvedAt']
    if approved is not None:
        try:
            stamp = datetime.fromisoformat(approved.replace('Z', '+00:00'))
            if stamp.tzinfo is None or len(approved) > 40:
                raise ValueError()
        except (AttributeError, ValueError, TypeError):
            raise HTTPException(422, 'Data de aprovação da linha-base inválida.')
    weights = value['weights']
    tasks = value['tasks']
    if not isinstance(weights, dict) or set(weights) != task_ids or not isinstance(tasks, dict) or set(tasks) != task_ids:
        raise HTTPException(422, 'A linha-base deve conter todas as atividades da obra.')
    cleaned_weights = {key: numeric(weight, 0, 10**15) for key, weight in weights.items()}
    require_safe_cents(sum(monetary_cents(weight, 1) for weight in cleaned_weights.values()))
    if sum(cleaned_weights.values()) <= 0:
        raise HTTPException(422, 'A linha-base deve possuir pelo menos um peso positivo.')
    cleaned_tasks = {}
    for key, task in tasks.items():
        if not isinstance(task, dict) or set(task) != {'start', 'end'}:
            raise HTTPException(422, 'Período da linha-base inválido.')
        start, end = date_value(task['start']), date_value(task['end'])
        if end < start:
            raise HTTPException(422, 'Período da linha-base inválido.')
        cleaned_tasks[key] = {'start': task['start'], 'end': task['end']}
    return {'approvedAt': approved, 'weights': cleaned_weights, 'tasks': cleaned_tasks, 'calendar': validate_calendar(value['calendar'])}


def canonical_project(candidate, template, *, existing=None, allow_baseline=False):
    """Only supported editable fields survive; identities and descriptions stay trusted."""
    if candidate.get('version') not in (1, 2) or candidate.get('project') != template['project']:
        raise HTTPException(422, 'Backup ou projeto incompatível.')
    legacy = candidate.get('version') == 1
    migrated = migrate_project(candidate, template)
    result = migrate_project(template, template)
    result['area'] = numeric(migrated.get('area'), .01, 10000000)
    result['reserve'] = numeric(migrated.get('reserve'), 0, 1)
    task_ids = {t['id'] for t in template['tasks']}
    service_ids = {s['id'] for s in template['services']}
    result['calendar'] = validate_calendar(migrated.get('calendar'))
    holidays = result['calendar']['holidays']
    direct_cents = 0
    for field in ('resources', 'tasks'):
        rows = migrated.get(field)
        if not isinstance(rows, list) or len(rows) != len(template[field]):
            raise HTTPException(422, 'Estrutura do projeto incompatível.')
        for row, original, target in zip(rows, template[field], result[field]):
            if not isinstance(row, dict) or row.get('id') != original['id']:
                raise HTTPException(422, 'Identificador de item inválido.')
            if field == 'resources':
                if any(row.get(key) != original[key] for key in ('serviceId', 'phase', 'nature')):
                    raise HTTPException(422, 'Vínculo do insumo inválido.')
                target['quantity'] = numeric(row.get('quantity'), 0, 100000000)
                target['price'] = numeric(row.get('price'), 0, 100000000)
                direct_cents += monetary_cents(target['quantity'], target['price'])
                require_safe_cents(direct_cents)
                continue
            target['progress'] = numeric(row.get('progress'), 0, 1)
            start, end = date_value(row.get('start')), date_value(row.get('end'))
            if end < start:
                raise HTTPException(422, 'Período da atividade inválido.')
            duration = workdays(start, end, holidays)
            if duration == 0:
                raise HTTPException(422, 'A atividade precisa incluir pelo menos um dia útil no calendário da obra.')
            text = row.get('predecessor')
            if not isinstance(text, str) or len(text) > 250:
                raise HTTPException(422, 'Predecessora inválida.')
            dependencies = row.get('dependencies', [])
            if not isinstance(dependencies, list) or len(dependencies) > len(task_ids) or any(not isinstance(dep, str) or dep not in task_ids or dep == row['id'] for dep in dependencies) or len(dependencies) != len(set(dependencies)):
                raise HTTPException(422, 'Dependências inválidas na atividade.')
            target.update(start=row['start'], end=row['end'], predecessor=text, duration=duration, dependencies=dependencies)
    reserve_cents = int((Decimal(direct_cents) * Decimal(str(result['reserve']))).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    require_safe_cents(direct_cents + reserve_cents)
    graph = {task['id']: task['dependencies'] for task in result['tasks']}
    visiting, visited = set(), set()
    def visit(node):
        if node in visiting:
            raise HTTPException(422, 'As dependências do cronograma não podem formar um ciclo.')
        if node in visited:
            return
        visiting.add(node)
        for parent in graph[node]:
            visit(parent)
        visiting.remove(node)
        visited.add(node)
    for node in graph:
        visit(node)
    proposed_baseline = validate_baseline(migrated.get('baseline'), task_ids)
    current_baseline = migrate_project(existing or template, template)['baseline']
    if existing is not None and legacy:
        proposed_baseline = copy.deepcopy(current_baseline)
    if not allow_baseline and proposed_baseline != current_baseline:
        raise HTTPException(403, 'Somente o administrador pode aprovar ou alterar a linha-base.')
    result['baseline'] = proposed_baseline if allow_baseline else copy.deepcopy(current_baseline)
    expenses = migrated.get('expenses')
    if not isinstance(expenses, list) or len(expenses) > 10000:
        raise HTTPException(422, 'Lista de despesas inválida ou muito grande.')
    expense_ids, cleaned, expense_total = set(), [], 0
    for expense in expenses:
        if not isinstance(expense, dict):
            raise HTTPException(422, 'Despesa inválida.')
        try:
            expense_id = str(UUID(expense.get('id')))
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(422, 'Identificador da despesa inválido.')
        if expense_id != expense['id'] or expense_id in expense_ids:
            raise HTTPException(422, 'Identificador da despesa inválido ou duplicado.')
        expense_ids.add(expense_id)
        if expense.get('serviceId') not in service_ids:
            raise HTTPException(422, 'Serviço da despesa inválido.')
        name = expense.get('name')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 200:
            raise HTTPException(422, 'Informe uma descrição de até 200 caracteres para a despesa.')
        amount = expense.get('amount')
        if isinstance(amount, bool) or not isinstance(amount, int) or not 0 <= amount <= 10**12:
            raise HTTPException(422, 'O valor da despesa deve ser um inteiro não negativo em centavos.')
        expense_total += amount
        require_safe_cents(expense_total)
        issued, due = expense.get('date'), expense.get('dueDate')
        date_value(issued)
        date_value(due)
        status, paid = expense.get('status'), expense.get('paidAt')
        if status not in ('planned', 'paid') or (status == 'planned' and paid is not None) or (status == 'paid' and paid is None):
            raise HTTPException(422, 'Estado de pagamento da despesa inválido.')
        if paid is not None:
            if date_value(paid) > datetime.now(ZoneInfo('America/Sao_Paulo')).date():
                raise HTTPException(422, 'A data de um pagamento realizado não pode estar no futuro.')
        cleaned.append({'id': expense_id, 'serviceId': expense['serviceId'], 'name': name.strip(), 'date': issued, 'dueDate': due, 'amount': amount, 'status': status, 'paidAt': paid})
    result['expenses'] = cleaned
    return result


def changes(before, after):
    changed = []
    for key in ('area', 'reserve', 'calendar', 'baseline'):
        if before.get(key) != after.get(key):
            changed.append({'item': 'project', 'field': key, 'before': before.get(key), 'after': after.get(key)})
    for group, fields in [('resources', ('quantity', 'price')), ('tasks', ('start', 'end', 'progress', 'predecessor', 'dependencies'))]:
        for old, new in zip(before[group], after[group]):
            for key in fields:
                if old.get(key) != new.get(key):
                    changed.append({'item': new['id'], 'field': key, 'before': old.get(key), 'after': new.get(key)})
    old_expenses = {e['id']: e for e in before.get('expenses', [])}
    new_expenses = {e['id']: e for e in after.get('expenses', [])}
    for key in sorted(old_expenses.keys() | new_expenses.keys()):
        if old_expenses.get(key) != new_expenses.get(key):
            changed.append({'item': key, 'field': 'expense', 'before': old_expenses.get(key), 'after': new_expenses.get(key)})
    return changed
