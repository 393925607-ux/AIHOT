"""Reuse KR's existing provider store and Vault reader, then exec AIHOT.

No secret file, stdout export, second credential store, or SDK is created.
The selected cc-switch record is the same one used by the KR router launcher.
"""
import json
import os
import pathlib
import re
import sqlite3
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
env = os.environ.copy()

def configured(name, text):
    match = re.search(r'^\s*' + re.escape(name) + r'\s*=\s*"([^"\n]+)"', text, re.M)
    return match.group(1) if match else None

def runtime():
    if not all(env.get(k) for k in ('LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL')):
        home = pathlib.Path.home()
        cfg = (home / '.codex/config.toml').read_text()
        catalog = json.loads((home / '.local/lib/all-model-router/model-catalog.json').read_text())
        alias = configured('model', cfg)
        route = next((m for m in catalog['models'] if m.get('slug') == alias), None)
        if not route or route.get('routing_provider') != 'oci':
            raise RuntimeError('Current KR model has no verified OCI route; provide runtime LLM_*')
        # Same credential retrieval as all-model-router/launcher.py, read-only.
        with sqlite3.connect('file:' + str(home / '.cc-switch/cc-switch.db') + '?mode=ro', uri=True) as db:
            row = db.execute('SELECT settings_config FROM providers WHERE app_type=? AND id=?', ('codex', 'oci-genai')).fetchone()
        if not row:
            raise RuntimeError('Existing OCI provider is missing')
        provider = json.loads(row[0])
        key = provider.get('auth', {}).get('OPENAI_API_KEY') or configured('experimental_bearer_token', provider.get('config', ''))
        base = configured('base_url', provider.get('config', ''))
        if not key or not base or not base.startswith('https://inference.generativeai.'):
            raise RuntimeError('Existing OCI provider is incomplete')
        env.update(LLM_BASE_URL=base, LLM_API_KEY=key, LLM_MODEL=route['upstream_model'])
    env.setdefault('LLM_EXTRA_JSON', '{"reasoning_effort":"low"}')
    env.setdefault('LLM_JSON_MODE', 'true')
    if not all(env.get(k) for k in ('EMBEDDING_BASE_URL', 'EMBEDDING_API_KEY', 'EMBEDDING_MODEL')):
        # Read only provider metadata, never call OpenViking or Shared Memory.
        text = pathlib.Path('/etc/openviking-hybrid/openviking.env').read_text()
        metadata = dict(re.findall(r'^(OPENVIKING_EMBEDDING_(?:API_BASE|MODEL))=(.+)$', text, re.M))
        base = metadata.get('OPENVIKING_EMBEDDING_API_BASE', '').strip('"\'')
        model = metadata.get('OPENVIKING_EMBEDDING_MODEL', '').strip('"\'')
        if base != 'https://openrouter.ai/api/v1' or not model:
            raise RuntimeError('Existing embedding runtime metadata is not usable')
        result = subprocess.run(['/usr/local/libexec/jev-openrouter-embedding-key'], capture_output=True, text=True, timeout=45)
        key = result.stdout.strip()
        if result.returncode or not key or '\n' in key or '\r' in key:
            raise RuntimeError('Embedding Vault reader failed')
        env.update(EMBEDDING_BASE_URL=base, EMBEDDING_API_KEY=key, EMBEDDING_MODEL=model)
    env['MODEL_CALLS_ENABLED'] = 'true'

try:
    runtime()
    # Reuse the local MVP DB. The host wrapper never emits the connection string.
    if not env.get('DATABASE_URL'):
        result = subprocess.run(['podman', 'inspect', 'aihot-mvp-db'], capture_output=True, text=True, timeout=10)
        db_env = json.loads(result.stdout)[0]['Config']['Env']
        db = dict(v.split('=', 1) for v in db_env if '=' in v)
        from urllib.parse import quote
        env['DATABASE_URL'] = 'postgres://{}:{}@127.0.0.1:55432/{}'.format(quote(db['POSTGRES_USER']), quote(db['POSTGRES_PASSWORD']), quote(db['POSTGRES_DB']))
    mode = sys.argv[1] if len(sys.argv) > 1 else 'reprocess'
    commands = {'smoke': 'scripts/insights-model-smoke.ts', 'reprocess': 'scripts/reprocess-insights.ts', 'collect': 'scripts/collect-insights.ts', 'testimony': 'scripts/collect-github-testimony.ts', 'claim-validity': 'scripts/phase4-claim-validity.ts', 'coverage': 'scripts/phase5-coverage.ts', 'cross-platform': 'scripts/phase6-cross-platform.ts', 'claim-gate': 'scripts/phase6-claim-gate.ts', 'claim-depth': 'scripts/phase5-claim-depth.ts', 'group-demands': 'scripts/phase5-group-demands.ts', 'golden': 'scripts/phase6-golden.ts', 'claim-discovery': 'scripts/claim-discovery.ts', 'claim-audit': 'scripts/dual-recovery-claim-audit.ts', 'claim-replay': 'scripts/dual-recovery-claim-replay.ts', 'demand-discovery': 'scripts/demand-discovery.ts', 'demand-source-probe': 'scripts/demand-source-probe.ts', 'claim-discovery-diag': 'scripts/claim-discovery-diag.ts', 'claim-discovery-error-diag': 'scripts/claim-discovery-error-diag.ts', 'demands-zh-only': 'scripts/refresh-demand-zh.ts', 'calibrate-demand-selection': 'scripts/calibrate-demand-selection.ts'}
    if mode not in commands:
        raise RuntimeError('Use one of: ' + ', '.join(commands))
    os.chdir(root)
    os.execvpe('node', ['node', commands[mode], *sys.argv[2:]], env)
except Exception as error:
    # No provider payloads or subprocess stderr are printed.
    print('Insight runtime unavailable: ' + type(error).__name__, file=sys.stderr)
    sys.exit(1)
