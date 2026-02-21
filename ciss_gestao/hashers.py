"""
Custom password hashers.

FastPBKDF2PasswordHasher: usado apenas em desenvolvimento (DEBUG=True).
Usa 1.000 iterações ao invés das ~870.000 padrão do Django 5, tornando
a verificação de senha instantânea durante o desenvolvimento.

⚠️  NUNCA use em produção — o hash resultante é fraco.
"""

from django.contrib.auth.hashers import PBKDF2PasswordHasher


class FastPBKDF2PasswordHasher(PBKDF2PasswordHasher):
    """
    Versão com iterações reduzidas do PBKDF2 para uso em dev.
    Django vai re-hashear a senha automaticamente no próximo login
    bem-sucedido, atualizando para o hasher prioritário da lista.
    """
    iterations = 1_000
