from django.conf import settings
import os
from django.core.validators import MinValueValidator, RegexValidator
from django.utils import timezone
from django.utils.text import get_valid_filename
from django.db import models
from django.db.models import Q

from .context import get_current_company_id
from .managers import TenantManager


cnpj_validator = RegexValidator(
    regex=r'^\d{14}$',
    message='CNPJ deve conter 14 digitos numericos.',
)


def company_logo_upload_to(instance, filename):
    base, ext = os.path.splitext(get_valid_filename(filename))
    timestamp = timezone.now().strftime('%y%m%d%H%M%S')
    return f'companies/{instance.slug}/logo/{timestamp}{ext.lower()}'


def consultancy_logo_upload_to(instance, filename):
    base, ext = os.path.splitext(get_valid_filename(filename))
    timestamp = timezone.now().strftime('%y%m%d%H%M%S')
    return f'consultancies/{instance.slug}/logo/{timestamp}{ext.lower()}'


class Company(models.Model):
    consultancy = models.ForeignKey(
        'tenancy.Consultancy',
        on_delete=models.PROTECT,
        related_name='companies',
        blank=True,
        null=True,
    )
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    legal_representative_name = models.CharField(max_length=255, blank=True)
    responsible_email = models.EmailField(max_length=255, blank=True)
    assessment_type = models.CharField(max_length=20, blank=True)
    cnae = models.CharField(max_length=20, blank=True)
    risk_level = models.PositiveSmallIntegerField(default=1)
    unit_type = models.CharField(max_length=20, blank=True)
    unit_name = models.CharField(max_length=255, blank=True)
    cnpj = models.CharField(
        max_length=14,
        unique=True,
        validators=[cnpj_validator],
        blank=True,
        null=True,
    )
    employee_count = models.PositiveIntegerField(
        default=0,
        validators=[MinValueValidator(0)],
    )
    max_users = models.PositiveIntegerField(default=0)
    max_totems = models.PositiveIntegerField(default=0)
    address_street = models.CharField(max_length=255, blank=True)
    address_number = models.CharField(max_length=40, blank=True)
    address_complement = models.CharField(max_length=120, blank=True)
    address_neighborhood = models.CharField(max_length=120, blank=True)
    address_city = models.CharField(max_length=120, blank=True)
    address_state = models.CharField(max_length=2, blank=True)
    address_zipcode = models.CharField(max_length=10, blank=True)
    logo = models.ImageField(
        upload_to=company_logo_upload_to,
        max_length=255,
        blank=True,
        null=True,
    )
    slug = models.SlugField(max_length=80, unique=True)
    is_active = models.BooleanField(default=True)
    access_expires_on = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'companies'
        ordering = ['name']

    def __str__(self) -> str:
        return self.name

    def has_valid_access(self, reference_date=None) -> bool:
        if not self.is_active:
            return False
        if self.access_expires_on is None:
            return True
        if reference_date is None:
            reference_date = timezone.localdate()
        return reference_date <= self.access_expires_on


class Consultancy(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=80, unique=True)
    cnpj = models.CharField(
        max_length=14,
        unique=True,
        validators=[cnpj_validator],
        blank=True,
        null=True,
    )
    location = models.CharField(max_length=255, blank=True)
    logo = models.ImageField(
        upload_to=consultancy_logo_upload_to,
        max_length=255,
        blank=True,
        null=True,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'consultancies'
        ordering = ['name']

    def __str__(self) -> str:
        return self.name

class CompanyMembership(models.Model):
    class Role(models.TextChoices):
        ADMIN_EMPRESA = 'ADMIN_EMPRESA', 'Admin Empresa'
        GESTOR = 'GESTOR', 'Gestor'
        RH = 'RH', 'RH'
        COLABORADOR = 'COLABORADOR', 'Colaborador'
        OWNER = 'OWNER', 'Owner'
        MEMBER = 'MEMBER', 'Member'

    ADMIN_ROLES = {Role.ADMIN_EMPRESA, Role.OWNER}

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='company_memberships',
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    role = models.CharField(
        max_length=30,
        choices=Role.choices,
        default=Role.COLABORADOR,
    )
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'company_memberships'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'company'],
                name='tenancy_membership_unique_user_company',
            ),
            models.UniqueConstraint(
                fields=['user'],
                condition=Q(is_default=True),
                name='tenancy_membership_single_default_company',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.user} -> {self.company}'


class ConsultancyMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = 'OWNER', 'Owner'
        MEMBER = 'MEMBER', 'Member'

    OWNER_ROLES = {Role.OWNER}

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='consultancy_memberships',
    )
    consultancy = models.ForeignKey(
        Consultancy,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    role = models.CharField(
        max_length=30,
        choices=Role.choices,
        default=Role.MEMBER,
    )
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'consultancy_memberships'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'consultancy'],
                name='tenancy_membership_unique_user_consultancy',
            ),
            models.UniqueConstraint(
                fields=['user'],
                condition=Q(is_default=True),
                name='tenancy_membership_single_default_consultancy',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.user} -> {self.consultancy}'


class TenantModel(models.Model):
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        related_name='%(app_label)s_%(class)s_set',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.company_id is None:
            company_id = get_current_company_id()
            if company_id is not None:
                self.company_id = company_id
        super().save(*args, **kwargs)


class UserProfile(models.Model):
    """
    Estende o usuario de autenticacao do Django com o tipo de acesso na
    plataforma.

    Tipos de usuario:
      - CONSULTOR: criado pelo ADM; pode criar N empresas; precisa completar
        o cadastro da consultoria apos o primeiro login.
      - EMPRESA: criado pelo CONSULTOR; acesso unico por empresa; representa
        o login da empresa-cliente na plataforma.

    O ADM nao precisa de perfil -- e identificado por ``is_superuser=True``.
    """

    class UserType(models.TextChoices):
        CONSULTOR = 'CONSULTOR', 'Consultor'
        EMPRESA = 'EMPRESA', 'Empresa'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    user_type = models.CharField(
        max_length=20,
        choices=UserType.choices,
    )
    # Usado para CONSULTORs: marca se o cadastro da consultoria foi preenchido
    # apos o primeiro login.
    registration_complete = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_profiles'

    def __str__(self) -> str:
        return f'{self.user} ({self.get_user_type_display()})'

    # ------------------------------------------------------------------
    # Validacao de regra de negocio: empresa so pode ter 1 acesso
    # ------------------------------------------------------------------
    def clean(self):
        from django.core.exceptions import ValidationError

        if self.user_type == self.UserType.EMPRESA:
            # A empresa ja deve ter um CompanyMembership no momento em que o
            # perfil e criado. Verifica se alguma outra empresa ja esta
            # associada a uma empresa-cliente.
            membership = (
                CompanyMembership.objects.filter(user=self.user)
                .select_related('company')
                .first()
            )
            if membership:
                company = membership.company
                existing = (
                    UserProfile.objects.filter(
                        user_type=self.UserType.EMPRESA,
                        user__company_memberships__company=company,
                    )
                    .exclude(user=self.user)
                    .exists()
                )
                if existing:
                    raise ValidationError(
                        f'A empresa "{company}" ja possui um acesso ativo. '
                        'Cada empresa pode ter no maximo 1 acesso.'
                    )
