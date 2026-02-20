from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.core.exceptions import ValidationError

from .models import Company, CompanyMembership, Consultancy, ConsultancyMembership, UserProfile

User = get_user_model()


# ---------------------------------------------------------------------------
# Formularios com validacao de unicidade de e-mail
# ---------------------------------------------------------------------------

class UniqueEmailCreationForm(UserCreationForm):
    """Impede a criacao de dois usuarios com o mesmo e-mail."""

    def clean_email(self):
        email = (self.cleaned_data.get('email') or '').strip().lower()
        if email and User.objects.filter(email__iexact=email).exists():
            raise ValidationError('Ja existe um usuario cadastrado com este e-mail.')
        return email


class UniqueEmailChangeForm(UserChangeForm):
    """Impede a edicao de um usuario para um e-mail ja utilizado por outro."""

    class Meta(UserChangeForm.Meta):
        model = User
        fields = '__all__'

    def clean_email(self):
        email = (self.cleaned_data.get('email') or '').strip().lower()
        if email:
            qs = User.objects.filter(email__iexact=email)
            if self.instance and self.instance.pk:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise ValidationError('Ja existe um usuario cadastrado com este e-mail.')
        return email


# ---------------------------------------------------------------------------
# Inline: mostra o perfil de plataforma na pagina do usuario
# ---------------------------------------------------------------------------
class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name = 'Perfil de plataforma'
    verbose_name_plural = 'Perfil de plataforma'
    fields = ('user_type', 'registration_complete')
    extra = 0


# Reregistra o User padrao do Django com o inline de perfil e formularios
# que validam unicidade de e-mail.
try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass


@admin.register(User)
class UserWithProfileAdmin(BaseUserAdmin):
    form = UniqueEmailChangeForm
    add_form = UniqueEmailCreationForm
    # Django 6 introduced 'usable_password' in BaseUserAdmin.add_fieldsets,
    # but it is a form-only widget (not a model field) and causes FieldError
    # when Django admin tries to resolve it via modelform_factory.
    # We override add_fieldsets here to exclude it.
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': ('username', 'email', 'password1', 'password2'),
            },
        ),
    )
    inlines = (UserProfileInline,)


# ---------------------------------------------------------------------------
# Modelos de tenancy
# ---------------------------------------------------------------------------

@admin.register(Consultancy)
class ConsultancyAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'slug', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'slug')


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'consultancy', 'slug', 'is_active', 'access_expires_on')
    list_filter = ('consultancy', 'is_active')
    search_fields = ('name', 'slug', 'consultancy__name')


@admin.register(CompanyMembership)
class CompanyMembershipAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'company', 'role', 'is_default', 'is_active')
    list_filter = ('company', 'is_default', 'is_active')
    search_fields = ('user__username', 'user__email', 'company__name')


@admin.register(ConsultancyMembership)
class ConsultancyMembershipAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'consultancy', 'role', 'is_default', 'is_active')
    list_filter = ('consultancy', 'is_default', 'is_active')
    search_fields = ('user__username', 'user__email', 'consultancy__name')


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """
    Permite ao ADM visualizar/editar os perfis de plataforma sem
    precisar acessar a pagina do usuario.
    """
    list_display = ('id', 'user', 'user_type', 'registration_complete', 'created_at')
    list_filter = ('user_type', 'registration_complete')
    search_fields = ('user__username', 'user__email')
    readonly_fields = ('created_at', 'updated_at')
