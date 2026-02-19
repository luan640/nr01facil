from urllib.parse import quote

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.shortcuts import redirect, render
from django.urls import get_script_prefix, reverse, set_script_prefix

from .context import reset_current_company_id, set_current_company_id
from .models import Company, Consultancy
from .session import (
    get_active_memberships_for_user,
    resolve_default_company_id,
    user_has_company_access,
    user_is_consultancy_owner,
)


class ConsultancyPathMiddleware:
    EXEMPT_PREFIXES = (
        '/admin/',
        '/static/',
        '/media/',
        '/healthz/',
        '/__debug__/',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        original_prefix = get_script_prefix()
        consultancy = self._resolve_consultancy(request)
        request.consultancy = consultancy
        request.consultancy_id = consultancy.id if consultancy else None
        request.consultancy_slug = consultancy.slug if consultancy else None

        if consultancy:
            prefix = f'/{consultancy.slug}'
            self._strip_prefix(request, prefix)
            set_script_prefix(f'{prefix}/')

        try:
            response = self.get_response(request)
        finally:
            set_script_prefix(original_prefix)

        if consultancy:
            self._scope_redirect(response, consultancy.slug)
        return response

    def _resolve_consultancy(self, request):
        path = request.path_info or '/'
        if any(path.startswith(prefix) for prefix in self.EXEMPT_PREFIXES):
            return None
        pieces = [part for part in path.split('/') if part]
        if not pieces:
            return None
        slug = pieces[0].strip().lower()
        if not slug:
            return None
        return Consultancy.objects.filter(slug=slug, is_active=True).first()

    @staticmethod
    def _strip_prefix(request, prefix: str) -> None:
        path_info = request.path_info or '/'
        if not path_info.startswith(prefix):
            return
        stripped = path_info[len(prefix):] or '/'
        if not stripped.startswith('/'):
            stripped = f'/{stripped}'
        request.path_info = stripped
        request.path = stripped
        request.META['PATH_INFO'] = stripped
        request.META['SCRIPT_NAME'] = prefix

    @staticmethod
    def _scope_redirect(response, slug: str) -> None:
        location = response.headers.get('Location')
        if not location or not location.startswith('/'):
            return
        scoped_prefix = f'/{slug}/'
        if location.startswith(scoped_prefix):
            return
        if location.startswith('/admin/'):
            return
        response.headers['Location'] = f"/{slug}{location}"


class CompanyContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._is_exempt(request.path):
            token = set_current_company_id(None)
            try:
                request.company_id = None
                return self.get_response(request)
            finally:
                reset_current_company_id(token)

        company_id = self._resolve_company_id(request)
        if company_id is None:
            if request.user.is_authenticated:
                if request.user.is_superuser:
                    token = set_current_company_id(None)
                    try:
                        request.company_id = None
                        return self.get_response(request)
                    finally:
                        reset_current_company_id(token)
                if user_is_consultancy_owner(
                    request.user,
                    getattr(request, 'consultancy_id', None),
                ):
                    token = set_current_company_id(None)
                    try:
                        request.company_id = None
                        return self.get_response(request)
                    finally:
                        reset_current_company_id(token)
                if (not request.user.is_superuser) and (
                    not get_active_memberships_for_user(
                        request.user,
                        consultancy_id=getattr(request, 'consultancy_id', None),
                    ).exists()
                ):
                    return render(request, 'errors/inactive_company.html', status=403)
                return self._redirect_to_company_select(request)
            token = set_current_company_id(None)
            try:
                request.company_id = None
                return self.get_response(request)
            finally:
                reset_current_company_id(token)

        token = set_current_company_id(company_id)
        try:
            request.company_id = company_id
            return self.get_response(request)
        finally:
            reset_current_company_id(token)

    def _resolve_company_id(self, request):
        if request.user.is_authenticated:
            return self._resolve_authenticated_company_id(request)
        return self._extract_company_id(request)

    def _resolve_authenticated_company_id(self, request):
        consultancy_id = getattr(request, 'consultancy_id', None)
        session_company_id = request.session.get('company_id')
        if session_company_id:
            try:
                session_company_id = int(session_company_id)
            except (TypeError, ValueError):
                session_company_id = None

        if session_company_id and user_has_company_access(
            request.user,
            session_company_id,
            consultancy_id=consultancy_id,
        ):
            return session_company_id

        default_company_id = resolve_default_company_id(
            request.user,
            consultancy_id=consultancy_id,
        )
        if default_company_id is None:
            return None
        request.session['company_id'] = default_company_id
        return default_company_id

    def _extract_company_id(self, request):
        consultancy_id = getattr(request, 'consultancy_id', None)
        header_name = settings.TENANCY_COMPANY_HEADER
        raw_company_id = request.headers.get(header_name)
        if raw_company_id is None:
            return None
        try:
            company_id = int(raw_company_id)
        except ValueError as exc:
            raise PermissionDenied(f'Invalid {header_name} value.') from exc

        if consultancy_id is not None and not Company.objects.filter(
            id=company_id,
            consultancy_id=consultancy_id,
            is_active=True,
        ).exists():
            raise PermissionDenied('Company does not belong to active consultancy.')
        return company_id

    @staticmethod
    def _is_exempt(path: str) -> bool:
        return any(
            path.startswith(prefix)
            for prefix in settings.TENANCY_EXEMPT_PATH_PREFIXES
        )

    @staticmethod
    def _redirect_to_company_select(request):
        next_url = request.get_full_path()
        target = f"{reverse('company-select')}?next={quote(next_url, safe='/?:=&')}"
        response = redirect(target)
        if request.headers.get('HX-Request') == 'true':
            response.headers['HX-Redirect'] = target
        return response
