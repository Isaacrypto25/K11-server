#!/usr/bin/env python3
"""
K11 OMNI ELITE — Provisionamento de Usuários
══════════════════════════════════════════════
Cria/atualiza usuários na tabela k11_users do Supabase.
Usa PBKDF2-SHA256 idêntico ao do server-auth.js.

USO:
    python3 k11-create-users.py                  # cria usuários do USERS list
    python3 k11-create-users.py --ldap 73001234  # cria/atualiza um usuário
    python3 k11-create-users.py --list           # lista usuários existentes
    python3 k11-create-users.py --reset 73001234 # reseta PIN de um usuário

VARIÁVEIS DE AMBIENTE (ou .env na raiz):
    SUPABASE_URL
    SUPABASE_SERVICE_KEY   (usar service_role, não anon)
"""

import os, sys, hashlib, secrets, json, argparse
from datetime import datetime

# ── Tenta carregar .env ────────────────────────────────────────
def _load_env():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if not os.path.exists(env_path):
        env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    os.environ.setdefault(k.strip(), v.strip().strip('"\''))

_load_env()

# ── PBKDF2-SHA256 (mesmo algoritmo do Node.js) ─────────────────
ITERATIONS = 310_000
KEY_LEN    = 32
DIGEST     = 'sha256'

def hash_pin(pin: str) -> str:
    """Retorna string no formato pbkdf2$salt$dk_hex"""
    salt = secrets.token_hex(32)
    dk   = hashlib.pbkdf2_hmac(DIGEST, pin.encode(), salt.encode(), ITERATIONS, KEY_LEN)
    return f'pbkdf2${salt}${dk.hex()}'

def verify_pin(pin: str, stored: str) -> bool:
    try:
        _, salt, expected_hex = stored.split('$')
        dk       = hashlib.pbkdf2_hmac(DIGEST, pin.encode(), salt.encode(), ITERATIONS, KEY_LEN)
        expected = bytes.fromhex(expected_hex)
        return secrets.compare_digest(dk, expected)
    except Exception:
        return False

# ── Supabase HTTP client mínimo ────────────────────────────────
try:
    import urllib.request, urllib.error
    HAS_URLLIB = True
except ImportError:
    HAS_URLLIB = False

def _supabase_request(method: str, path: str, body=None):
    url = os.environ['SUPABASE_URL'].rstrip('/') + '/rest/v1/' + path.lstrip('/')
    key = os.environ['SUPABASE_SERVICE_KEY']
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(
        url, data=data, method=method,
        headers={
            'apikey':        key,
            'Authorization': f'Bearer {key}',
            'Content-Type':  'application/json',
            'Prefer':        'return=representation',
        }
    )
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        raise RuntimeError(f'HTTP {e.code}: {err}')

# ── Lista de usuários iniciais ─────────────────────────────────
# Formato: (ldap, nome, email, pin, role, loja)
# ⚠️  Troque os PINs antes de usar em produção!
INITIAL_USERS = [
    ('73001001', 'Admin K11',        'admin@obramax.com.br',      '12345678', 'admin',       'Centro'),
    ('73001002', 'Gestor Central',   'gcentral@obramax.com.br',   '12345678', 'gestor',      'Centro'),
    ('73001003', 'Operador 01',      'op01@obramax.com.br',       '87654321', 'operacional', 'Tijuca'),
    ('73001004', 'Operador 02',      'op02@obramax.com.br',       '11223344', 'operacional', 'Barra'),
]

# ── Funções ────────────────────────────────────────────────────

def create_user(ldap, nome, email, pin, role='operacional', loja=None, verbose=True):
    if len(ldap) != 8 or not ldap.startswith('7300'):
        print(f'  ❌ LDAP inválido: {ldap} (deve ter 8 dígitos e começar com 7300)')
        return False

    pin_hash = hash_pin(pin)
    payload  = {
        'ldap':          ldap,
        'nome':          nome,
        'email':         email,
        'pin_hash':      pin_hash,
        'role':          role,
        'loja':          loja,
        'ativo':         True,
        'pin_confirmado':True,
        'created_at':    datetime.utcnow().isoformat() + 'Z',
        'updated_at':    datetime.utcnow().isoformat() + 'Z',
    }

    try:
        # Tenta UPSERT (insere ou atualiza por ldap)
        result = _supabase_request(
            'POST',
            'k11_users?on_conflict=ldap',
            payload
        )
        if verbose:
            print(f'  ✅ {ldap} | {nome} | {role} | {loja or "—"}')
        return True
    except RuntimeError as e:
        if verbose:
            print(f'  ❌ {ldap} | Erro: {e}')
        return False


