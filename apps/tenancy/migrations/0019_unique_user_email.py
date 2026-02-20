"""
Adiciona um indice unico parcial sobre auth_user.email, ignorando e-mails
vazios (Django permite email em branco no modelo padrao).

A verificacao e case-insensitive no PostgreSQL (LOWER) e case-sensitive
no SQLite -- porem todas as views ja normalizam o e-mail para lowercase
antes de salvar, entao um indice regular resolve os dois bancos.
"""
from django.db import migrations


_CREATE_INDEX = """
CREATE UNIQUE INDEX IF NOT EXISTS auth_user_email_unique
ON auth_user (email)
WHERE email <> '';
"""

_DROP_INDEX = """
DROP INDEX IF EXISTS auth_user_email_unique;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0018_userprofile'),
    ]

    operations = [
        migrations.RunSQL(
            sql=_CREATE_INDEX,
            reverse_sql=_DROP_INDEX,
            hints={'target_db': 'default'},
        ),
    ]
