from urllib.parse import quote

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.shortcuts import redirect, render
from django.urls import reverse

from .context import reset_current_company_id, set_current_company_id
from .models import Company
from .session import (
    consultor_registration_complete,
    get_active_memberships_for_user,
    get_user_consultancy_id,
    is_consultor,
    resolve_default_company_id,
    user_has_company_access,
    user_is_consultancy_owner,
)


class CompanyContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Resolve consultancy from the authenticated user's membership.
        # This replaces the previous URL-slug-based approach.
        request.consultancy_id = (
            get_user_consultancy_id(request.user)
            if request.user.is_authenticated
            else None
        )

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
                    )
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
        header_name = settings.TENANCY_COMPANY_HEADER
        raw_company_id = request.headers.get(header_name)
        if raw_company_id is None:
            return None
        try:
            return int(raw_company_id)
        except ValueError as exc:
            raise PermissionDenied(f'Invalid {header_name} value.') from exc

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


class ConsultorOnboardingMiddleware:
    """
    Redireciona CONSULTORs que ainda nao completaram o cadastro da consultoria
    para a pagina de configuracoes (master-settings), onde podem preencher
    CNPJ, razao social e logo.

    Exempcoes: caminhos de admin, auth, static, media e a propria pagina de
    configuracoes (para evitar loop infinito).
    """

    EXEMPT_SUFFIXES = (
        '/admin/',
        '/auth/',
        '/static/',
        '/media/',
        '/healthz/',
        '/__debug__/',
        '/master/settings/',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if (
            request.user.is_authenticated
            and is_consultor(request.user)
            and not consultor_registration_complete(request.user)
            and not self._is_exempt(request.path)
        ):
            settings_url = reverse('master-settings')
            return redirect(settings_url)
        return self.get_response(request)

    @staticmethod
    def _is_exempt(path: str) -> bool:
        return any(path.startswith(suffix) for suffix in ConsultorOnboardingMiddleware.EXEMPT_SUFFIXES)
