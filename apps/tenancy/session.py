from django.db.models import Q
from django.utils import timezone

from .models import Company, CompanyMembership, ConsultancyMembership, UserProfile

# ---------------------------------------------------------------------------
# Per-request caches stored on the user object.
#
# Django keeps the same user instance throughout the request, so setting
# attributes on it is a cheap way to avoid repeated identical DB queries.
# Cache attributes are prefixed with '_nr1_' to avoid collisions.
# ---------------------------------------------------------------------------

_CONSULTANCY_CACHE = '_nr1_consultancy_memberships'
_COMPANY_CACHE     = '_nr1_company_memberships'


def _get_consultancy_memberships(user) -> list:
    """
    Returns all active ConsultancyMemberships for *user*.
    Result is a plain list and is cached on the user instance for the
    lifetime of the request (one DB hit per request at most).
    """
    cached = getattr(user, _CONSULTANCY_CACHE, None)
    if cached is None:
        cached = list(
            ConsultancyMembership.objects.select_related('consultancy').filter(
                user=user,
                is_active=True,
                consultancy__is_active=True,
            )
        )
        setattr(user, _CONSULTANCY_CACHE, cached)
    return cached


def _user_is_consultancy_owner(user, consultancy_id: int | None = None) -> bool:
    for m in _get_consultancy_memberships(user):
        if consultancy_id is not None and m.consultancy_id != consultancy_id:
            continue
        if m.role in ConsultancyMembership.OWNER_ROLES:
            return True
    return False


def _get_company_memberships(user) -> list:
    """
    Returns all active CompanyMemberships for *user* (respecting expiry for
    non-owners).  Result is a plain list cached on the user instance.
    """
    cached = getattr(user, _COMPANY_CACHE, None)
    if cached is None:
        is_owner = _user_is_consultancy_owner(user)
        qs = CompanyMembership.objects.select_related('company').filter(
            user=user,
            is_active=True,
            company__is_active=True,
        )
        if not is_owner:
            today = timezone.localdate()
            qs = qs.filter(
                Q(company__access_expires_on__isnull=True)
                | Q(company__access_expires_on__gte=today)
            )
        cached = list(qs)
        setattr(user, _COMPANY_CACHE, cached)
    return cached


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_active_memberships_for_user(user, consultancy_id: int | None = None):
    """
    Returns a list (not QuerySet) of active CompanyMemberships for *user*.
    The full list is cached; filtering by consultancy is done in Python.
    """
    memberships = _get_company_memberships(user)
    if consultancy_id is not None:
        memberships = [
            m for m in memberships
            if m.company.consultancy_id == consultancy_id
        ]
    return memberships


def resolve_default_company_id(user, consultancy_id: int | None = None):
    if user.is_superuser:
        return None
    memberships = get_active_memberships_for_user(user, consultancy_id=consultancy_id)
    default = next((m for m in memberships if m.is_default), None)
    if default:
        return default.company_id
    first = memberships[0] if memberships else None
    return first.company_id if first else None


def user_has_company_access(
    user,
    company_id: int,
    consultancy_id: int | None = None,
) -> bool:
    if user.is_superuser:
        qs = Company.objects.filter(id=company_id, is_active=True)
        if consultancy_id is not None:
            qs = qs.filter(consultancy_id=consultancy_id)
        return qs.exists()
    if _user_is_consultancy_owner(user, consultancy_id):
        # Consultancy owner can access any active company in their consultancy.
        qs = Company.objects.filter(id=company_id, is_active=True)
        if consultancy_id is not None:
            qs = qs.filter(consultancy_id=consultancy_id)
        return qs.exists()
    return any(
        m.company_id == company_id
        for m in get_active_memberships_for_user(user, consultancy_id=consultancy_id)
    )


def get_membership_for_company(
    user,
    company_id: int,
    consultancy_id: int | None = None,
):
    return next(
        (
            m for m in get_active_memberships_for_user(user, consultancy_id=consultancy_id)
            if m.company_id == company_id
        ),
        None,
    )


def user_is_company_admin(
    user,
    company_id: int,
    consultancy_id: int | None = None,
) -> bool:
    if user.is_superuser:
        return True
    membership = get_membership_for_company(user, company_id, consultancy_id=consultancy_id)
    if membership is None:
        return False
    return membership.role in CompanyMembership.ADMIN_ROLES


def get_active_consultancy_memberships_for_user(user):
    """Returns the cached list of active ConsultancyMemberships."""
    return _get_consultancy_memberships(user)


def get_user_consultancy_id(user) -> int | None:
    """
    Returns the consultancy_id for the user's membership.
    Returns None for ADM (superuser) and users without any consultancy link.
    """
    if user is None or not user.is_authenticated or user.is_superuser:
        return None
    memberships = _get_consultancy_memberships(user)
    return memberships[0].consultancy_id if memberships else None


def user_is_consultancy_owner(user, consultancy_id: int | None) -> bool:
    if user.is_superuser:
        return True
    if consultancy_id is None:
        return False
    return _user_is_consultancy_owner(user, consultancy_id)


# ---------------------------------------------------------------------------
# User-type helpers
# ---------------------------------------------------------------------------

def get_user_type(user) -> str | None:
    if user is None or not user.is_authenticated:
        return None
    if user.is_superuser:
        return 'ADM'
    try:
        return user.profile.user_type
    except UserProfile.DoesNotExist:
        return None


def is_adm(user) -> bool:
    return bool(user and user.is_authenticated and user.is_superuser)


def is_consultor(user) -> bool:
    return get_user_type(user) == UserProfile.UserType.CONSULTOR


def is_empresa(user) -> bool:
    return get_user_type(user) == UserProfile.UserType.EMPRESA


def consultor_registration_complete(user) -> bool:
    if not is_consultor(user):
        return True
    try:
        return user.profile.registration_complete
    except UserProfile.DoesNotExist:
        return False


def company_has_empresa_access(company_id: int) -> bool:
    return UserProfile.objects.filter(
        user_type=UserProfile.UserType.EMPRESA,
        user__company_memberships__company_id=company_id,
        user__company_memberships__is_active=True,
    ).exists()

