from django.db.models import Q
from django.utils import timezone

from .models import Company, CompanyMembership, ConsultancyMembership


def _user_is_consultancy_owner(user, consultancy_id: int | None = None) -> bool:
    queryset = ConsultancyMembership.objects.filter(
        user=user,
        is_active=True,
        consultancy__is_active=True,
        role__in=ConsultancyMembership.OWNER_ROLES,
    )
    if consultancy_id is not None:
        queryset = queryset.filter(consultancy_id=consultancy_id)
    return queryset.exists()


def get_active_memberships_for_user(user, consultancy_id: int | None = None):
    queryset = CompanyMembership.objects.select_related('company').filter(
        user=user,
        is_active=True,
        company__is_active=True,
    )
    if not _user_is_consultancy_owner(user, consultancy_id=consultancy_id):
        today = timezone.localdate()
        queryset = queryset.filter(
            Q(company__access_expires_on__isnull=True)
            | Q(company__access_expires_on__gte=today)
        )
    if consultancy_id is not None:
        queryset = queryset.filter(company__consultancy_id=consultancy_id)
    return queryset


def resolve_default_company_id(user, consultancy_id: int | None = None):
    if user.is_superuser:
        return None
    memberships = get_active_memberships_for_user(user, consultancy_id=consultancy_id)
    default_membership = memberships.filter(is_default=True).first()
    if default_membership:
        return default_membership.company_id
    first_membership = memberships.first()
    if first_membership:
        return first_membership.company_id
    return None


def user_has_company_access(
    user,
    company_id: int,
    consultancy_id: int | None = None,
) -> bool:
    if user.is_superuser:
        queryset = Company.objects.filter(id=company_id, is_active=True)
        if consultancy_id is not None:
            queryset = queryset.filter(consultancy_id=consultancy_id)
        return queryset.exists()
    if _user_is_consultancy_owner(user, consultancy_id=consultancy_id):
        queryset = Company.objects.filter(id=company_id, is_active=True)
        if consultancy_id is not None:
            queryset = queryset.filter(consultancy_id=consultancy_id)
        return queryset.exists()
    return get_active_memberships_for_user(
        user,
        consultancy_id=consultancy_id,
    ).filter(company_id=company_id).exists()


def get_membership_for_company(
    user,
    company_id: int,
    consultancy_id: int | None = None,
):
    return get_active_memberships_for_user(
        user,
        consultancy_id=consultancy_id,
    ).filter(company_id=company_id).first()


def user_is_company_admin(
    user,
    company_id: int,
    consultancy_id: int | None = None,
) -> bool:
    if user.is_superuser:
        return True
    membership = get_membership_for_company(
        user,
        company_id,
        consultancy_id=consultancy_id,
    )
    if membership is None:
        return False
    return membership.role in CompanyMembership.ADMIN_ROLES


def get_active_consultancy_memberships_for_user(user):
    return ConsultancyMembership.objects.select_related('consultancy').filter(
        user=user,
        is_active=True,
        consultancy__is_active=True,
    )


def user_is_consultancy_owner(user, consultancy_id: int | None) -> bool:
    if user.is_superuser:
        return True
    if consultancy_id is None:
        return False
    membership = get_active_consultancy_memberships_for_user(user).filter(
        consultancy_id=consultancy_id,
    ).first()
    if membership is None:
        return False
    return membership.role in ConsultancyMembership.OWNER_ROLES
