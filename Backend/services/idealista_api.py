import requests
import requests.exceptions
import os
import time
from dotenv import load_dotenv

load_dotenv()

class IdealistaAPI:
    """Client for the Idealista API."""

    def __init__(self):
        self.api_key = os.getenv("IDEALISTA_API_KEY")
        self.secret = os.getenv("IDEALISTA_SECRET")
        self.token = None

    def get_access_token(self):
        try:
            auth = requests.auth.HTTPBasicAuth(self.api_key, self.secret)
            response = requests.post(
                "https://api.idealista.com/oauth/token",
                data={"grant_type": "client_credentials"},
                auth=auth,
                timeout=10
            )
            response.raise_for_status()
            self.token = response.json().get("access_token")
            return self.token
        except requests.exceptions.RequestException as e:
            print(f"[Idealista] ❌ Error obteniendo token: {e}")
            return None
        except Exception as e:
            print(f"[Idealista] ❌ Error inesperado: {e}")
            raise

    def _post_with_retry(self, params, headers, max_attempts=3):
        """POST with exponential backoff on 5xx and connection errors.
        4xx errors are permanent and return None without retrying.
        Returns the Response on success, None on exhaustion/permanent failure.
        """
        for attempt in range(max_attempts):
            try:
                resp = requests.post(
                    "https://api.idealista.com/3.5/es/search",
                    headers=headers,
                    data=params,
                    timeout=20,
                )
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
                if attempt < max_attempts - 1:
                    wait = 2 ** attempt
                    print(f"[Idealista] ⚠️ {type(e).__name__}, reintento en {wait}s ({attempt+1}/{max_attempts})")
                    time.sleep(wait)
                    continue
                print(f"[Idealista] ❌ Falló tras {max_attempts} intentos: {e}")
                return None
            except requests.exceptions.RequestException as e:
                print(f"[Idealista] ❌ Error inesperado: {e}")
                return None

            # 429 (rate limit) is transient — retry honoring Retry-After if set.
            if resp.status_code == 429:
                if attempt < max_attempts - 1:
                    retry_after = resp.headers.get("Retry-After", "")
                    wait = int(retry_after) if retry_after.isdigit() else 2 ** (attempt + 2)
                    print(f"[Idealista] ⚠️ HTTP 429 (rate limit), esperando {wait}s ({attempt+1}/{max_attempts})")
                    time.sleep(wait)
                    continue
                print(f"[Idealista] ❌ HTTP 429 tras {max_attempts} intentos")
                return None

            if 500 <= resp.status_code < 600:
                if attempt < max_attempts - 1:
                    wait = 2 ** attempt
                    print(f"[Idealista] ⚠️ HTTP {resp.status_code}, reintento en {wait}s ({attempt+1}/{max_attempts})")
                    time.sleep(wait)
                    continue
                print(f"[Idealista] ❌ HTTP {resp.status_code} tras {max_attempts} intentos")
                return None

            if resp.status_code >= 400:
                print(f"[Idealista] ❌ HTTP {resp.status_code}: {resp.text[:200]}")
                return None

            return resp
        return None

    def _paginate(self, params_base, num_pages):
        headers = {"Authorization": f"Bearer {self.token}"}
        all_results = []
        pages_used = 0
        effective_pages = num_pages
        for page in range(1, num_pages + 1):
            if page > effective_pages:
                break
            params = {**params_base, "numPage": page}

            resp = self._post_with_retry(params, headers)
            if resp is None:
                break

            pages_used += 1
            data = resp.json()

            # Cap the loop to the real number of pages the zone has.
            # Idealista counts every POST against the monthly quota, even if
            # it returns an empty page, so overshooting num_pages burns calls.
            if page == 1:
                total_pages = int(data.get("totalPages") or num_pages)
                effective_pages = min(num_pages, total_pages)
                if effective_pages < num_pages:
                    print(f"[Idealista] ℹ️ totalPages={total_pages}, limitando a {effective_pages} (pedidas {num_pages})")

            batch = data.get("elementList", [])
            if not batch:
                break
            all_results.extend(batch)
            time.sleep(1.5)
        return all_results, pages_used

    def search_by_area(
        self,
        locationId=None,
        center=None,
        distance=None,
        operation="rent",
        property_type="homes",
        max_items=50,
        num_pages=3,
    ):
        """Search properties by coordinates or locationId."""
        if not (self.token or self.get_access_token()):
            return {"error": "No se pudo obtener token de acceso"}

        params_base = {
            "country": "es",
            "operation": operation,
            "propertyType": property_type,
            "maxItems": max_items,
            "locale": "es",
        }

        if locationId:
            params_base["locationId"] = locationId
        elif center and distance:
            params_base["center"] = center
            params_base["distance"] = distance
        else:
            return {"error": "Debe indicarse locationId o center+distance"}

        all_results, pages_used = self._paginate(params_base, num_pages)
        print(f"[Idealista] ✅ Total resultados obtenidos: {len(all_results)} ({pages_used} páginas usadas)")
        return {"elementList": all_results, "total": len(all_results), "pages_used": pages_used}

    def search_by_area_name(self, area_name, operation="rent", property_type="homes", max_items=50, num_pages=3):
        """Search properties by free text name."""
        if not (self.token or self.get_access_token()):
            return {"error": "No se pudo obtener token de acceso"}

        params_base = {
            "country": "es",
            "operation": operation,
            "propertyType": property_type,
            "maxItems": max_items,
            "locale": "es",
            "q": area_name,
        }

        all_results, pages_used = self._paginate(params_base, num_pages)
        print(f"[Idealista] ✅ Resultados obtenidos por nombre '{area_name}': {len(all_results)} ({pages_used} páginas usadas)")
        return {"elementList": all_results, "total": len(all_results), "pages_used": pages_used}