def list_users():
    try:
        users = _supabase_request('GET', 'k11_users?select=ldap,nome,email,role,loja,ativo,created_at&order=created_at.desc')
        if not users:
            print('Nenhum usuário encontrado.')
            return
        print(f'\n{"LDAP":<10} {"Nome":<25} {"Role":<14} {"Loja":<15} {"Ativo":<6}')
        print('─' * 75)
        for u in users:
            print(f'{u["ldap"]:<10} {u["nome"]:<25} {u["role"]:<14} {(u["loja"] or "—"):<15} {"✅" if u["ativo"] else "❌"}')
        print(f'\nTotal: {len(users)} usuário(s)')
    except RuntimeError as e:
        print(f'Erro ao listar: {e}')


def reset_pin(ldap, new_pin):
    pin_hash = hash_pin(new_pin)
    try:
        _supabase_request(
            'PATCH',
            f'k11_users?ldap=eq.{ldap}',
            {'pin_hash': pin_hash, 'updated_at': datetime.utcnow().isoformat() + 'Z'}
        )
        print(f'  ✅ PIN do LDAP {ldap} redefinido.')
    except RuntimeError as e:
        print(f'  ❌ Erro ao redefinir PIN: {e}')


# ── CLI ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='K11 — Provisionamento de Usuários')
    parser.add_argument('--list',   action='store_true', help='Lista usuários existentes')
    parser.add_argument('--ldap',   type=str,            help='LDAP do usuário a criar/atualizar')
    parser.add_argument('--nome',   type=str,            help='Nome completo')
    parser.add_argument('--email',  type=str,            help='Email @obramax.com.br')
    parser.add_argument('--pin',    type=str,            help='PIN (mínimo 6 dígitos)')
    parser.add_argument('--role',   type=str,            default='operacional', help='operacional|gestor|admin')
    parser.add_argument('--loja',   type=str,            help='Nome da loja')
    parser.add_argument('--reset',  type=str,            help='LDAP para resetar PIN')
    parser.add_argument('--verify', type=str, nargs=2,   metavar=('HASH', 'PIN'), help='Verifica um PIN contra um hash')
    parser.add_argument('--seed',   action='store_true', help='Cria todos os usuários iniciais da lista INITIAL_USERS')
    args = parser.parse_args()

    # Verifica variáveis de ambiente
    if not args.verify:
        missing = [v for v in ('SUPABASE_URL', 'SUPABASE_SERVICE_KEY') if not os.environ.get(v)]
        if missing:
            print(f'❌ Variáveis faltando: {", ".join(missing)}')
            print('Configure no .env ou exporte antes de rodar.')
            sys.exit(1)

    if args.verify:
        stored, pin = args.verify
        ok = verify_pin(pin, stored)
        print('✅ PIN válido' if ok else '❌ PIN inválido')
        return

    if args.list:
        list_users()
        return

    if args.reset:
        pin = args.pin or input(f'Novo PIN para {args.reset}: ').strip()
        reset_pin(args.reset, pin)
        return

    if args.seed:
        print(f'\n📦 Criando {len(INITIAL_USERS)} usuários iniciais...')
        ok = sum(create_user(l, n, e, p, r, lo) for l, n, e, p, r, lo in INITIAL_USERS)
        print(f'\n✅ {ok}/{len(INITIAL_USERS)} usuários criados/atualizados.')
        return

    if args.ldap:
        nome  = args.nome  or input('Nome completo: ').strip()
        email = args.email or input('Email (@obramax.com.br): ').strip()
        pin   = args.pin   or input('PIN (mínimo 6 dígitos): ').strip()
        if len(pin) < 6:
            print('❌ PIN deve ter mínimo 6 dígitos.')
            sys.exit(1)
        print(f'\nCriando usuário {args.ldap}...')
        create_user(args.ldap, nome, email, pin, args.role, args.loja)
        return

    # Sem argumentos: mostra ajuda + lista de usuários configurados
    parser.print_help()
    print('\n\nUsuários pré-configurados em INITIAL_USERS:')
    for ldap, nome, email, pin, role, loja in INITIAL_USERS:
        print(f'  {ldap} | {nome} | {role} | PIN: {pin}')
    print('\nUse --seed para criá-los no Supabase.')


if __name__ == '__main__':
    main()
