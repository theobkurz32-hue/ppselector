"""Meaningful validation and backwards-compatible migration regressions."""
import copy
import json
from pathlib import Path
import unittest
from uuid import uuid4
from fastapi import HTTPException

from server.model import canonical_project, migrate_project, original_baseline

TEMPLATE = json.loads((Path(__file__).resolve().parents[1] / 'data/project.json').read_text())


class ProjectModelTests(unittest.TestCase):
    def setUp(self):
        self.project = migrate_project(TEMPLATE, TEMPLATE)

    def expense(self):
        return {'id': str(uuid4()), 'serviceId': '01.01', 'name': 'Taxa contratada', 'date': '2026-11-03', 'dueDate': '2026-11-10', 'amount': 3990, 'status': 'planned', 'paidAt': None}

    def test_v1_migration_preserves_edits_and_uses_original_weights(self):
        legacy = copy.deepcopy(TEMPLATE)
        legacy['version'] = 1
        legacy['baseline'] = {'direct': 1650800.62, 'total': 1782864.67}
        legacy['resources'][0]['quantity'] = 7
        legacy['resources'][0]['price'] = 125
        legacy['tasks'][0]['progress'] = .75
        legacy['tasks'][0]['end'] = '2026-11-15'
        result = migrate_project(legacy, TEMPLATE)
        self.assertEqual(result['version'], 2)
        self.assertEqual(result['resources'][0]['quantity'], 7)
        self.assertEqual(result['resources'][0]['price'], 125)
        self.assertEqual(result['tasks'][0]['progress'], .75)
        self.assertEqual(result['tasks'][0]['end'], '2026-11-15')
        self.assertEqual(result['baseline'], original_baseline(TEMPLATE))
        self.assertAlmostEqual(sum(result['baseline']['weights'].values()), 1650800.62)
        self.assertEqual(result['expenses'], [])

    def test_expenses_validate_integer_cents_and_unique_ids(self):
        self.project['expenses'] = [self.expense()]
        result = canonical_project(self.project, TEMPLATE)
        self.assertEqual(result['expenses'][0]['amount'], 3990)
        self.project['expenses'][0]['amount'] = 39.9
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)
        self.project['expenses'][0]['amount'] = 3990
        self.project['expenses'].append(copy.deepcopy(self.project['expenses'][0]))
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)

    def test_payment_requires_payment_date(self):
        expense = self.expense()
        expense['status'] = 'paid'
        self.project['expenses'] = [expense]
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)
        expense['paidAt'] = '2020-11-09'
        self.assertEqual(canonical_project(self.project, TEMPLATE)['expenses'][0]['paidAt'], '2020-11-09')

    def test_actual_payment_rejects_future_date(self):
        from datetime import datetime, timedelta
        from zoneinfo import ZoneInfo
        expense = self.expense()
        expense['status'] = 'paid'
        expense['paidAt'] = str(datetime.now(ZoneInfo('America/Sao_Paulo')).date() + timedelta(days=1))
        self.project['expenses'] = [expense]
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)

    def test_baseline_requires_admin_and_stays_unchanged_when_prices_change(self):
        current = copy.deepcopy(self.project)
        self.project['resources'][0]['price'] = 100
        result = canonical_project(self.project, TEMPLATE, existing=current)
        self.assertEqual(result['baseline'], current['baseline'])
        self.project['baseline']['weights']['01.01'] = 125
        with self.assertRaises(HTTPException) as error:
            canonical_project(self.project, TEMPLATE, existing=current)
        self.assertEqual(error.exception.status_code, 403)
        result = canonical_project(self.project, TEMPLATE, existing=current, allow_baseline=True)
        self.assertEqual(result['baseline']['weights']['01.01'], 125)

    def test_dependencies_reject_cycles_unknown_and_self(self):
        self.project['tasks'][0]['dependencies'] = ['01.02']
        self.project['tasks'][1]['dependencies'] = ['01.01']
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)
        self.project['tasks'][1]['dependencies'] = []
        canonical_project(self.project, TEMPLATE)
        self.project['tasks'][0]['dependencies'] = ['01.01']
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)
        self.project['tasks'][0]['dependencies'] = ['99.99']
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)

    def test_monetary_limits_cover_line_total_and_reserve(self):
        from server.model import MAX_SAFE_CENTS
        self.project['resources'][0].update(quantity=1e8, price=1e8)
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)
        self.project = migrate_project(TEMPLATE, TEMPLATE)
        for row in self.project['resources'][:2]:
            row.update(quantity=1e8, price=5e5)
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)
        self.project = migrate_project(TEMPLATE, TEMPLATE)
        self.project['resources'][0].update(quantity=1e8, price=5e5)
        self.project['reserve'] = 1
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)
        self.project = migrate_project(TEMPLATE, TEMPLATE)
        expense = self.expense()
        expense['amount'] = 10**12
        self.project['expenses'] = [{**expense, 'id': str(uuid4())} for _ in range(MAX_SAFE_CENTS // 10**12 + 1)]
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)

    def test_baseline_calendar_is_frozen_and_admin_protected(self):
        current = copy.deepcopy(self.project)
        self.project['calendar']['holidays'] = ['2026-11-04']
        result = canonical_project(self.project, TEMPLATE, existing=current)
        self.assertEqual(result['baseline']['calendar'], {'holidays': []})
        self.project['baseline']['calendar']['holidays'] = ['2026-11-04']
        with self.assertRaises(HTTPException) as error:
            canonical_project(self.project, TEMPLATE, existing=current)
        self.assertEqual(error.exception.status_code, 403)
        result = canonical_project(self.project, TEMPLATE, existing=current, allow_baseline=True)
        self.assertEqual(result['baseline']['calendar']['holidays'], ['2026-11-04'])

    def test_partial_v2_baseline_migration_preserves_weights_and_adds_calendar(self):
        partial = copy.deepcopy(self.project)
        partial['calendar']['holidays'] = ['2026-11-04']
        partial['baseline'].pop('calendar')
        partial['baseline']['weights']['01.01'] = 125
        partial['baseline']['approvedAt'] = '2026-10-01T12:00:00Z'
        migrated = migrate_project(partial, TEMPLATE)
        self.assertEqual(migrated['baseline']['weights']['01.01'], 125)
        self.assertEqual(migrated['baseline']['approvedAt'], '2026-10-01T12:00:00Z')
        self.assertEqual(migrated['baseline']['calendar']['holidays'], ['2026-11-04'])

    def test_nonworking_period_and_holiday_calendar(self):
        self.project['tasks'][0].update(start='2026-11-07', end='2026-11-08')
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)
        self.project['tasks'][0].update(start='2026-11-03', end='2026-11-06')
        self.project['calendar']['holidays'] = ['2026-11-04']
        result = canonical_project(self.project, TEMPLATE)
        self.assertEqual(result['tasks'][0]['duration'], 3)
        self.project['calendar']['holidays'].append('2026-11-04')
        with self.assertRaises(HTTPException):
            canonical_project(self.project, TEMPLATE)


if __name__ == '__main__':
    unittest.main()
