import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('retirement', Path(__file__).parents[1] / 'scripts/roster_retirement.py')
retirement = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retirement)
PORTRAIT = '11111111-1111-4111-8111-111111111111'
TEAM_IMAGE = '22222222-2222-4222-8222-222222222222'


def fixture():
    content = {'welcomeTitle': 'Välkommen', 'contactEmail': 'coach@example.test', 'contacts': [{'name': 'Kontakt', 'email': 'coach@example.test'}],
               'heroImageId': TEAM_IMAGE, 'heroAlt': 'Lagbild', 'rosterDetails': [{'memberKey': 'private-key', 'imageId': PORTRAIT, 'shirtNumber': '8'}]}
    return {'teams': [{'id': 'f14'}], 'admin_users': [{'email': 'coach@example.test'}], 'admin_team_assignments': [{'email': 'coach@example.test', 'team_id': 'f14'}],
            'team_content_state': [{'team_id': 'f14', 'season': 'current', 'draft_version': 4, 'draft_json': json.dumps(content), 'published_revision_id': 'revision', 'updated_by': None, 'updated_at': 'before'}],
            'team_content_revisions': [{'id': 'revision', 'team_id': 'f14', 'content_json': json.dumps(content), 'published_by': 'coach@example.test'}],
            'team_images': [{'id': key, 'team_id': 'f14', 'object_key': f'teams/f14/{key}.webp'} for key in [PORTRAIT, TEAM_IMAGE]],
            'team_seasons': [{'team_id': 'f14', 'season': 'current', 'publication_authorized': 1, 'welcome_title': 'Välkommen'}],
            'team_roster_snapshots': [{'players_json': '[{"name":"Private player"}]'}], 'roster_sync_status': [{'status': 'success'}], 'retired_roster_images': [], 'admin_audit': []}


def test_plan_removes_only_roster_data_and_preserves_team_content_and_permissions():
    data = fixture()
    result = retirement.plan(data, at='now')
    assert [r['id'] for r in result['images']] == [PORTRAIT]
    for table in ['teams', 'admin_users', 'admin_team_assignments']:
        assert result['expected'][table] == data[table]
    for table, key in [('team_content_state', 'draft_json'), ('team_content_revisions', 'content_json')]:
        clean = json.loads(result['expected'][table][0][key])
        assert clean['rosterDetails'] == [] and clean['heroImageId'] == TEAM_IMAGE
        assert clean['contacts'] == json.loads(data[table][0][key])['contacts']
    assert result['expected']['team_content_state'][0]['draft_version'] == 5
    assert result['expected']['team_content_state'][0]['published_revision_id'] == 'revision'
    assert not result['expected']['team_roster_snapshots']
    assert not result['expected']['roster_sync_status']
    assert [r['id'] for r in result['expected']['team_images']] == [TEAM_IMAGE]
    assert data['team_content_state'][0]['draft_version'] == 4


def test_portrait_reused_as_hero_is_removed_with_name_alternative():
    value = {'heroImageId': PORTRAIT, 'heroAlt': 'Private name', 'photoPublicationConfirmed': True, 'rosterDetails': []}
    clean = retirement.clean_content(json.dumps(value), {PORTRAIT})
    assert clean['heroImageId'] is None and clean['heroAlt'] is None
    assert clean['photoPublicationConfirmed'] is False


def test_historical_and_recorded_portraits_remain_retired_without_current_membership():
    data = fixture()
    data['team_content_state'][0]['draft_json'] = '{}'
    assert retirement.portrait_ids(data) == {PORTRAIT}
    data['team_content_revisions'] = []
    data['retired_roster_images'] = [{'image_id': PORTRAIT, 'team_id': 'f14'}]
    assert retirement.portrait_ids(data) == {PORTRAIT}


@pytest.mark.parametrize('key', ['../outside.webp', f'teams/p11/{PORTRAIT}.webp', 'https://external.test/image'])
def test_object_deletion_refuses_unsafe_or_foreign_keys(key):
    data = fixture()
    data['team_images'][0]['object_key'] = key
    with pytest.raises(ValueError):
        retirement.plan(data, at='now')


def test_version_guards_and_bound_json_preserve_sql_metacharacters():
    data = fixture()
    raw = json.loads(data['team_content_state'][0]['draft_json'])
    raw['welcomeTitle'] = "O'Connor; DROP TABLE teams;"
    data['team_content_state'][0]['draft_json'] = json.dumps(raw)
    result = retirement.plan(data, at='now')
    sql, params, expected = next(c for c in result['commands'] if c[0].startswith('UPDATE team_content_state'))
    assert 'draft_version=?' in sql and 'draft_json=?' in sql and expected == 1
    assert raw['welcomeTitle'] not in sql and raw['welcomeTitle'] in params[0]


def test_verification_detects_unrelated_changes():
    result = retirement.plan(fixture(), at='now')
    retirement.verify(result['expected'], result['expected'])
    actual = fixture()
    with pytest.raises(ValueError):
        retirement.verify(result['expected'], actual)
