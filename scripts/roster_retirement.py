"""Pure, testable cleanup planning. No network, credentials or automatic deletion."""
import copy
import json
import re


def portrait_ids(tables):
    ids = {row['image_id'] for row in tables.get('retired_roster_images', [])}
    for table, field in [('team_content_state', 'draft_json'), ('team_content_revisions', 'content_json')]:
        for row in tables.get(table, []):
            value = json.loads(row[field])
            if not isinstance(value, dict) or not isinstance(value.get('rosterDetails', []), list):
                raise ValueError('Invalid editorial storage')
            ids.update(d['imageId'] for d in value.get('rosterDetails', []) if d.get('imageId'))
    if any(not isinstance(key, str) or not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', key) for key in ids):
        raise ValueError('Invalid portrait identity')
    return ids


def clean_content(raw, retired):
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError('Invalid editorial content')
    value['rosterDetails'] = []
    if value.get('heroImageId') in retired:
        value['heroImageId'] = None
        value['heroAlt'] = None
        value['photoPublicationConfirmed'] = False
    return value


def plan(tables, *, additional_portraits=(), actor='system:roster-retirement', at):
    """Return parameterized mutations plus a preservation oracle; never print it."""
    data = copy.deepcopy(tables)
    retired = portrait_ids(tables) | set(additional_portraits)
    # Validate extra identities with exactly the same policy.
    portrait_ids({'retired_roster_images': [{'image_id': key} for key in retired]})
    images = {row['id']: row for row in tables['team_images']}
    removals = [images[key] for key in sorted(retired) if key in images]
    for image in removals:
        if not re.fullmatch(r'teams/[a-z0-9][a-z0-9-]{0,31}/[a-f0-9-]{36}\.(?:jpg|webp)', image['object_key']):
            raise ValueError('Unexpected private object key')
        if image['object_key'].split('/')[1] != image['team_id']:
            raise ValueError('Cross-team object key')
    commands = []
    recorded = {r['image_id']: r for r in data.get('retired_roster_images', [])}
    for image in removals:
        commands.append(('INSERT OR IGNORE INTO retired_roster_images(image_id,team_id) VALUES(?,?)', [image['id'], image['team_id']], None))
        recorded[image['id']] = {'image_id': image['id'], 'team_id': image['team_id']}
    data['retired_roster_images'] = list(recorded.values())
    for table, field in [('team_content_state', 'draft_json'), ('team_content_revisions', 'content_json')]:
        for row in data[table]:
            old = row[field]
            clean = clean_content(old, retired)
            if clean == json.loads(old):
                continue
            row[field] = json.dumps(clean, ensure_ascii=False, separators=(',', ':'))
            if table == 'team_content_state':
                commands.append(('UPDATE team_content_state SET draft_json=?,draft_version=draft_version+1,updated_by=?,updated_at=? WHERE team_id=? AND season=? AND draft_version=? AND draft_json=?',
                                 [row[field], actor, at, row['team_id'], row['season'], row['draft_version'], old], 1))
                row['draft_version'] += 1
                row['updated_by'], row['updated_at'] = actor, at
            else:
                commands.append(('UPDATE team_content_revisions SET content_json=? WHERE id=? AND content_json=?', [row[field], row['id'], old], 1))
    commands.extend([('DELETE FROM team_roster_snapshots', [], None), ('DELETE FROM roster_sync_status', [], None),
                     ('UPDATE team_seasons SET publication_authorized=0', [], None)])
    data['team_roster_snapshots'], data['roster_sync_status'] = [], []
    for row in data['team_seasons']:
        row['publication_authorized'] = 0
    # Media row deletion happens only after storage deletion succeeds.
    media_commands = [('DELETE FROM team_images WHERE id=? AND object_key=?', [r['id'], r['object_key']], 1) for r in removals]
    data['team_images'] = [r for r in data['team_images'] if r['id'] not in retired]
    return {'commands': commands, 'media_commands': media_commands, 'images': removals, 'expected': data, 'retired_ids': retired}


def verify(expected, actual):
    """Compare every preserved row; errors deliberately do not include row contents."""
    for table, rows in expected.items():
        if table == 'admin_audit':
            # New maintenance audit entries may be appended; old entries must remain.
            actual_rows = {r['id']: r for r in actual[table]}
            if any(actual_rows.get(r['id']) != r for r in rows):
                raise ValueError('Existing audit history changed')
            continue
        canonical = lambda records: sorted(json.dumps(r, sort_keys=True, ensure_ascii=False) for r in records)
        if canonical(rows) != canonical(actual.get(table, [])):
            raise ValueError('Preservation verification failed: ' + table)
