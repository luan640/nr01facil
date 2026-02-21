from apps.tenancy.models import Company, Consultancy
from apps.tenancy.session import get_membership_for_company, user_is_consultancy_owner


def _safe_file_url(file_field):
    if not file_field:
        return ''
    try:
        return file_field.url
    except Exception:
        return ''


def current_company(request):
    company_id = request.session.get('company_id')
    consultancy_id = getattr(request, 'consultancy_id', None)
    company_name = ''
    consultancy_name = ''
    consultancy_logo_url = ''
    user_role_label = ''

    # Load the consultancy object from the id set by CompanyContextMiddleware.
    # For superusers without a linked consultancy, fall back to the first active one.
    # If a view already resolved and cached the object on the request, reuse it.
    consultancy = getattr(request, '_cached_consultancy', None)
    if consultancy is None:
        if consultancy_id is not None:
            consultancy = Consultancy.objects.filter(pk=consultancy_id).only('name', 'logo').first()
        elif getattr(request, 'user', None) and request.user.is_authenticated and request.user.is_superuser:
            consultancy = Consultancy.objects.filter(is_active=True).only('name', 'logo').first()
    if consultancy:
        consultancy_name = consultancy.name or ''
        consultancy_logo_url = _safe_file_url(getattr(consultancy, 'logo', None))

    if company_id:
        company_qs = Company.objects.filter(pk=company_id)
        if consultancy_id is not None:
            company_qs = company_qs.filter(consultancy_id=consultancy_id)
        company = company_qs.only('name').first()
        if company:
            company_name = company.name
        if request.user.is_authenticated:
            membership = get_membership_for_company(
                request.user,
                company_id,
                consultancy_id=consultancy_id,
            )
            if membership:
                user_role_label = membership.get_role_display()

    return {
        'current_company_name': company_name,
        'current_consultancy_name': consultancy_name,
        'current_consultancy_logo_url': consultancy_logo_url,
        'current_company_id': company_id,
        'is_master': bool(getattr(request, 'user', None) and request.user.is_authenticated and request.user.is_superuser),
        'is_consultancy_owner': bool(
            getattr(request, 'user', None)
            and request.user.is_authenticated
            and user_is_consultancy_owner(request.user, consultancy_id)
        ),
        'user_role_label': user_role_label,
    }
